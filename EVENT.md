# Event Start Record

- **Team ID:** `LSH26-T071`
- **Problem ID:** `P12`
- **Repository:** `lsh26-t071-p12`
- **Event start code:** `LSH26-8490-C900`
- **Repository created before release:** Yes (empty repository only — no commits before the event)

## Material present before 6:00 PM

| Material | Source or original location | What was already present |
|---|---|---|
| Empty Git repository | GitHub, created by the team leader before release | `main` branch with **zero commits**. No code, no scaffold, no README. |
| `P12_personal_ledger_public.json` | Organiser participant pack (arena) | The 25 published sample cases. Committed unmodified to `public/sample-data/` so judges can load them in-app. |
| `EVENT.md` / `evaluation-manifest.json` templates | Organiser participant pack (arena) | Blank templates, filled in during the event. |
| Problem brief, submission guide, scoring document | Organiser participant pack (arena) | Reference documents only. Kept locally in `_brief/` and git-ignored; no code was taken from them. |

Everything else in this repository was written during the event window. The Next.js
scaffold was generated **during** the event with `npx create-next-app@latest` (see the
first code commit) — it was not present beforehand.

## Registered members

| Registered name | GitHub username | Owned |
|---|---|---|
| Md Sazzad Siddique | `mdsazzadsiddique` | The engine: forecast, pocket simulation, DPS arithmetic, insight templates, test harness |
| Ashesh Deb Priom | `AsheshDebPriom` | The interface: the four tabs, design system, primitives, the what-if control. Authored the commits |
| Rezuan Islam | `RezuanIslam` | Receipt reading: the API route and the confidence review screen. Deployment and documentation |

## AI assistant use

Declared as required. Claude Code (Claude Opus 5) was used throughout this
build — the forecast and pocket-simulation engine, the interface, the receipt
route, the test harness and the documentation. Nothing numeric was accepted on
trust: `scripts/check.ts` runs the real engine over all 25 published cases and
fails on any broken invariant, the DPS arithmetic is checked against values
worked by hand from the published rule, and every screen was rendered and
inspected in a browser at phone and desktop widths. The work, and the
responsibility for it, remain the team's.

## Declaration

This file was added in the first event-work commit. The team will preserve the
repository history until results are announced. No history has been squashed,
deleted or rewritten after 6:00 PM.
