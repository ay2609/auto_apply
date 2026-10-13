import { readFileSync, writeFileSync, existsSync } from "node:fs";

/**
 * Board discovery: find ATS boards for companies we've never seen, so the
 * scout isn't limited to companies already in the DB.
 *
 * Source: yc-oss/api — daily-updated static JSON of all YC companies with an
 * isHiring flag (~1.5k hiring). We keep only robotics / hardware / aerospace /
 * defense / manufacturing / devices startups and probe each company's likely
 * Greenhouse/Lever/Ashby board slug. Discovered boards are "domain" boards:
 * their generic SWE internships count as on-target. Results (hits AND misses)
 * persist in data/scout-state.json, so probing spreads across watcher runs at
 * a bounded request budget; new YC batches get picked up as they appear.
 */

const STATE_PATH = "./data/scout-state.json";
const YC_HIRING_URL = "https://yc-oss.github.io/api/companies/hiring.json";
const YC_REFETCH_MS = 6 * 60 * 60 * 1000;
const PROBE_BUDGET_PER_RUN = 40; // companies per run (≤ ~9 requests each)

/** YC tags / industries that mark a robotics or embedded-hardware company. */
const YC_DOMAIN_RE =
  /(?<!process )\b(robot\w*|hardware|hard tech|manufactur\w*|aviation|space|aerospace|satellites?|defense|drones?|automotive|electric vehicles?|electronics|iot|semiconductors?|medical (?:devices?|robotics)|3d printing|autonomous|unmanned|nanosensors?|edge computing)\b/i;

export type DiscoveredBoard = {
  ats: "greenhouse" | "lever" | "ashby";
  token: string;
  company: string;
  /** Robotics/embedded-native board: generic engineering internships count. */
  domain: true;
};

type ScoutState = {
  lastHnScanAt?: number;
  lastGoogleScanAt?: number;
  lastWorkdayScanAt?: number;
  /** Workday tenants that completed at least one scan (first scan seeds quietly). */
  workdayScanned?: string[];
  lastYcFetchAt?: number;
  ycQueue?: Array<{ name: string; slug: string; website?: string }>;
  /** company slug → discovered board, or null when all probes missed */
  ycProbed?: Record<string, DiscoveredBoard | null>;
  /** "ats:token" keys of boards that have completed at least one poll. */
  polledBoards?: string[];
  /** Boards registered by other sources. */
  extraBoards?: DiscoveredBoard[];
};

export type DiscoverResult = { probed: number; hits: number; queueRemaining: number };

export async function discoverYcBoards(): Promise<DiscoverResult> {
  const state = loadState();
  state.ycProbed ??= {};

  // Refresh the hiring list periodically; enqueue companies we haven't probed.
  if (Date.now() - (state.lastYcFetchAt ?? 0) > YC_REFETCH_MS) {
    try {
      const res = await fetch(YC_HIRING_URL, { signal: AbortSignal.timeout(20_000) });
      const companies = (await res.json()) as Array<{
        name: string;
        slug: string;
        website?: string;
        all_locations?: string;
        regions?: string[];
        status?: string;
        industry?: string;
        subindustry?: string;
        industries?: string[];
        tags?: string[];
      }>;
      const US_RE = /(united states|america|remote|, [A-Z]{2}\b|usa)/i;
      const isDomain = (c: (typeof companies)[number]) =>
        [c.industry, c.subindustry, ...(c.industries ?? []), ...(c.tags ?? [])].some(
          (t) => !!t && YC_DOMAIN_RE.test(t),
        );
      const fresh = companies.filter(
        (c) =>
          c.status !== "Inactive" &&
          isDomain(c) &&
          (!c.all_locations || US_RE.test(c.all_locations) || (c.regions ?? []).some((r) => /america|remote/i.test(r))) &&
          !(c.slug in state.ycProbed!),
      );
      const queued = new Set((state.ycQueue ?? []).map((q) => q.slug));
      state.ycQueue = [
        ...(state.ycQueue ?? []),
        ...fresh.filter((c) => !queued.has(c.slug)).map((c) => ({ name: c.name, slug: c.slug, website: c.website })),
      ];
      state.lastYcFetchAt = Date.now();
    } catch {
      // network hiccup — try again next refetch window
    }
  }

  // Probe a bounded batch this run.
  const batch = (state.ycQueue ?? []).slice(0, PROBE_BUDGET_PER_RUN);
  let hits = 0;
  const results = await Promise.allSettled(batch.map((c) => probeCompany(c)));
  results.forEach((r, i) => {
    const company = batch[i];
    const board = r.status === "fulfilled" ? r.value : null;
    state.ycProbed![company.slug] = board;
    if (board) hits += 1;
  });
  state.ycQueue = (state.ycQueue ?? []).slice(batch.length);
  saveState(state);

  return { probed: batch.length, hits, queueRemaining: state.ycQueue.length };
}

/** All boards discovered so far (consumed by the board scout every run). */
export function getDiscoveredBoards(): DiscoveredBoard[] {
  const state = loadState();
  const probed = Object.values(state.ycProbed ?? {}).filter((b): b is DiscoveredBoard => b !== null);
  return [...probed, ...(state.extraBoards ?? [])];
}

/** Register boards found by other sources. */
export function addExtraBoards(boards: Array<{ ats: "greenhouse" | "lever" | "ashby"; token: string; company: string }>): number {
  const state = loadState();
  const existing = new Set(
    [...(state.extraBoards ?? []), ...Object.values(state.ycProbed ?? {}).filter((b) => b !== null)].map(
      (b) => `${b!.ats}:${b!.token.toLowerCase()}`,
    ),
  );
  let added = 0;
  for (const b of boards) {
    const key = `${b.ats}:${b.token.toLowerCase()}`;
    if (existing.has(key)) continue;
    existing.add(key);
    state.extraBoards = [...(state.extraBoards ?? []), { ...b, domain: true }];
    added += 1;
  }
  if (added > 0) saveState(state);
  return added;
}

async function probeCompany(c: { name: string; slug: string; website?: string }): Promise<DiscoveredBoard | null> {
  const lower = c.name.toLowerCase().trim();
  const domainBase = c.website?.match(/https?:\/\/(?:www\.)?([^./]+)/)?.[1];
  const candidates = [
    ...new Set(
      [c.slug, lower.replace(/[^a-z0-9]+/g, ""), lower.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), domainBase]
        .filter((s): s is string => !!s && s.length > 1),
    ),
  ].slice(0, 3);

  for (const token of candidates) {
    const opts = { headers: { "User-Agent": "auto-apply-scout/0.1" }, signal: AbortSignal.timeout(8_000) };
    const [gh, lv, ab] = await Promise.allSettled([
      fetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`, opts),
      fetch(`https://api.lever.co/v0/postings/${token}?mode=json&limit=1`, opts),
      fetch(`https://api.ashbyhq.com/posting-api/job-board/${token}`, opts),
    ]);
    if (gh.status === "fulfilled" && gh.value.ok) {
      const data = (await gh.value.json().catch(() => null)) as { jobs?: unknown[] } | null;
      if (data?.jobs) return { ats: "greenhouse", token, company: c.name, domain: true };
    }
    if (lv.status === "fulfilled" && lv.value.ok) {
      const data = (await lv.value.json().catch(() => null)) as unknown;
      if (Array.isArray(data)) return { ats: "lever", token, company: c.name, domain: true };
    }
    if (ab.status === "fulfilled" && ab.value.ok) {
      const data = (await ab.value.json().catch(() => null)) as { jobs?: unknown[] } | null;
      if (data?.jobs) return { ats: "ashby", token, company: c.name, domain: true };
    }
  }
  return null;
}

export function loadState(): ScoutState {
  try {
    return existsSync(STATE_PATH) ? (JSON.parse(readFileSync(STATE_PATH, "utf-8")) as ScoutState) : {};
  } catch {
    return {};
  }
}

export function saveState(s: ScoutState): void {
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}
