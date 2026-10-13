/**
 * Community-maintained GitHub job lists. Every table row is run through the
 * embedded/robotics filter (lib/target.ts), so broad lists are fine: the
 * SimplifyJobs lists alone carry dedicated Hardware Engineering sections.
 *
 * `kind` is the level the list implies. Rows from new-grad lists only survive
 * when their title says intern/co-op, or when config/search.json levels
 * include "new-grad".
 */
export type RepoSource = {
  key: string;
  owner: string;
  repo: string;
  branch: string;
  readmePath: string;
  kind: "new-grad" | "internship";
};

export const SOURCES: RepoSource[] = [
  {
    key: "simplify-summer-2027",
    owner: "SimplifyJobs",
    repo: "Summer2027-Internships",
    branch: "dev",
    readmePath: "README.md",
    kind: "internship",
  },
  {
    // Fall / Winter / Spring co-ops (Tesla, defense primes, etc.).
    key: "simplify-off-season-2027",
    owner: "SimplifyJobs",
    repo: "Summer2027-Internships",
    branch: "dev",
    readmePath: "README-Off-Season.md",
    kind: "internship",
  },
  {
    key: "vansh-summer-2027",
    owner: "vanshb03",
    repo: "Summer2027-Internships",
    branch: "dev",
    readmePath: "README.md",
    kind: "internship",
  },
  {
    // Has its own "Hardware & Engineering" section.
    key: "zapply-internships-2027",
    owner: "zapplyjobs",
    repo: "Internships-2027",
    branch: "main",
    readmePath: "README.md",
    kind: "internship",
  },
  {
    // Mixed internship + new-grad tables; internship titles are detected per row.
    key: "speedyapply-2027",
    owner: "speedyapply",
    repo: "2027-SWE-College-Jobs",
    branch: "main",
    readmePath: "README.md",
    kind: "new-grad",
  },
  {
    key: "simplify-new-grad",
    owner: "SimplifyJobs",
    repo: "New-Grad-Positions",
    branch: "dev",
    readmePath: "README.md",
    kind: "new-grad",
  },
];

export function rawUrl(s: RepoSource): string {
  return `https://raw.githubusercontent.com/${s.owner}/${s.repo}/${s.branch}/${s.readmePath}`;
}
