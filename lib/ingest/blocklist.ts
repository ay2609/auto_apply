import { readFileSync, existsSync } from "node:fs";
import { normalizeCompany } from "./dedupe";
import { INTERN_RE, NEW_GRAD_RE } from "../target";

/**
 * Optional company blocklist (config/company-blocklist.json, empty by default:
 * NVIDIA, Tesla, SpaceX, TI, Qualcomm etc. are prime embedded employers).
 * Intern / new-grad titles are excepted, so the list only drops a company's
 * experienced-hire roles; add a company to "hard" to drop it entirely.
 *
 * Matching is by normalized name, so "Google LLC" / "google" / "Google, Inc."
 * all match a "Google" entry. Edit the JSON to taste; changes apply on the
 * next ingest (`pnpm blocklist:sweep` only skips non-early-career leftovers).
 */

const BLOCKLIST_PATH = "./config/company-blocklist.json";

type Blocklist = { soft: Set<string>; hard: Set<string> };
let cached: Blocklist | null = null;

function load(): Blocklist {
  if (!cached) {
    const raw = existsSync(BLOCKLIST_PATH)
      ? (JSON.parse(readFileSync(BLOCKLIST_PATH, "utf-8")) as { soft?: string[]; hard?: string[] } | string[])
      : {};
    const soft = Array.isArray(raw) ? raw : (raw.soft ?? []);
    const hard = Array.isArray(raw) ? [] : (raw.hard ?? []);
    const norm = (names: string[]) => new Set(names.map(normalizeCompany).filter(Boolean));
    cached = { soft: norm(soft), hard: norm(hard) };
  }
  return cached;
}

export function blockedCompanies(): Set<string> {
  const { soft, hard } = load();
  return new Set([...soft, ...hard]);
}

export function isBlockedCompany(name: string, opts?: { title?: string }): boolean {
  const n = normalizeCompany(name);
  const { soft, hard } = load();
  if (hard.has(n)) return true;
  if (!soft.has(n)) return false;
  // Intern / new-grad programs at soft-blocked companies still get through.
  if (opts?.title && (INTERN_RE.test(opts.title) || NEW_GRAD_RE.test(opts.title))) return false;
  return true;
}
