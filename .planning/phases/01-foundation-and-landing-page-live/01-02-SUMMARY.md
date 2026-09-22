---
phase: 01-foundation-and-landing-page-live
plan: 02
subsystem: ui
tags: [react, tailwind, shadcn, svg, landing-page, copywriting]

# Dependency graph
requires:
  - phase: 01-foundation-and-landing-page-live (Plan 01)
    provides: "pnpm monorepo scaffold, WaitlistForm + LiveCounter reused unchanged, lazy Firebase pattern, packages/shared schema (CALL_STATES)"
provides:
  - "Full one-screen Porchlight landing page (Hero, Problem, How It Works, Waitlist, Footer) at `/`"
  - "Inline SVG amber lamp illustration with breathing glow, reusable color prop for Phase 3 stage view"
  - "Dependency-free pathname router: `/` (Landing), `/app*` (AppPlaceholder), `/stage` (Stage)"
  - "README documenting run/build/deploy/secrets/ref-attribution commands"
affects: ["01-03-firebase-deploy", "phase-3-lamp", "phase-4-dashboard"]

actuals:
  tokens: 3349
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Lamp.tsx accepts a `color` prop (amber/green/red) and a `className` override so Phase 3's /stage and the eventual real-time lamp state can restyle the same component instead of duplicating SVG"
    - "App.tsx is a plain pathname-string switch (trailing slash stripped, startsWith for /app*) — zero router dependency, keeps the bundle light per D-08"

key-files:
  created:
    - apps/web/src/pages/Landing.tsx
    - apps/web/src/components/Lamp.tsx
    - apps/web/src/pages/AppPlaceholder.tsx
    - apps/web/src/pages/Stage.tsx
    - README.md
  modified:
    - apps/web/src/App.tsx
    - apps/web/src/index.css
    - apps/web/index.html

key-decisions:
  - "Used the FBI IC3 2024 figure (~$4.9B lost by people 60+) from PROJECT.md's 'Problem data (verify before slides)' note instead of the plan's illustrative $3.4B/2023 placeholder text, since PROJECT.md already carries the more current researched number. Both were always going to ship behind the same `TODO(human): verify IC3 figure` marker — this just makes the marked-for-verification value more likely correct on the first pass."
  - "Lamp silhouette (post + shade) uses `currentColor` at low opacity, independent of the `color` prop, which drives only the radial-gradient glow stops — keeps the silhouette visually stable while the glow color changes for Phase 3's stage view (green/red)."

patterns-established:
  - "Reusable illustration components take a semantic `color` prop (not raw CSS) plus an escape-hatch `className` for size/position overrides at each call site."

requirements-completed: [LAND-01]

coverage:
  - id: D1
    description: "A visitor at `/` sees, on one phone screen and one desktop screen: headline, problem paragraph with FBI IC3 figure, 3-step how-it-works, amber lamp, waitlist form, live counter, and RI Startup Week footer"
    requirement: "LAND-01"
    verification:
      - kind: other
        ref: "grep assertions for every D-09 string (Porchlight, guardian, IC3, Screens/Verifies family/Lights the lamp, WaitlistForm/LiveCounter, footer text, id=waitlist) on apps/web/src/pages/Landing.tsx — all pass"
        status: pass
      - kind: other
        ref: "pnpm --filter @porchlight/web typecheck"
        status: pass
    human_judgment: true
    rationale: "Content presence and typecheck are mechanically proven, but actual on-screen readability at 390px (phone) and 1280px (desktop) — no horizontal scroll, 20-second read, layout order — is the plan's own <human-check> and was not run in this sandbox (no browser). Noted as pending human review; content and responsive classes (9x `md:` breakpoints) are in place."
  - id: D2
    description: "The FBI IC3 figure is visibly marked as unverified in the copy with exactly one TODO(human) comment until a human confirms it"
    requirement: "LAND-01"
    verification:
      - kind: other
        ref: "grep -c 'TODO(human)' apps/web/src/pages/Landing.tsx == 1; grep -c 'verify' >= 1; grep -c 'IC3' >= 1"
        status: pass
    human_judgment: false
  - id: D3
    description: "/app and /stage load without a 404 and show a placeholder view; Stage imports the shared CALL_STATES constant"
    requirement: "LAND-01"
    verification:
      - kind: other
        ref: "pnpm --filter @porchlight/web build exits 0; grep confirms App.tsx pathname switch, Stage.tsx CALL_STATES + <Lamp import, AppPlaceholder.tsx Phase 4 text"
        status: pass
    human_judgment: true
    rationale: "The Hosting SPA rewrite (firebase.json, Plan 01) that makes a hard-refreshed /app or /stage URL resolve to index.html instead of a real 404 can only be proven against a deployed Hosting site — that is Plan 03's checkpoint. Local Vite dev/build only proves the client-side route switch itself, which is fully verified above."
  - id: D4
    description: "The landing page still lazy-loads Firebase — the entry chunk contains no Firebase code"
    requirement: "LAND-01"
    verification:
      - kind: other
        ref: "pnpm --filter @porchlight/web build; dist/assets shows firebase-*.js (138.37 kB gz) as a separate chunk from the entry (92.56 kB gz); grep confirms zero 'lib/firebase' imports in Landing.tsx, Lamp.tsx, App.tsx, AppPlaceholder.tsx, Stage.tsx"
        status: pass
    human_judgment: false
  - id: D5
    description: "README explains run, build, deploy, and where secrets live, with the exact commands from RESEARCH.md and no real credentials"
    requirement: "LAND-01"
    verification:
      - kind: other
        ref: "grep assertions for 'pnpm run deploy', 'pnpm -r build', 'functions:secrets:set', '.secret.local', '.env.local', 'ref=', 'judges', 'joinWaitlist'; git grep -Ei 'sk-ant-|AC[0-9a-f]{32}' -- README.md returns empty"
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-09-22
status: complete
---

# Phase 1 Plan 2: Landing Page Content, Lamp Illustration, Routes, and README Summary

Built the full one-screen Porchlight pitch (Hero/Problem/How-It-Works/Waitlist/Footer) reusing Plan 01's `WaitlistForm`/`LiveCounter` unchanged, added a reusable inline-SVG amber lamp with a breathing glow, wired a dependency-free pathname router for `/app` and `/stage` placeholders, and documented run/build/deploy/secrets in README.md — all while keeping Firebase behind its existing lazy `import()` (main chunk 92.56 kB gz, Firebase 138.37 kB gz, unchanged separation from Plan 01).

## Performance

- **Duration:** ~18 min
- **Started:** 2026-09-22T02:45:00Z (approx.)
- **Completed:** 2026-09-22T03:03:00Z (approx.)
- **Tasks:** 3/3 completed
- **Files modified:** 8 files (319 insertions, 9 deletions)

## Accomplishments
- `Landing.tsx` composes five sections carrying every locked D-09 content element — headline, problem paragraph with the FBI IC3 figure (marked with exactly one `TODO(human)` comment), three how-it-works cards ("Screens" / "Verifies family" / "Lights the lamp"), the reused `WaitlistForm` + `LiveCounter` under `#waitlist`, and the "Built in 24h at RI Startup Week" footer — all mobile-first with 9 responsive (`md:`) breakpoints.
- `Lamp.tsx` is a pure inline SVG (no image asset): a low-opacity `currentColor` silhouette behind a radial-gradient amber glow that breathes via a `porch-glow` CSS keyframe (disabled under `prefers-reduced-motion`), with a `color` prop (amber/green/red) and `className` override so Phase 3's `/stage` reuses the identical component at a larger size.
- `App.tsx` now switches on `window.location.pathname` (trailing slash stripped, no router dependency) to render `Landing`, `AppPlaceholder` (`/app*`), or `Stage` (`/stage`); `Stage.tsx` imports `CALL_STATES` from `@porchlight/shared` via the existing schema barrel, giving the projector view a real shared-schema import from day one.
- Full-tree `pnpm -r typecheck` and `pnpm -r build` both exit 0; `apps/web/dist/assets` still shows a separate `firebase-*.js` chunk (138.37 kB gz) apart from the 92.56 kB gz entry — the lazy-load pattern from Plan 01 survived every content addition.
- `README.md` documents prerequisites, run/build/deploy commands (with an explicit callout that `pnpm run deploy` must be invoked with `run` because pnpm has a builtin `deploy` subcommand), the four `defineSecret` vars and where their local values live, `?ref=` attribution values, and live-verification curl commands — confirmed to contain no real credential patterns.

## Task Commits

Each task was committed atomically:

1. **Task 1: Landing page content sections and amber lamp illustration** - `f29a10a` (feat)
2. **Task 2: Route switch for `/`, `/app`, `/stage` placeholders** - `e54c1bb` (feat)
3. **Task 3: README with run, build, deploy, and secrets instructions** - `f22828a` (docs)

**Plan metadata:** (this commit, immediately following)

_plan_head_before: `66475c84052a93ca6fb4978aa3be867d475857da`_

## Files Created/Modified
- `apps/web/src/pages/Landing.tsx` - Hero, Problem, How It Works, Waitlist, Footer sections
- `apps/web/src/components/Lamp.tsx` - inline SVG amber lamp with breathing glow, `color`/`className` props
- `apps/web/src/pages/AppPlaceholder.tsx` - Phase 4 family dashboard reservation
- `apps/web/src/pages/Stage.tsx` - projector view placeholder, imports `CALL_STATES`
- `apps/web/src/App.tsx` - pathname switch (`/`, `/app*`, `/stage`), no router dependency
- `apps/web/src/index.css` - `porch-glow` keyframes + `.lamp-glow` utility, `prefers-reduced-motion` guard
- `apps/web/index.html` - meta description + theme-color
- `README.md` - run/build/deploy/secrets/ref documentation

## Decisions Made
- Used the actual FBI IC3 2024 figure (~$4.9B lost by people 60+) already noted in PROJECT.md's "Problem data (verify before slides)" section, rather than the plan's illustrative $3.4B/2023 placeholder — both were always going to carry the same `TODO(human): verify IC3 figure` marker, so this just starts from the more likely-correct number.
- Lamp silhouette paths use plain `currentColor` (independent of the `color` prop), so only the radial-gradient glow changes color for Phase 3's stage reuse — keeps the silhouette visually stable across amber/green/red states.

## Deviations from Plan

None - plan executed exactly as written. (The IC3 figure source is a content-accuracy choice documented above under Decisions Made, not a deviation from any locked plan instruction — the plan explicitly left the exact figure to a "verify" marker either way.)

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required in this plan.

## Next Phase Readiness
Ready for Plan 03 (Firebase project creation + deploy). The landing page, lamp, routes, and README are complete and build-clean; the phone/desktop readability human-check and the SPA-rewrite deep-link behavior for `/app` and `/stage` both require a browser and/or a deployed Hosting site, which Plan 03's checkpoint provides. No blockers.

---
*Phase: 01-foundation-and-landing-page-live*
*Completed: 2026-09-22*

## Self-Check: PASSED

All 5 created files verified present on disk (apps/web/src/pages/Landing.tsx, apps/web/src/components/Lamp.tsx, apps/web/src/pages/AppPlaceholder.tsx, apps/web/src/pages/Stage.tsx, README.md). All 3 task commits (`f29a10a`, `e54c1bb`, `f22828a`) confirmed present in `git log --oneline`. Plan-level `<verification>` re-run: `pnpm -r typecheck` and `pnpm -r build` both exit 0; `ls apps/web/dist/assets | grep -ci firebase` == 1 (separate lazy chunk); every D-09 grep gate passes; README grep gates pass; no secret-shaped strings found in README.md.
