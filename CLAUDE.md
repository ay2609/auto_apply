# auto_apply — embedded / robotics internship finder + auto-apply

Avi's fork of gheetdufa/auto_apply, retargeted from new-grad SWE/quant to **every US embedded, firmware, robotics, autonomy, FPGA and hardware internship/co-op**, applying with **one fixed resume** (`data/resume.pdf`, no tailoring). Next.js 15 + SQLite + Playwright; see README.md for the full tour.

## Run it
- `pnpm dev -H 0.0.0.0` → http://localhost:3000 (or http://avis-mac-mini:3000 over Tailscale). Stop it when done.
- `pnpm ingest` runs one discovery pass (~2.5 min). `pnpm test:discovery` checks filters + live list counts.
- Inside Claude's sandbox: `tsx` can't open its IPC socket and Node fetch ignores the proxy, so run scripts as `node --import tsx scripts/<x>.ts` **outside the sandbox**. Git writes (`.git/config`, hooks) also need the sandbox off.
- Requires Node 22+ (better-sqlite3 was bumped 11 → 13 because 11 doesn't compile on Node 26).

## Where things live
- `lib/target.ts` — the single role/level/company filter every source uses. `config/search.json` (levels, grad-only, unknown locations), `config/target-companies.json` (robotics-native companies whose generic SWE interns count).
- `lib/ingest/location.ts` — US-wide classifier (sf / nyc / remote_us / us / other). Two-letter state codes only count when nothing points abroad (Workday writes "IL - Petah Tikva", "CA-QC-…").
- Sources: `lib/ingest/sources.ts` (GitHub lists), `lib/scout/watch-boards.ts` (111 verified GH/Lever/Ashby boards), `lib/scout/workday-tenants.ts` + `workday.ts` (49 verified Workday tenants, new scout), `discover.ts` (YC robotics/hardware board probing), `google.ts`, `hn.ts`.
- Personal, gitignored: `data/resume.pdf`, `data/profile.md`, `data/contact.json`, `data/screening-answers.json`, `data/db.sqlite`, `.env.local`.

## Key decisions
- **One resume, no tailoring**: removed lib/resume LaTeX tailoring, GitHub project ranking, per-job PDFs, and the original author's resume. Drafts still answer form questions (needed for auto-apply) but never touch the resume.
- **AUTO_DRAFT off by default**: discovery spends no API tokens; drafts are made on demand when applying.
- **Original author's hardcoded answers removed** (work auth "Yes", sponsorship "No", 3+ internships, Master's). Yes/No screening now keys off `data/screening-answers.json`; auto-apply refuses to run while any value there is `TODO`.
- **Blocklist emptied**: NVIDIA/Tesla/SpaceX/TI/Qualcomm are prime embedded employers.
- **Scout jobs close via their own board** (fix): original closed every non-list job after 24h.
- Workday is discover-only (apply needs an account). Default model left at claude-opus-4-8 (`ANTHROPIC_MODEL` overrides).

## Current state (2026-10-13)
- First backfill: 1,043 open internships (634 lists, 207 ATS boards, 202 Workday). Filters pass `pnpm test:discovery`.
- Not yet done: owner's API key in `.env.local`; TODOs in `data/screening-answers.json` (work auth, sponsorship, citizenship, clearance, start date, term); `contact.json` location blank; watcher (launchd) not installed. PR open: https://github.com/ay2609/auto_apply/pull/1 (fork remote `fork`, branch `embedded-robotics`; push over HTTPS via gh credential helper, see ~/code/TOOLS.md).

## Next steps
- Owner adds key + screening answers → try `pnpm apply:dry <id>` on a Greenhouse job, then a real apply.
- Consider adding iCIMS / Eightfold / Oracle HCM scouts (Qualcomm, Lockheed, TI, AMD, Garmin, Rivian, Joby use those).
