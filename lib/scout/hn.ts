import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { upsertCompany, BACKFILL_THRESHOLD } from "@/lib/ingest/run";
import { dedupeKey, coarseKey } from "@/lib/ingest/dedupe";
import { classify, isTargetLocation } from "@/lib/ingest/location";
import { isWantedPosting, searchConfig } from "@/lib/target";
import { isBlockedCompany } from "@/lib/ingest/blocklist";
import { detectAts } from "@/lib/ats/detect";
import { loadState, saveState } from "./discover";
import { loadCoarseKeys } from "./coarse";

/**
 * HN "Ask HN: Who is hiring?" scout — hardware/robotics startups often post
 * here and nowhere else. Public Algolia API, no auth.
 * Regex prefilter → Claude extracts structured postings from matching comments.
 */

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
const MIN_INTERVAL_MS = 12 * 60 * 60 * 1000; // at most twice a day

const Extracted = z.object({
  postings: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      location: z.string(),
      applyUrl: z.string().nullable(),
      commentId: z.string(),
    }),
  ),
});

export type ScoutHnResult = { skipped: boolean; commentsScanned: number; matched: number; newJobIds: number[] };

export async function scoutHn(): Promise<ScoutHnResult> {
  const state = loadState();
  if (Date.now() - (state.lastHnScanAt ?? 0) < MIN_INTERVAL_MS) {
    return { skipped: true, commentsScanned: 0, matched: 0, newJobIds: [] };
  }
  if (!process.env.ANTHROPIC_API_KEY) return { skipped: true, commentsScanned: 0, matched: 0, newJobIds: [] };

  // Latest "Who is hiring?" thread by the whoishiring bot.
  const threadRes = await fetch(
    "https://hn.algolia.com/api/v1/search_by_date?query=%22who%20is%20hiring%22&tags=story,author_whoishiring&hitsPerPage=1",
    { signal: AbortSignal.timeout(15_000) },
  );
  const thread = (await threadRes.json()) as { hits?: Array<{ objectID: string; title: string }> };
  const storyId = thread.hits?.[0]?.objectID;
  if (!storyId) return { skipped: false, commentsScanned: 0, matched: 0, newJobIds: [] };

  const commentsRes = await fetch(
    `https://hn.algolia.com/api/v1/search_by_date?tags=comment,story_${storyId}&hitsPerPage=1000`,
    { signal: AbortSignal.timeout(20_000) },
  );
  const comments = (await commentsRes.json()) as {
    hits?: Array<{ objectID: string; comment_text?: string; parent_id?: number; created_at_i?: number }>;
  };
  const top = (comments.hits ?? []).filter(
    (c) =>
      String(c.parent_id) === storyId && // top-level postings only
      c.comment_text &&
      (c.created_at_i ?? 0) * 1000 > (state.lastHnScanAt ?? 0) - MIN_INTERVAL_MS, // only newer than last scan (with overlap)
  );

  // Cheap prefilter before spending tokens.
  const LEVEL_RE = searchConfig().levels.includes("new-grad")
    ? /(intern|co-?op|new.?grad|university\s*grad|entry.?level|junior|early.?career)/i
    : /(intern|co-?op)/i;
  const DOMAIN_RE =
    /(embedded|firmware|robot|autonom|fpga|rtl|verilog|hardware|electrical|pcb|drone|uav|avionics|aerospace|satellite|rocket|lidar|perception|slam|ros\b|real.?time|rtos|controls?\s+eng|mechatronic|sensor)/i;
  const candidates = top.filter((c) => LEVEL_RE.test(c.comment_text!) && DOMAIN_RE.test(c.comment_text!));

  // Second stream: "X (YC W26) Is Hiring …" job posts on the HN front page.
  // Fetched as pseudo-comments through the same extractor.
  try {
    const weekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
    const jobsRes = await fetch(
      `https://hn.algolia.com/api/v1/search_by_date?tags=job&hitsPerPage=100&numericFilters=created_at_i>${weekAgo}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    const jobPosts = (await jobsRes.json()) as { hits?: Array<{ objectID: string; title?: string; url?: string }> };
    const SENIOR_RE = /\b(senior|staff|principal|lead|manager|director|head of)\b/i;
    for (const h of jobPosts.hits ?? []) {
      if (!h.title || !/hiring/i.test(h.title)) continue;
      if (!DOMAIN_RE.test(h.title) || !LEVEL_RE.test(h.title)) continue;
      if (SENIOR_RE.test(h.title)) continue;
      candidates.push({
        objectID: h.objectID,
        comment_text: `[HN JOB POST] ${h.title}${h.url ? ` — apply: ${h.url}` : ""}`,
        parent_id: Number(storyId),
        created_at_i: Math.floor(Date.now() / 1000),
      });
    }
  } catch {
    // job-post stream is best-effort
  }

  const client = new Anthropic();
  const levelText = searchConfig().levels.includes("new-grad")
    ? "INTERNSHIP / CO-OP or NEW GRAD / ENTRY-LEVEL"
    : "INTERNSHIP / CO-OP";
  const system = `You extract job postings from Hacker News "Who is hiring" comments for a computer science student seeking ${levelText} roles in embedded systems, firmware, robotics, autonomy, FPGA / digital design, or adjacent hardware engineering, anywhere in the United States (including US-remote).

From each comment, extract postings ONLY when ALL are true:
- the role itself is embedded / firmware / robotics / autonomy / controls / perception / FPGA / hardware / electrical, OR it is a general software engineering role at a company whose product is robots, drones, vehicles, spacecraft, chips, or other physical hardware
- explicitly open to ${levelText.toLowerCase()} candidates (experienced-only posts: skip)
- located in the US or US-remote
Use the role title as written (append "Intern" only if the comment says it is an internship). Include the application URL if one appears in the comment; else null. Use the provided commentId. Return an empty list when nothing qualifies.
Items marked [HN JOB POST] are YC-startup job posts: extract company from the title (the part before "(YC" or "Is Hiring"); when no location is given, use "Unspecified".`;

  const found: Array<z.infer<typeof Extracted>["postings"][number]> = [];
  const CHUNK = 12;
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const chunk = candidates.slice(i, i + CHUNK);
    const user = chunk
      .map((c) => `### commentId: ${c.objectID}\n${stripHtml(c.comment_text!).slice(0, 2200)}`)
      .join("\n\n");
    try {
      const msg = await client.messages.parse({
        model: MODEL,
        max_tokens: 4000,
        thinking: { type: "adaptive" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
        output_config: { format: zodOutputFormat(Extracted) },
      });
      found.push(...(msg.parsed_output?.postings ?? []));
    } catch {
      // one bad chunk shouldn't kill the scan
    }
  }

  // Insert.
  const existingKeys = new Set(db.select({ k: jobs.dedupeKey }).from(jobs).all().map((r) => r.k));
  const coarseKeys = loadCoarseKeys();
  const backfill = found.length > BACKFILL_THRESHOLD;
  const now = new Date();
  const newJobIds: number[] = [];
  for (const p of found) {
    const kind = isWantedPosting({ title: p.title, company: p.company, domainBoard: true });
    if (!kind) continue;
    if (!isTargetLocation(p.location)) continue;
    if (isBlockedCompany(p.company, { title: p.title })) continue;
    const key = dedupeKey(p.company, p.title, p.location);
    if (existingKeys.has(key)) continue;
    const ck = coarseKey(p.company, p.title, classify(p.location));
    if (coarseKeys.has(ck)) continue;
    existingKeys.add(key);
    coarseKeys.add(ck);
    const companyId = await upsertCompany(p.company);
    const applyUrl = p.applyUrl ?? `https://news.ycombinator.com/item?id=${p.commentId}`;
    const [inserted] = await db
      .insert(jobs)
      .values({
        companyId,
        title: p.title,
        kind,
        locationRaw: p.location,
        locationClass: classify(p.location),
        applyUrl,
        atsType: detectAts(applyUrl),
        sourceRepos: ["scout:hn"],
        status: "discovered",
        dedupeKey: key,
        backfilled: backfill,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .returning({ id: jobs.id });
    newJobIds.push(inserted.id);
  }

  saveState({ ...state, lastHnScanAt: Date.now() });
  return { skipped: false, commentsScanned: top.length, matched: found.length, newJobIds };
}

function stripHtml(s: string): string {
  return s
    .replace(/<p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

