import { db } from "@/db";
import { jobs } from "@/db/schema";
import { upsertCompany } from "@/lib/ingest/run";
import { dedupeKey, coarseKey } from "@/lib/ingest/dedupe";
import { classify, isTargetLocation } from "@/lib/ingest/location";
import { isWantedPosting, searchConfig } from "@/lib/target";
import { loadState, saveState } from "./discover";
import { loadCoarseKeys } from "./coarse";

/**
 * Google Careers scout (Google, Waymo-adjacent hardware, Pixel/Nest, TPU silicon).
 *
 * Google's ATS isn't Greenhouse/Lever/Ashby so the board scout never sees it.
 * This polls the public HTML results pages for US intern (and, if enabled,
 * early-career) roles matching embedded / hardware / robotics searches.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BASE = "https://www.google.com/about/careers/applications/jobs/results/";
const MIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 4×/day is plenty; careers pages are heavy
const MAX_PAGES = 4;

type GooglePosting = { title: string; locationRaw: string; applyUrl: string; jobId: string; level?: "internship" | "new-grad" };

const QUERIES = ["embedded", "firmware", "hardware", "robotics", "electrical engineering", "silicon", "systems software"];

export type ScoutGoogleResult = {
  skipped: boolean;
  pages: number;
  seen: number;
  newJobIds: number[];
  seeded: number;
};

export async function scoutGoogleCareers(): Promise<ScoutGoogleResult> {
  const state = loadState();
  if (Date.now() - (state.lastGoogleScanAt ?? 0) < MIN_INTERVAL_MS) {
    return { skipped: true, pages: 0, seen: 0, newJobIds: [], seeded: 0 };
  }
  const firstScan = !state.lastGoogleScanAt;

  const postings = await fetchPostings();
  const existingKeys = new Set(db.select({ k: jobs.dedupeKey }).from(jobs).all().map((r) => r.k));
  const coarseKeys = loadCoarseKeys();
  const now = new Date();
  const newJobIds: number[] = [];
  let seeded = 0;

  for (const p of postings) {
    const kind = isWantedPosting({ title: p.title, company: "Google", listKind: p.level });
    if (!kind) continue;
    if (!isTargetLocation(p.locationRaw)) continue;
    const loc = classify(p.locationRaw);

    const key = dedupeKey("Google", p.title, p.locationRaw);
    if (existingKeys.has(key)) continue;
    const ck = coarseKey("Google", p.title, loc);
    if (coarseKeys.has(ck)) continue;
    existingKeys.add(key);
    coarseKeys.add(ck);

    const companyId = await upsertCompany("Google");
    const [inserted] = await db
      .insert(jobs)
      .values({
        companyId,
        title: p.title,
        kind,
        locationRaw: p.locationRaw,
        locationClass: loc,
        applyUrl: p.applyUrl,
        atsType: "custom",
        sourceRepos: ["scout:google-careers"],
        status: "discovered",
        dedupeKey: key,
        backfilled: firstScan,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .returning({ id: jobs.id });

    if (firstScan) seeded += 1;
    else newJobIds.push(inserted.id);
  }

  const fresh = loadState();
  fresh.lastGoogleScanAt = Date.now();
  saveState(fresh);

  return {
    skipped: false,
    pages: Math.min(MAX_PAGES, Math.max(1, Math.ceil(postings.length / 20))),
    seen: postings.length,
    newJobIds,
    seeded,
  };
}

async function fetchPostings(): Promise<GooglePosting[]> {
  const levels = searchConfig().levels;
  const targetLevels: Array<{ param: string; level: "internship" | "new-grad" }> = [
    ...(levels.includes("internship") ? [{ param: "INTERN_AND_APPRENTICE", level: "internship" as const }] : []),
    ...(levels.includes("new-grad") ? [{ param: "EARLY", level: "new-grad" as const }] : []),
  ];
  const byId = new Map<string, GooglePosting>();

  for (const { param, level } of targetLevels) {
    for (const q of QUERIES) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const url = new URL(BASE);
        url.searchParams.set("target_level", param);
        url.searchParams.set("location", "United States");
        url.searchParams.set("q", q);
        if (page > 1) url.searchParams.set("page", String(page));

        const res = await fetch(url, {
          headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
          signal: AbortSignal.timeout(20_000),
        }).catch(() => null);
        if (!res?.ok) break;
        const html = await res.text();
        const pageJobs = parseGoogleCareersHtml(html);
        if (pageJobs.length === 0) break;
        for (const j of pageJobs) if (!byId.has(j.jobId)) byId.set(j.jobId, { ...j, level });
        // Google pages are ~20 cards; stop early if short page.
        if (pageJobs.length < 10) break;
      }
    }
  }
  return [...byId.values()];
}

/** Exported for tests — parse a Google Careers results HTML page. */
export function parseGoogleCareersHtml(html: string): GooglePosting[] {
  const jobs: GooglePosting[] = [];
  const seen = new Set<string>();

  for (const m of html.matchAll(/ssk='(?:17|18):(\d+)'/g)) {
    const jobId = m[1];
    if (seen.has(jobId)) continue;
    seen.add(jobId);
    const window = html.slice(m.index ?? 0, (m.index ?? 0) + 5000);
    const titleM = window.match(/<h3[^>]*>(.*?)<\/h3>/s);
    const title = titleM ? titleM[1].replace(/<[^>]+>/g, "").trim() : "";
    const locM = window.match(/>place<\/i><span[^>]*>(.*?)<\/span>/);
    const locationRaw = locM ? locM[1].replace(/<[^>]+>/g, "").trim() : "";
    const slugM = window.match(new RegExp(`jobs/results/${jobId}(-[a-z0-9-]*)?`));
    const slug = slugM?.[0] ?? `jobs/results/${jobId}`;
    if (!title) continue;
    jobs.push({
      jobId,
      title,
      locationRaw,
      applyUrl: `https://www.google.com/about/careers/applications/${slug}`,
    });
  }
  return jobs;
}
