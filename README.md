# auto-apply (embedded / robotics edition)

A local job-search pipeline that finds **every embedded systems, firmware, robotics, autonomy, FPGA and hardware internship in the US** it can reach, surfaces new postings the moment they appear, and can auto-fill and submit applications through Playwright, always with **one fixed resume** (no per-job resume tailoring).

Forked from [gheetdufa/auto_apply](https://github.com/gheetdufa/auto_apply) (a new-grad SWE / quant tool) and retargeted.

Everything runs on your machine. The database, profile, resume, and application history stay local.

## What it does

| Stage | What happens |
|-------|----------------|
| **Ingest** | Pulls the big GitHub internship lists (SimplifyJobs Summer 2027 + off-season co-ops, vanshb03, zapplyjobs, speedyapply), keeps only embedded / robotics / hardware rows located in the US |
| **Scout: ATS boards** | Polls Greenhouse / Lever / Ashby boards of robotics, drone, aerospace, defense and chip companies directly (catches postings before the lists update), plus boards auto-discovered for hiring YC robotics / hardware / aerospace startups |
| **Scout: Workday** | Searches the Workday career sites of defense primes, semiconductor companies, automakers and med-device makers (NVIDIA, Northrop, Boeing, Medtronic, …) for intern / co-op postings |
| **Scout: Google, HN** | Google Careers intern search for embedded / hardware / silicon roles; HN "Who's hiring" hardware posts (HN needs an API key) |
| **Enrich** | Follows redirects, detects the real ATS, fetches the job description and the actual application-form questions |
| **Draft** (on demand) | Claude answers every form field (plus a short cover letter) from your profile and screening answers. Your resume is never modified |
| **Apply** | Playwright opens a headed browser, reads the live form, fills every field, attaches `data/resume.pdf`, and submits (or stops before submit if `AUTO_SUBMIT=0`) |

## What counts as a match

All filtering lives in one place, `lib/target.ts`, and every source uses it:

- **Role**: the title mentions embedded, firmware, robotics, autonomy, ROS, controls, GNC, flight software, avionics, FPGA / RTL / ASIC / digital design, hardware, electrical, PCB, silicon, drivers / kernel / BSP, RTOS / real-time, perception / SLAM / state estimation, lidar / radar, drones / UAV, spacecraft / satellites, ADAS, DSP / RF, GPU / CUDA, and similar.
- **Or the company is robotics / aerospace / defense-native** (`config/target-companies.json`, the curated boards, and names like "… Robotics", "… Aerospace", "… Space", "… Defense"). There, any engineering internship counts (e.g. *Software Engineer Intern* at Anduril), except web / frontend / IT / ops / mechanical-type titles.
- **Level**: internships and co-ops by default. Set `"levels": ["internship", "new-grad"]` in `config/search.json` to include entry-level full-time. PhD / Masters-only roles are dropped (`excludeGradOnly`).
- **Location**: anywhere in the US, plus US-remote. Postings with no parseable location ("3 Locations") are kept (`includeUnknownLocation`).

Check the filters any time with `pnpm test:discovery` (unit cases + live per-source counts).

## Stack

Next.js 15 (App Router) · React 19 · Tailwind v4 · Drizzle + SQLite · Anthropic SDK (structured outputs) · Playwright · launchd watcher

## First-time setup

```bash
pnpm install
pnpm db:push                                              # creates data/db.sqlite
cp .env.local.example .env.local                          # add ANTHROPIC_API_KEY
cp data/profile.md.template data/profile.md               # your background (drafts are grounded in this)
cp config/screening-answers.example.json data/screening-answers.json   # work auth, start date, EEOC…
cp ~/path/to/YourResume.pdf data/resume.pdf               # the ONE resume every application gets
pnpm ingest                                               # first run = quiet backfill of everything currently open
pnpm watcher:install                                      # optional: launchd ingest every 15 min
pnpm dev                                                  # http://localhost:3000
```

Also create `data/contact.json` (name, email, phone, linkedin, github, website, school, degree, discipline, graduation, gpa); it fills identity fields verbatim.

Discovery needs **no API key**. The key is needed for drafting answers, auto-apply's field resolver, and the HN scout. Auto-apply refuses to run while `data/screening-answers.json` still has `TODO` values.

Optional `.env.local` settings: `AUTO_SUBMIT=0` (fill but don't click Submit), `AUTO_DRAFT=1` (pre-draft answers for every newly released job; off by default to save tokens), `ANTHROPIC_MODEL`.

## How the pipeline works

Every 15 minutes (launchd watcher) or on **Refresh** in the UI:

1. **Ingest** fetches the list READMEs; rows go through the role / level / location filters. Jobs marked closed (🔒) close immediately; list jobs missing from every list for 24h+ auto-close.
2. **Scout** polls ATS boards every run (first poll of a board seeds quietly; afterwards only deltas count as new; jobs that leave a board are closed), Workday every 3h, Google every 6h, HN twice a day. YC discovery probes 40 robotics / hardware startups per run until the queue is drained.
3. **Delta detection**: a job is "released" the first time any source sees it. The first-ever run (or 50+ inserts at once) is backfill: stored and shown, but no notifications.
4. **Enrich** new releases (redirects, ATS, JD, form questions), optionally draft (`AUTO_DRAFT=1`), then **notify** via macOS.

### Auto-apply flow

**Auto-apply** on a job (or `pnpm apply:batch`): ensures a draft exists (drafting it now if needed) → double-apply guard per company → Playwright fills the live form from `contact.json` → draft → Claude for anything unmatched → attaches `data/resume.pdf` → submits (unless `AUTO_SUBMIT=0`) or leaves the window open on CAPTCHA / anything unexpected. Every attempt is recorded with a per-field audit trail.

Workday and LinkedIn postings are login-walled: they're discovered and linked, but you apply by hand.

## Commands

```bash
pnpm dev                 # UI at http://localhost:3000
pnpm ingest              # run the full pipeline once (what the watcher runs)
pnpm test:discovery      # filter checks + live per-source keep counts
pnpm watcher:install     # launchd agent, every 15 min (logs: data/watch.log)
pnpm watcher:status
pnpm watcher:uninstall
pnpm blocklist:sweep     # retroactively skip open jobs from blocklisted companies
pnpm apply:dry <jobId>   # fill a form without submitting (sanity check)
pnpm apply:batch         # batch apply to drafted jobs (--limit, --gap, --starred)
pnpm db:studio           # browse the DB
```

## Tuning

| File | Controls |
|---|---|
| `lib/target.ts` | Role keywords, off-target exclusions, level detection |
| `config/search.json` | Levels (internship / new-grad), grad-only exclusion, unknown-location handling |
| `config/target-companies.json` | Robotics-native companies whose generic SWE internships count |
| `lib/scout/watch-boards.ts` | Curated Greenhouse / Lever / Ashby boards |
| `lib/scout/workday-tenants.ts` | Curated Workday career sites |
| `lib/ingest/sources.ts` | GitHub lists |
| `config/company-blocklist.json` | Companies to drop (`soft`: experienced roles only, `hard`: entirely) |

## Project layout

```
app/                    Next.js UI (inbox, job detail, resume, API routes)
db/                     Drizzle schema
lib/
  target.ts             what counts as an embedded / robotics job (shared by every source)
  pipeline.ts           ingest → scout → enrich → (draft) → notify
  ingest/               README fetchers, parsers, dedupe, location, blocklist
  scout/                ATS boards, Workday, YC discovery, HN, Google Careers
  enrich/               per-job: finalUrl + ATS + JD + form questions
  tailor/               Claude form-answer drafts (structured outputs)
  apply/                Playwright auto-apply (live form extraction + fill)
  ats/ jd/              ATS detection, form questions, JD fetchers (incl. Workday)
  resume/paths.ts       the single resume path
config/                 search settings, target companies, blocklist, screening-answers template
data/                   local only (gitignored): db, profile, resume, contact, screening answers, logs
scripts/                ingest CLI, watcher, batch / dry-run apply, blocklist sweep, discovery test
```

## Notes

- Drafts default to `claude-opus-4-8` with prompt caching. Override with `ANTHROPIC_MODEL` in `.env.local`.
- Drafts and apply answers never use em dashes (style rule in the system prompt).
- The watcher never auto-applies in the background. Applying always requires you to trigger it.
- Requires Node 22+ (`better-sqlite3` 13).
