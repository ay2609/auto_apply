import { readFileSync, existsSync } from "node:fs";
import { normalizeCompany } from "./ingest/dedupe";

/**
 * Single source of truth for WHAT the pipeline looks for: embedded systems,
 * firmware, robotics, autonomy, FPGA/digital design and adjacent hardware roles.
 * Every source (GitHub lists, ATS boards, Workday, HN, Google) runs postings
 * through isWantedPosting() so the filters can't drift apart.
 *
 * Tune role coverage here; tune levels/location in config/search.json and the
 * robotics-native company list in config/target-companies.json.
 */

/** Titles that are on-target at ANY company. */
export const ROLE_TITLE_RE = new RegExp(
  [
    String.raw`embedded`,
    String.raw`firmware`,
    String.raw`robot(?:s|ic|ics)?`,
    String.raw`autonom(?:y|ous)`,
    String.raw`self[\s-]?driving`,
    String.raw`ros\s*2?`,
    String.raw`mechatronics?`,
    String.raw`controls?\s+(?:engineer\w*|software|systems?)`,
    String.raw`control\s+systems?`,
    String.raw`gnc`,
    String.raw`guidance`,
    String.raw`navigation`,
    String.raw`flight\s+(?:software|controls?|systems?|test)`,
    String.raw`avionics`,
    String.raw`fpga`,
    String.raw`rtl`,
    String.raw`asic`,
    String.raw`verilog`,
    String.raw`vhdl`,
    String.raw`digital\s+(?:design|logic|hardware|ic)`,
    String.raw`hardware`,
    String.raw`electrical`,
    String.raw`electronics?`,
    String.raw`computer\s+engineer(?:ing)?`,
    String.raw`ece`,
    String.raw`pcb`,
    String.raw`circuits?`,
    String.raw`silicon`,
    String.raw`soc`,
    String.raw`chip`,
    String.raw`(?:device|kernel|linux)\s+drivers?`,
    String.raw`kernel`,
    String.raw`bsp`,
    String.raw`bootloader`,
    String.raw`real[\s-]?time`,
    String.raw`rtos`,
    String.raw`low[\s-]?level`,
    String.raw`bare[\s-]?metal`,
    String.raw`perception`,
    String.raw`slam`,
    String.raw`state\s+estimation`,
    String.raw`localization\s+(?:and|&)\s+mapping`,
    String.raw`(?:motion|path)\s+planning`,
    String.raw`sensors?`,
    String.raw`sensor\s+fusion`,
    String.raw`lidar`,
    String.raw`radar`,
    String.raw`computer\s+vision`,
    String.raw`uavs?`,
    String.raw`uas`,
    String.raw`drones?`,
    String.raw`unmanned`,
    String.raw`spacecraft`,
    String.raw`satellites?`,
    String.raw`space\s+systems?`,
    String.raw`automotive`,
    String.raw`adas`,
    String.raw`vehicle\s+(?:software|systems?|controls?|dynamics)`,
    String.raw`powertrain`,
    String.raw`battery\s+(?:systems?|management)`,
    String.raw`iot`,
    String.raw`wireless`,
    String.raw`rf`,
    String.raw`dsp`,
    String.raw`signal\s+processing`,
    String.raw`systems?\s+software`,
    String.raw`hardware[\s-]in[\s-]the[\s-]loop`,
    String.raw`hil`,
    String.raw`(?:robot\w*|vehicle|flight|physics|hardware|autonomy|sensor|av|spacecraft|mission)\s+simulation`,
    String.raw`simulation\s+(?:software|engineer\w*|intern)`,
    String.raw`devices?\s+(?:team|software|firmware|engineer\w*)`,
    String.raw`edge\s+(?:ai|computing|ml)`,
    String.raw`gpu`,
    String.raw`cuda`,
    String.raw`manufacturing\s+(?:software|automation)`,
    String.raw`industrial\s+automation`,
    String.raw`plc`,
    String.raw`medical\s+devices?`,
    String.raw`haptics?`,
    String.raw`actuators?`,
    String.raw`motor\s+control`,
    String.raw`power\s+electronics`,
  ]
    .map((p) => `\\b${p}\\b`)
    .join("|"),
  "i",
);

/** Generic engineering titles — on-target only at robotics/embedded-native companies. */
export const GENERIC_ENG_RE =
  /\b(software|engineer(?:ing)?|developer|swe|sde|programmer|systems|infrastructure|platform|test|validation|verification|integration|research)\b/i;

/** Titles that are clearly off-target even at a robotics company (unless ROLE_TITLE_RE also matches). */
export const WEB_ONLY_RE =
  /\b(facilit\w*|quality|propulsion|aerodynamic\w*|aerospace\s+engineer\w*|thermal|fluids?|stress|composites?|machinist|technician|welding|tooling|cost|estimat\w*|contracts?|devsecops|it\b|clinical|regulatory|environmental|ehs|civil|structural|chemical|materials|mechanical|industrial\s+engineer\w*|manufacturing\s+engineer\w*|process\s+engineer\w*|supplier|operations|logistics|business\s+operations|analytics|data\s+(?:science|scientist|engineer\w*)|front[\s-]?end|full[\s-]?stack|web|ios|android|mobile|ui|ux|salesforce|sap|crm|marketing|growth|data\s+analyst|business\s+(?:analyst|intelligence)|it\s+(?:support|intern|analyst)|help\s*desk|security\s+analyst|grc|product\s+manag\w*|program\s+manag\w*|project\s+manag\w*|supply\s+chain|procurement|sourcing|buyer|finance|accounting|legal|hr|human\s+resources|recruit\w*|sales|customer|technical\s+writer|graphic|designer|content|communications|policy)\b/i;

/** Never on-target. */
export const NEGATIVE_TITLE_RE =
  /\b(sales|marketing|recruit(?:er|ing)|human\s+resources|accounting|paralegal|legal|customer\s+(?:support|success)|teacher|nurse|janitor|cashier|retail|warehouse\s+associate|truck\s+driver|delivery\s+driver|barista|investment\s+banking|equity\s+research)\b/i;

export const INTERN_RE = /\b(intern(?:ship)?s?|co-?op|apprentice(?:ship)?|summer\s+(?:student|associate|analyst)|student\s+(?:engineer|researcher|developer|technician))\b/i;

export const NEW_GRAD_RE =
  /\b(new\s*grad(?:uate)?|new\s*college\s*grad|college\s*grad(?:uate)?|university\s*grad(?:uate)?|recent\s*grad(?:uate)?|early\s*career|entry[\s-]?level|campus|university\s+hire|engineer\s+i\b|associate\s+engineer|junior)\b/i;

export const SENIOR_TITLE_RE =
  /\b(senior|staff|principal|lead|manager|director|head|vp|chief|distinguished|experienced|sr\.?|iii|iv|[4-9]\+?\s*(?:years|yrs))\b/i;

export const GRAD_ONLY_RE =
  /\b(ph\.?\s?d\.?|doctoral|post-?doc(?:toral)?|master'?s|mba|(?<!(?:new|recent|college|university|under)\s?)graduate(?!\s+(?:program|rotation|development|engineer)))\b/i;

/** Company names that are robotics / aerospace / defense-native on their face. */
export const COMPANY_DOMAIN_RE =
  /\b(robot\w*|aerospace|aero\w*|aeronautic\w*|astro(?:nautics?)?|space|avionics|defen[cs]e|dynamics|autonom\w*|drones?|uav|satellites?|rockets?|orbital|launch|propulsion|mechatronics?|applied physics|lincoln lab\w*|draper|sandia|national lab\w*)\b/i;

type SearchConfig = {
  levels: Array<"internship" | "new-grad">;
  excludeGradOnly: boolean;
  includeUnknownLocation: boolean;
};

const SEARCH_PATH = "./config/search.json";
const COMPANIES_PATH = "./config/target-companies.json";

let searchCache: SearchConfig | null = null;
export function searchConfig(): SearchConfig {
  if (!searchCache) {
    const raw = existsSync(SEARCH_PATH)
      ? (JSON.parse(readFileSync(SEARCH_PATH, "utf-8")) as Partial<SearchConfig>)
      : {};
    searchCache = {
      levels: raw.levels?.length ? raw.levels : ["internship"],
      excludeGradOnly: raw.excludeGradOnly ?? true,
      includeUnknownLocation: raw.includeUnknownLocation ?? true,
    };
  }
  return searchCache;
}

let companyCache: Set<string> | null = null;
/** Robotics / embedded-native companies: their generic SWE internships count too. */
export function targetCompanies(): Set<string> {
  if (!companyCache) {
    const names = existsSync(COMPANIES_PATH)
      ? (JSON.parse(readFileSync(COMPANIES_PATH, "utf-8")) as { companies?: string[] }).companies ?? []
      : [];
    companyCache = new Set(names.map(normalizeCompany).filter(Boolean));
  }
  return companyCache;
}

export function isTargetCompany(company: string): boolean {
  return targetCompanies().has(normalizeCompany(company)) || COMPANY_DOMAIN_RE.test(company);
}

/** Is this title an embedded / robotics / hardware role (given who's hiring)? */
export function isTargetRole(title: string, company: string, opts: { domainBoard?: boolean } = {}): boolean {
  if (NEGATIVE_TITLE_RE.test(title)) return false;
  if (ROLE_TITLE_RE.test(title)) return true;
  const domain = opts.domainBoard || isTargetCompany(company);
  return domain && GENERIC_ENG_RE.test(title) && !WEB_ONLY_RE.test(title);
}

export type Level = "internship" | "new-grad";

/**
 * Which level a posting is, or null when it isn't one we want.
 * `listKind` is the level implied by the source (an internship list only lists internships).
 */
export function wantedLevel(title: string, opts: { employmentType?: string | null; listKind?: Level } = {}): Level | null {
  const cfg = searchConfig();
  const blob = `${title} ${opts.employmentType ?? ""}`;
  if (cfg.excludeGradOnly && GRAD_ONLY_RE.test(title)) return null;
  const intern = INTERN_RE.test(blob) || opts.listKind === "internship";
  if (intern) return cfg.levels.includes("internship") ? "internship" : null;
  if (SENIOR_TITLE_RE.test(title)) return null;
  const newGrad = NEW_GRAD_RE.test(blob) || opts.listKind === "new-grad";
  if (newGrad) return cfg.levels.includes("new-grad") ? "new-grad" : null;
  return null;
}

/** Full admission check used by every source. Returns the job kind, or null to drop. */
export function isWantedPosting(p: {
  title: string;
  company: string;
  employmentType?: string | null;
  listKind?: Level;
  domainBoard?: boolean;
}): Level | null {
  if (!isTargetRole(p.title, p.company, { domainBoard: p.domainBoard })) return null;
  return wantedLevel(p.title, { employmentType: p.employmentType, listKind: p.listKind });
}
