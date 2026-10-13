import { db } from "@/db";
import { companies, jobs, ingestRuns, type AtsType, type JobKind } from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { SOURCES, rawUrl, type RepoSource } from "./sources";
import { parseTables, parseHtmlTables } from "./markdown-table";
import { normalizeRow, type RawJobRow } from "./row-normalizer";
import { dedupeKey, coarseKey, normalizeCompany } from "./dedupe";
import { classify, isTargetLocation } from "./location";
import { isBlockedCompany } from "./blocklist";
import { detectAts } from "../ats/detect";
import { loadCoarseKeys } from "../scout/coarse";
import { isWantedPosting, searchConfig } from "../target";

/** More new jobs than this in one run = treat as backfill (don't notify/auto-draft). */
export const BACKFILL_THRESHOLD = 50;

type CollectedRow = RawJobRow & { sources: string[]; kind: JobKind };

export type PerSourceStats = Record<string, { rowsSeen: number; rowsKept: number; error?: string }>;

export type IngestResult = {
  runId: number;
  /** True when this run seeded an empty DB or mass-inserted — callers must not notify/auto-draft. */
  backfill: boolean;
  newJobIds: number[];
  newJobs: number;
  /** Rows from a source repo's first-ever ingest — inserted quietly. */
  seededFromNewSources: number;
  closedJobs: number;
  totalRowsSeen: number;
  uniqueCandidates: number;
  perSource: PerSourceStats;
};

export async function runIngest(): Promise<IngestResult> {
  const jobCountBefore = (await db.select({ n: sql<number>`count(*)` }).from(jobs))[0]?.n ?? 0;
  const [run] = await db.insert(ingestRuns).values({}).returning();

  const perSource: PerSourceStats = {};
  const collected = new Map<string, CollectedRow>();
  /** Keys of rows explicitly marked closed (🔒) in a source this run. */
  const explicitlyClosed = new Set<string>();

  for (const src of SOURCES) {
    perSource[src.key] = { rowsSeen: 0, rowsKept: 0 };
    try {
      const md = await fetchReadme(src);
      let kept = 0;
      let seen = 0;

      const tableIter = function* () {
        yield* parseTables(md);
        yield* parseHtmlTables(md);
      };
      for (const table of tableIter()) {
        let lastCompany = "";
        for (const cells of table.rows) {
          seen += 1;
          const firstCell = cells[0] ?? "";
          const isSubRow = /↳|⤷|`->`|^&nbsp;|^\s*$/i.test(firstCell);
          const row = normalizeRow(table.headers, cells);
          if (!row) continue;
          if (isSubRow && lastCompany) row.company = lastCompany;
          else lastCompany = row.company;
          const kind = isWantedPosting({ title: row.title, company: row.company, listKind: src.kind });
          if (!kind) continue;
          if (row.advancedDegree && searchConfig().excludeGradOnly) continue;

          const key = dedupeKey(row.company, row.title, row.locationRaw);
          if (row.isClosed) {
            explicitlyClosed.add(key);
            continue;
          }
          const existing = collected.get(key);
          if (existing) {
            if (!existing.sources.includes(src.key)) existing.sources.push(src.key);
            // A job in any internship list is an internship.
            if (kind === "internship") existing.kind = "internship";
          } else {
            collected.set(key, { ...row, sources: [src.key], kind });
          }
          kept += 1;
        }
      }
      perSource[src.key] = { rowsSeen: seen, rowsKept: kept };
    } catch (e) {
      perSource[src.key] = { rowsSeen: 0, rowsKept: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const totalRowsSeen = Object.values(perSource).reduce((s, x) => s + x.rowsSeen, 0);
  const now = new Date();

  // US-located rows only, split into new vs. already-known using one pass over existing keys.
  const targets = [...collected.entries()].filter(
    ([, row]) => !isBlockedCompany(row.company, { title: row.title }) && isTargetLocation(row.locationRaw),
  );
  const existingByKey = new Map(
    db
      .select({
        id: jobs.id,
        dedupeKey: jobs.dedupeKey,
        sourceRepos: jobs.sourceRepos,
        closedAt: jobs.closedAt,
        status: jobs.status,
      })
      .from(jobs)
      .all()
      .map((j) => [j.dedupeKey, j]),
  );

  const freshRows = targets.filter(([key]) => !existingByKey.has(key));
  const backfill = jobCountBefore === 0 || freshRows.length > BACKFILL_THRESHOLD;

  // A source repo's FIRST ingest contributes its whole catalog — that's
  // seeding, not releases (same semantics as first-poll scout boards).
  const seenSources = new Set([...existingByKey.values()].flatMap((j) => j.sourceRepos ?? []));

  // 1. Insert genuinely new jobs (coarse key blocks cross-source location-spelling dupes).
  const coarseKeys = loadCoarseKeys();
  const newJobIds: number[] = [];
  let seededFromNewSources = 0;
  for (const [key, row] of freshRows) {
    const ck = coarseKey(row.company, row.title, classify(row.locationRaw));
    if (coarseKeys.has(ck)) continue;
    coarseKeys.add(ck);
    const seeding = row.sources.every((s) => !seenSources.has(s));
    const companyId = await upsertCompany(row.company);
    const ats: AtsType = detectAts(row.applyUrl);
    const [inserted] = await db
      .insert(jobs)
      .values({
        companyId,
        title: row.title,
        kind: row.kind,
        locationRaw: row.locationRaw,
        locationClass: classify(row.locationRaw),
        applyUrl: row.applyUrl,
        atsType: ats,
        postedDate: row.postedDate,
        sourceRepos: row.sources,
        status: "discovered",
        dedupeKey: key,
        backfilled: backfill || seeding,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .returning({ id: jobs.id });
    if (seeding && !backfill) seededFromNewSources += 1;
    else newJobIds.push(inserted.id);
  }

  // 2. Refresh already-known jobs that are still listed: bump lastSeenAt, merge sources, reopen if needed.
  for (const [key, row] of targets) {
    const j = existingByKey.get(key);
    if (!j) continue;
    const merged = Array.from(new Set([...(j.sourceRepos ?? []), ...row.sources]));
    await db
      .update(jobs)
      .set({ lastSeenAt: now, sourceRepos: merged, closedAt: null, updatedAt: now })
      .where(eq(jobs.id, j.id));
  }

  // 3. Close jobs: explicit 🔒 rows immediately; vanished rows only when every source parsed cleanly
  //    and the job has been missing for over a day (protects against one flaky run mass-closing).
  let closedJobs = 0;
  const seenKeys = new Set(targets.map(([key]) => key));
  const explicitCloseIds = [...explicitlyClosed]
    .map((k) => existingByKey.get(k))
    .filter((j) => j && j.closedAt === null && (j.status === "discovered" || j.status === "drafted"))
    .map((j) => j!.id);
  if (explicitCloseIds.length > 0) {
    await db.update(jobs).set({ closedAt: now, updatedAt: now }).where(inArray(jobs.id, explicitCloseIds));
    closedJobs += explicitCloseIds.length;
  }

  // Healthy = fetched and parsed rows (kept may legitimately be 0 after the embedded filter).
  const allSourcesHealthy = Object.values(perSource).every((s) => !s.error && s.rowsSeen > 0);
  if (allSourcesHealthy && !backfill) {
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const vanished = db
      .select({ id: jobs.id, dedupeKey: jobs.dedupeKey, sourceRepos: jobs.sourceRepos })
      .from(jobs)
      .where(
        sql`${jobs.closedAt} IS NULL AND ${jobs.status} IN ('discovered','drafted') AND ${jobs.lastSeenAt} < ${dayAgo.getTime()}`,
      )
      .all()
      // Only list-sourced jobs can vanish from the lists; scout-found jobs are
      // closed by their own scout when the posting leaves its board.
      .filter((j) => !seenKeys.has(j.dedupeKey) && isListSourced(j.sourceRepos));
    if (vanished.length > 0) {
      await db
        .update(jobs)
        .set({ closedAt: now, updatedAt: now })
        .where(inArray(jobs.id, vanished.map((j) => j.id)));
      closedJobs += vanished.length;
    }
  }

  await db
    .update(ingestRuns)
    .set({
      finishedAt: new Date(),
      status: "ok",
      newJobs: newJobIds.length,
      closedJobs,
      backfill,
    })
    .where(eq(ingestRuns.id, run.id));

  return {
    runId: run.id,
    backfill,
    newJobIds,
    newJobs: newJobIds.length,
    seededFromNewSources,
    closedJobs,
    totalRowsSeen,
    uniqueCandidates: collected.size,
    perSource,
  };
}

function isListSourced(sourceRepos: string[] | null): boolean {
  return (sourceRepos ?? []).some((s) => !s.startsWith("scout:"));
}

async function fetchReadme(src: RepoSource): Promise<string> {
  const opts = { headers: { "User-Agent": "auto-apply/0.1" }, signal: AbortSignal.timeout(30_000) };
  const res = await fetch(rawUrl(src), opts);
  if (!res.ok) {
    if (res.status === 404) {
      const alt = await fetch(rawUrl({ ...src, branch: src.branch === "main" ? "master" : "main" }), opts);
      if (alt.ok) return alt.text();
    }
    throw new Error(`${src.key}: HTTP ${res.status}`);
  }
  return res.text();
}

export async function upsertCompany(displayName: string): Promise<number> {
  const normalized = normalizeCompany(displayName);
  const existing = db.select().from(companies).where(eq(companies.normalizedName, normalized)).all();
  if (existing.length > 0) return existing[0].id;
  const [inserted] = await db
    .insert(companies)
    .values({ name: displayName, normalizedName: normalized })
    .returning({ id: companies.id });
  return inserted.id;
}
