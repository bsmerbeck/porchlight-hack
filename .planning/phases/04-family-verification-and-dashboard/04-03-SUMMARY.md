---
phase: 04-family-verification-and-dashboard
plan: 03
subsystem: ui
tags: [react, firebase-firestore, onSnapshot, vitest, tailwind]

requires:
  - phase: 04-family-verification-and-dashboard (04-01)
    provides: "households/demo/feed/{callId} public-read mirror of the full D-05 CallDoc, fanned out from mirrorActiveCallToLamp"
provides:
  - "AppPlaceholder.tsx rewritten as the real family dashboard at /app: live call panel (transcript/risk/tactics/claimedIdentity/state) + history list with outcome badges + click-to-expand transcript/report"
  - "Stage.tsx rewritten as the projector view at /stage: single-call display, >=72px amber state banner, CSS-only risk meter, auto-scrolling transcript, full-bleed verified/scam takeover banner, optional WebAudio state-change beep"
  - "outcomeBadge.ts: pure CallDoc.outcome -> {label, tone} mapping, unit-tested"
  - "vitest wired into apps/web for the first time (test script + vitest.config.ts), reusing the exact vitest@3.2.7 already resolved for functions"
affects: ["04-family-verification-and-dashboard (post-merge hosting deploy + human visual UAT)", "05 (report generation fills in the 'Report pending' placeholder this plan intentionally left)"]

actuals:
  tokens: 5348
  tasks: 3
  commits: 3
plan_head_before: 8664b019bd1b918068808625fd1d122bac7f047c

tech-stack:
  added:
    - "vitest@3.2.7 added to apps/web devDependencies -- already resolved in pnpm-lock.yaml for functions, so no new network fetch was needed"
  patterns:
    - "Firebase kept lazily dynamic-imported inside useEffect on both pages, matching Sim.tsx's convention, even though App.tsx renders AppPlaceholder/Stage eagerly (not via lazy()) -- keeps the landing page's main chunk free of the firebase SDK"
    - "CSS-only risk meter: a div whose width is `${risk.score}%` and backgroundColor ramps green/amber/red by threshold, reusing Lamp.tsx's exact GLOW_COLOR oklch values for palette consistency -- no charting library"
    - "Per-workspace-package vitest.config.ts (functions/vitest.config.ts's pattern from 04-01) extended to apps/web, aliasing '@' to src/ the same way vite.config.ts does"

key-files:
  created:
    - apps/web/src/lib/outcomeBadge.ts
    - apps/web/src/lib/outcomeBadge.test.ts
    - apps/web/vitest.config.ts
  modified:
    - apps/web/src/pages/AppPlaceholder.tsx
    - apps/web/src/pages/Stage.tsx
    - apps/web/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Implemented the DASH-02 transcript/report detail view as inline row expansion (click a history row, it expands in place) instead of a modal -- apps/web/src/components/ui/ has no Dialog component, and adding one was out of scope for a 3-task plan."
  - "Did NOT run the plan's 'firebase deploy --only hosting' + curl verification from this isolated worktree: (a) the Vite build needs a Firebase web config file that lives only in the main checkout, not this worktree, and (b) this worktree's App.tsx still lacks 04-02's concurrent /verify route (04-02 owns App.tsx, not yet merged) -- deploying now would ship a site regression, not a completion. Logged to WINDOWS.md as an unrun-verify; recommend running the deploy once all Phase 4 wave plans merge to main."
  - "Active-call selection differs intentionally between the two pages: the dashboard's live panel excludes verified/scam (those move to history immediately), while the stage view keeps showing a call through verified/scam (only excluding 'ended') so its full-bleed takeover banner has a call to react to."

patterns-established:
  - "outcomeBadge(outcome?: string): {label, tone} is the single source of truth for DASH-02's badge language -- any future page showing call outcomes should import this rather than re-deriving label text."

requirements-completed: [DASH-01, DASH-02, DASH-03]

coverage:
  - id: D1
    description: "/app renders a live panel (transcript, risk meter, tactics chips, claimed identity, state badge) for the active call, driven by one onSnapshot on households/demo/feed"
    requirement: "DASH-01"
    verification:
      - kind: other
        ref: "pnpm --filter web build && pnpm --filter web exec tsc --noEmit (both exit 0); grep -c households/demo/feed apps/web/src/pages/AppPlaceholder.tsx -> 2; grep -qc \"doc(db, 'calls'\" apps/web/src/pages/AppPlaceholder.tsx -> no match (never reads calls/{id} directly)"
        status: pass
    human_judgment: true
    rationale: "Structural/data-source correctness is proven by the grep+build+typecheck checks above, but actual live rendering (transcript streaming, risk bar color, state badge) needs a deployed page and human eyes -- not run from this isolated worktree (see key-decisions)."
  - id: D2
    description: "History list shows Verified/Scam blocked/Screened/In progress outcome badges and each row expands to the full transcript plus report text (or 'Report pending')"
    requirement: "DASH-02"
    verification:
      - kind: unit
        ref: "apps/web/src/lib/outcomeBadge.test.ts (4 cases: verified/scam/screened/undefined) -- pnpm --filter web test -- outcomeBadge, all pass"
        status: pass
      - kind: other
        ref: "grep -c outcomeBadge apps/web/src/pages/AppPlaceholder.tsx -> 2 (imported and used in the history row)"
        status: pass
    human_judgment: true
    rationale: "The badge mapping itself is unit-proven, but click-to-expand UI interaction needs a human to click a row on a deployed page -- not run from this isolated worktree."
  - id: D3
    description: "/stage renders exactly one call in large type on a dark background with a live CSS-only risk meter, auto-scrolling transcript, and full-bleed verified/scam takeover banners"
    requirement: "DASH-03"
    verification:
      - kind: other
        ref: "pnpm --filter web build && pnpm --filter web exec tsc --noEmit (both exit 0); grep -c households/demo/feed apps/web/src/pages/Stage.tsx -> 2; grep -qc \"doc(db, 'calls'\" apps/web/src/pages/Stage.tsx -> no match"
        status: pass
    human_judgment: true
    rationale: "Projector-readability, banner timing, and the audio cue are inherently visual/experiential -- the hackathon_rules dispatch note explicitly calls this a human item; not run from this isolated worktree."

duration: ~20min
completed: 2026-09-22
status: complete
---

# Phase 04 Plan 03: Family Dashboard + Stage View Summary

**Family dashboard (`/app`) and projector stage view (`/stage`) both driven by a single `onSnapshot` on the public `households/demo/feed` mirror -- live transcript, CSS-only risk meter, tactics chips, outcome badges with click-to-expand history, and a full-bleed VERIFIED/SCAM BLOCKED takeover banner for the stage, all without ever reading `calls/{id}` directly.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-22T04:15:00Z (approx.)
- **Completed:** 2026-09-22T04:35:00Z (approx.)
- **Tasks:** 3/3 completed
- **Files modified:** 7 (3 created, 4 modified), 3 commits

## Accomplishments
- `AppPlaceholder.tsx` (the `/app` route) now subscribes to `households/demo/feed` ordered by `startedAt desc`, picks the active (non-ended/verified/scam) call for a live panel (transcript, `risk.score` bar colored green/amber/red, `risk.tactics[]` chips, `risk.claimedIdentity`, `state` badge), and lists the rest as history rows with a real `outcomeBadge()`-driven badge that expand in place to show the full transcript and `report` text (or "Report pending" when absent).
- `Stage.tsx` (the `/stage` route) subscribes to the same feed collection, shows exactly one call (the newest non-ended, falling back to the newest overall) in projector-sized type: a >=72px amber state banner (SCREENING / VERIFYING... / VERIFIED CHECK / SCAM BLOCKED), a giant CSS-only risk meter, auto-scrolling transcript, and a full-bleed green/red takeover banner for 5s on entering `verified`/`scam`, plus an optional WebAudio beep on state transitions gated behind an "Enable sound cue" click.
- `outcomeBadge.ts` is the single pure mapping from `CallDoc.outcome` to `{label, tone}`, unit-tested with 4 Vitest cases including the `undefined` ("In progress") case.
- Added `vitest` to `apps/web` for the first time (it previously had zero tests), reusing the exact `vitest@3.2.7` version already resolved for `functions` in `pnpm-lock.yaml` -- no new network install needed.
- Both pages read exclusively from `households/demo/feed/*`; confirmed via grep that neither file ever calls `doc(db, 'calls', ...)`.
- Firebase stays lazily dynamic-imported inside `useEffect` on both pages (matching `Sim.tsx`'s established convention), even though `App.tsx` renders them eagerly rather than via `lazy()` -- keeps the landing page's chunk free of the Firebase SDK.

## Task Commits

Each task was committed atomically:

1. **Task 1: Dashboard tracer -- /app subscribes to households/demo/feed and renders one active call end-to-end** - `3fb7d41` (feat)
2. **Task 2: Outcome badges + transcript/report detail view (DASH-02 completion)** - `926ca62` (test)
3. **Task 3: Stage view -- projector-friendly single-call display (DASH-03)** - `fbff321` (feat)

**Plan metadata:** this SUMMARY's own commit (immediately following).

## Files Created/Modified
- `apps/web/src/pages/AppPlaceholder.tsx` - rewritten in place as the real family dashboard at `/app`
- `apps/web/src/pages/Stage.tsx` - rewritten in place as the projector stage view at `/stage`
- `apps/web/src/lib/outcomeBadge.ts` - pure outcome-to-badge mapping
- `apps/web/src/lib/outcomeBadge.test.ts` - 4 Vitest cases
- `apps/web/vitest.config.ts` - new per-package Vitest config (`@` alias, node environment)
- `apps/web/package.json` - added `test` script + `vitest` devDependency
- `pnpm-lock.yaml` - lockfile updated for the new `vitest` specifier on `apps/web` (already resolved elsewhere, no new download)

## Decisions Made
See `key-decisions` in frontmatter above -- summarized: transcript/report detail is an inline row expansion (no Dialog component exists in `apps/web/src/components/ui/`); the dashboard's "active call" excludes verified/scam (they move to history immediately) while the stage view's "active call" only excludes `ended` (so the takeover banner has something to react to); hosting deploy + live curl/visual verification was deliberately NOT run from this isolated worktree (see Deviations).

## Deviations from Plan

### Auto-fixed Issues

None - both tasks' code matched the plan's `<action>` specs without needing a Rule 1/2/3 fix.

### Scope note (not a deviation, a deferral)

**Hosting deploy + curl verification not run from this worktree.**
- **What the plan asked:** `firebase deploy --only hosting --project porchlight-hack`, then curl `/app` and `/stage` for 200, then a human visual check.
- **Why deferred:** (1) the Vite build needs a Firebase web config that exists only in the main checkout's untracked env file, not this git worktree, and reading/copying that file is blocked by this environment's secret-file protections; (2) even with that config, this worktree's `App.tsx` is still the pre-04-02 version (04-02 owns `App.tsx` and is running concurrently, unmerged) -- deploying now would ship a site missing the `/verify` route mid-integration, a regression rather than progress.
- **What was verified instead:** `pnpm --filter web build`, `pnpm --filter web exec tsc --noEmit`, and `pnpm -r typecheck` all exit 0; `pnpm --filter web test -- outcomeBadge` passes 4/4; the built `dist/assets/*.js` bundle was grepped and confirmed to contain both new pages' distinguishing strings (`"SCAM BLOCKED"`, `"Family dashboard"`).
- **Logged to** `.planning/WINDOWS.md` as an `unrun-verify` entry (id 2) plus a `stub` entry (id 3) for the intentional "Report pending" placeholder.
- **Recommended next step:** once all Phase 4 wave plans (04-02, 04-03, and the Phase 2 fix) merge to `main`, rebuild from `main` with the real env config and run `firebase deploy --only hosting --project porchlight-hack`, then curl-verify `/app` and `/stage` and do the human visual pass.

---

**Total deviations:** 0 auto-fixed. One scope note (deploy/curl/visual verification deferred to post-merge integration, logged to WINDOWS.md).
**Impact on plan:** No code deviation from the plan's `<action>` specs. The deferred deploy step is an integration-ordering concern specific to running this plan in an isolated worktree alongside a concurrent sibling that owns `App.tsx`, not a defect in this plan's own deliverables.

## Issues Encountered
- `apps/web` had zero test infrastructure before this plan (no `vitest`, no test script). Added it following the exact per-package `vitest.config.ts` pattern `functions/vitest.config.ts` established in 04-01, and reused the already-lockfile-resolved `vitest@3.2.7` rather than picking a new version.

## User Setup Required

None - no external service configuration required by this plan's own code. (The deferred deploy step needs the project's existing Firebase web config, already documented in `apps/web/.env.example`; no new setup.)

## Next Phase Readiness
- `/app` and `/stage` are both feature-complete against DASH-01/02/03 and build/typecheck/test clean; ready to deploy once merged with 04-02's `/verify` route.
- Phase 5 (report generation) has a clear seam: `AppPlaceholder.tsx`'s expanded history row already renders `call.report` when present and falls back to "Report pending" otherwise -- no code change needed on this page when Phase 5 starts writing `report` onto `calls/{id}` (and thus the feed mirror).
- Blocker for full end-to-end demo verification: hosting deploy + human visual check, deferred to post-merge (see Deviations / WINDOWS.md).

---
*Phase: 04-family-verification-and-dashboard*
*Completed: 2026-09-22*

## Self-Check: PASSED

- FOUND: apps/web/src/pages/AppPlaceholder.tsx
- FOUND: apps/web/src/pages/Stage.tsx
- FOUND: apps/web/src/lib/outcomeBadge.ts
- FOUND: apps/web/src/lib/outcomeBadge.test.ts
- FOUND: apps/web/vitest.config.ts
- FOUND: .planning/phases/04-family-verification-and-dashboard/04-03-SUMMARY.md
- FOUND commit: 3fb7d41 (Task 1)
- FOUND commit: 926ca62 (Task 2)
- FOUND commit: fbff321 (Task 3)
