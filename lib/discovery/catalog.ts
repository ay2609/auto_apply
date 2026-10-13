import { SOURCES } from "@/lib/ingest/sources";
import { WATCH_BOARDS } from "@/lib/scout/watch-boards";
import { WORKDAY_TENANTS } from "@/lib/scout/workday-tenants";

export type DiscoverySource = {
  key: string;
  label: string;
  kind: "github-list" | "ats-board" | "careers-site" | "aggregator" | "forum";
  detail: string;
  url?: string;
};

/** Every place Refresh / the watcher currently pulls from. */
export function discoveryCatalog(): DiscoverySource[] {
  const github: DiscoverySource[] = SOURCES.map((s) => ({
    key: s.key,
    label: `${s.owner}/${s.repo}`,
    kind: "github-list",
    detail: s.kind === "internship" ? "Internship list, embedded/robotics rows only" : "New-grad list, embedded/robotics rows only",
    url: `https://github.com/${s.owner}/${s.repo}`,
  }));

  const boards: DiscoverySource[] = WATCH_BOARDS.map((b) => ({
    key: `watch:${b.ats}:${b.token}`,
    label: `${b.company} (${b.ats}/${b.token})`,
    kind: "ats-board",
    detail: "Robotics / embedded company board (all engineering internships)",
    url:
      b.ats === "greenhouse"
        ? `https://boards.greenhouse.io/${b.token}`
        : b.ats === "lever"
          ? `https://jobs.lever.co/${b.token}`
          : `https://jobs.ashbyhq.com/${b.token}`,
  }));

  const workday: DiscoverySource[] = WORKDAY_TENANTS.map((t) => ({
    key: `workday:${t.tenant}/${t.site}`,
    label: `${t.company} (Workday)`,
    kind: "careers-site",
    detail: "Workday search for intern / co-op, embedded/robotics titles only (every 3h)",
    url: `https://${t.host}/${t.site}`,
  }));

  return [
    ...github,
    ...boards,
    ...workday,
    {
      key: "scout:db-boards",
      label: "Known ATS boards from your DB + YC robotics/hardware startups",
      kind: "ats-board",
      detail:
        "Every Greenhouse/Lever/Ashby/SmartRecruiters/Workable token mined from jobs you already track, plus boards probed for hiring YC robotics / hardware / aerospace companies",
    },
    {
      key: "scout:google-careers",
      label: "Google Careers",
      kind: "careers-site",
      detail: "US intern roles for embedded / firmware / hardware / robotics / silicon searches",
      url: "https://www.google.com/about/careers/applications/jobs/results/?target_level=INTERN_AND_APPRENTICE",
    },
    {
      key: "scout:hn",
      label: "HN Who's Hiring",
      kind: "forum",
      detail: "Monthly Ask HN thread via Algolia, hardware/robotics intern posts (needs ANTHROPIC_API_KEY)",
      url: "https://news.ycombinator.com/submitted?id=whoishiring",
    },
    {
      key: "note:tesla",
      label: "Tesla careers (indirect)",
      kind: "careers-site",
      detail:
        "tesla.com/careers is Akamai-blocked from scrapers; Tesla roles arrive via the SimplifyJobs GitHub lists.",
      url: "https://www.tesla.com/careers/search/?type=intern&site=US",
    },
  ];
}
