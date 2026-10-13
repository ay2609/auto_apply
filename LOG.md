# Log

## 2026-10-13 — Forked and retargeted to embedded/robotics internships
- Cloned gheetdufa/auto_apply to `~/code/projects/auto_apply`, branch `embedded-robotics`.
- New `lib/target.ts` filter (role keywords, robotics-native companies, intern/co-op level, grad-only exclusion); US-wide location classifier; all sources rewired to it.
- Sources: Summer 2027 + off-season GitHub lists (dropped quant/new-grad SWE lists and Remotive); 111 verified robotics/aerospace/chip ATS boards; new Workday scout over 49 verified tenants (+ Workday JD fetch); YC discovery limited to robotics/hardware startups; Google + HN prompts retargeted.
- Removed resume tailoring + GitHub ranking + original author's resume and hardcoded personal answers; single `data/resume.pdf`; screening answers moved to gitignored `data/screening-answers.json` (TODO guard on auto-apply).
- Fixed: scout-found jobs were auto-closed after 24h by the list ingest; `matchOption("")` matched the first option; ambiguous Workday location codes.
- Bumped better-sqlite3 to 13 (11 fails to build on Node 26).
- First backfill: 1,043 jobs.
- Blocked: PR needs `gh auth login` (token invalid). Owner to add API key + fill screening TODOs.
