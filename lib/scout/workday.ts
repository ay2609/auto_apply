import { db } from "@/db";
import { jobs } from "@/db/schema";
import { sql, inArray } from "drizzle-orm";
import { upsertCompany, BACKFILL_THRESHOLD } from "@/lib/ingest/run";
import { dedupeKey, coarseKey } from "@/lib/ingest/dedupe";
import { classify, isTargetLocation } from "@/lib/ingest/location";
import { isBlockedCompany } from "@/lib/ingest/blocklist";
import { isWantedPosting, searchConfig, INTERN_RE, NEW_GRAD_RE, type Level } from "@/lib/target";
import { WORKDAY_TENANTS, type WorkdayTenant } from "./workday-tenants";
import { loadState, saveState } from "./discover";
import { loadCoarseKeys } from "./coarse";

/**
 * Workday scout. Defense primes, semiconductor companies, automakers and
 * med-device makers (NVIDIA, Northrop, Boeing, Medtronic, …) run their
 * careers sites on Workday, which no other source polls directly. The public
 * CXS JSON search API is keyless:
 *   POST https://<host>/wday/cxs/<tenant>/<site>/jobs {searchText, limit, offset}
 *
 * Searches each tenant for intern / co-op (and new-grad, if enabled), then
 * runs titles through the embedded/robotics filter. Gated to every few hours.
 * A tenant's first scan seeds quietly. Applying stays manual (Workday
 * requires an account), but the inbox links straight to the posting.
 */

const MIN_INTERVAL_MS = 3 * 60 * 60 * 1000;
const PAGE = 20; // Workday's max page size
const MAX_PAGES = 15;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type WdPosting = { title: string; externalPath: string; locationsText?: string };

export type ScoutWorkdayResult = {
  skipped: boolean;
  tenants: number;
  failed: string[];
  seen: number;
  matched: number;
  newJobIds: number[];
  seeded: number;
  closed: number;
};

export async function scoutWorkday(opts: { force?: boolean } = {}): Promise<ScoutWorkdayResult> {
  const state = loadState();
  const empty = { tenants: 0, failed: [], seen: 0, matched: 0, newJobIds: [], seeded: 0, closed: 0 };
  if (!opts.force && Date.now() - (state.lastWorkdayScanAt ?? 0) < MIN_INTERVAL_MS) {
    return { skipped: true, ...empty };
  }
  const scanned = new Set(state.workdayScanned ?? []);
  const queries = ["intern", "internship", "co-op", ...(searchConfig().levels.includes("new-grad") ? ["new grad", "university"] : [])];

  const existingKeys = new Set(db.select({ k: jobs.dedupeKey }).from(jobs).all().map((r) => r.k));
  const coarseKeys = loadCoarseKeys();
  const now = new Date();

  type Hit = { tenant: WorkdayTenant; title: string; locationRaw: string; applyUrl: string; kind: Level; seeding: boolean };
  const hits: Hit[] = [];
  const failed: string[] = [];
  /** source tag → keys still listed, for tenants scanned completely this run. */
  const liveByTenant = new Map<string, Set<string>>();
  let seen = 0;

  const BATCH = 6;
  for (let i = 0; i < WORKDAY_TENANTS.length; i += BATCH) {
    const batch = WORKDAY_TENANTS.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map((t) => searchTenant(t, queries)));
    results.forEach((r, idx) => {
      const tenant = batch[idx];
      if (r.status !== "fulfilled") {
        failed.push(tenant.company);
        return;
      }
      const seeding = !scanned.has(tenantKey(tenant));
      const live = new Set<string>();
      if (r.value.complete) {
        scanned.add(tenantKey(tenant));
        liveByTenant.set(sourceTag(tenant), live);
      }
      seen += r.value.postings.length;
      for (const p of r.value.postings) {
        const kind = isWantedPosting({ title: p.title, company: tenant.company, domainBoard: tenant.domain });
        if (!kind) continue;
        const locationRaw = p.locationsText ?? "";
        if (isBlockedCompany(tenant.company, { title: p.title })) continue;
        if (!isTargetLocation(locationRaw)) continue;
        live.add(dedupeKey(tenant.company, p.title, locationRaw));
        hits.push({
          tenant,
          title: p.title,
          locationRaw,
          applyUrl: `https://${tenant.host}/en-US/${tenant.site}${p.externalPath}`,
          kind,
          seeding,
        });
      }
    });
  }

  const fresh = hits.filter((h) => !existingKeys.has(dedupeKey(h.tenant.company, h.title, h.locationRaw)));
  const backfill = fresh.filter((h) => !h.seeding).length > BACKFILL_THRESHOLD;
  const newJobIds: number[] = [];
  let seeded = 0;
  for (const h of fresh) {
    const key = dedupeKey(h.tenant.company, h.title, h.locationRaw);
    if (existingKeys.has(key)) continue;
    const loc = classify(h.locationRaw);
    const ck = coarseKey(h.tenant.company, h.title, loc);
    if (coarseKeys.has(ck)) continue;
    existingKeys.add(key);
    coarseKeys.add(ck);
    const quiet = h.seeding || backfill;
    const companyId = await upsertCompany(h.tenant.company);
    const [inserted] = await db
      .insert(jobs)
      .values({
        companyId,
        title: h.title,
        kind: h.kind,
        locationRaw: h.locationRaw || "Unspecified",
        locationClass: loc,
        applyUrl: h.applyUrl,
        atsType: "workday",
        sourceRepos: [sourceTag(h.tenant)],
        status: "discovered",
        dedupeKey: key,
        backfilled: quiet,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .returning({ id: jobs.id });
    if (quiet) seeded += 1;
    else newJobIds.push(inserted.id);
  }

  const closed = await syncTenantJobs(liveByTenant, now);

  const latest = loadState(); // don't clobber fields other scouts wrote meanwhile
  latest.lastWorkdayScanAt = Date.now();
  latest.workdayScanned = [...scanned];
  saveState(latest);

  return { skipped: false, tenants: WORKDAY_TENANTS.length, failed, seen, matched: hits.length, newJobIds, seeded, closed };
}

function tenantKey(t: WorkdayTenant): string {
  return `${t.host}/${t.site}`.toLowerCase();
}

function sourceTag(t: WorkdayTenant): string {
  return `scout:workday:${t.tenant}/${t.site}`;
}

/** Run every query against one tenant; `complete` is false when any page failed or the cap was hit. */
async function searchTenant(t: WorkdayTenant, queries: string[]): Promise<{ postings: WdPosting[]; complete: boolean }> {
  const byPath = new Map<string, WdPosting>();
  let complete = true;
  let anyOk = false;
  for (const searchText of queries) {
    let total = Infinity;
    let page = 0;
    for (; page < MAX_PAGES && page * PAGE < total; page++) {
      const res = await fetch(`https://${t.host}/wday/cxs/${t.tenant}/${t.site}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
        body: JSON.stringify({ appliedFacets: {}, limit: PAGE, offset: page * PAGE, searchText }),
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);
      if (!res?.ok) {
        complete = false;
        break;
      }
      const data = (await res.json().catch(() => null)) as { total?: number; jobPostings?: WdPosting[] } | null;
      if (!data) {
        complete = false;
        break;
      }
      anyOk = true;
      // Workday only reports `total` on the first page.
      if (page === 0) total = data.total ?? 0;
      const postings = data.jobPostings ?? [];
      for (const p of postings) if (p.title && p.externalPath) byPath.set(p.externalPath, p);
      if (postings.length < PAGE) break;
      // Results are relevance-ranked fuzzy matches: once a page has no
      // intern/new-grad titles at all, the rest is unrelated noise.
      if (!postings.some((p) => INTERN_RE.test(p.title) || NEW_GRAD_RE.test(p.title))) break;
    }
    if (page >= MAX_PAGES) complete = false;
  }
  if (!anyOk) throw new Error(`${t.company}: Workday search failed`);
  return { postings: [...byPath.values()], complete };
}

/** Bump lastSeenAt on still-listed jobs and close vanished ones, for completely-scanned tenants. */
async function syncTenantJobs(liveByTenant: Map<string, Set<string>>, now: Date): Promise<number> {
  if (liveByTenant.size === 0) return 0;
  const rows = db
    .select({ id: jobs.id, dedupeKey: jobs.dedupeKey, sourceRepos: jobs.sourceRepos, closedAt: jobs.closedAt, status: jobs.status })
    .from(jobs)
    .where(sql`${jobs.sourceRepos} LIKE '%scout:workday:%'`)
    .all();
  const seen: number[] = [];
  const gone: number[] = [];
  for (const j of rows) {
    const tag = (j.sourceRepos ?? []).find((s) => liveByTenant.has(s));
    if (!tag) continue;
    if (liveByTenant.get(tag)!.has(j.dedupeKey)) seen.push(j.id);
    else if (j.closedAt === null && (j.status === "discovered" || j.status === "drafted")) gone.push(j.id);
  }
  if (seen.length > 0) await db.update(jobs).set({ lastSeenAt: now, closedAt: null }).where(inArray(jobs.id, seen));
  if (gone.length > 0) await db.update(jobs).set({ closedAt: now, updatedAt: now }).where(inArray(jobs.id, gone));
  return gone.length;
}
