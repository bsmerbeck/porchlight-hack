---
phase: 04-family-verification-and-dashboard
plan: POLISH
subsystem: ui
tags: [react, tailwind, firebase-firestore, webauthn, localStorage]

requires:
  - phase: 04-family-verification-and-dashboard (04-02)
    provides: "Verify.tsx (/verify) phone-side enroll/arm/answer flow and memberSession.ts localStorage pairing"
  - phase: 04-family-verification-and-dashboard (04-03)
    provides: "AppPlaceholder.tsx (/app) and Stage.tsx (/stage), both driven by a single onSnapshot on households/demo/feed"
provides:
  - "memberSession.ts: pairing (which member id) and passkey enrollment (did finishPasskeyRegistration succeed on this device) are now separate localStorage flags, closing the enrollment-bypass gap"
  - "Verify.tsx: a bare ?member= query param only pre-selects the Enroll button's target member; ?member=X&paired=1 is the documented escape hatch that still bypasses Enroll for the VER-05 link-fallback demo path; the armed screen shows 'Passkey: enrolled' or 'Passkey: not enrolled — using secure link'"
  - "LiveCounter.tsx: singular/plural waitlist grammar (1 family / N families)"
  - "Stage.tsx: bannerStyle() colors the persistent state banner per verdict (green verified/known, red scam, blue message, pulsing amber verifying) instead of always amber"
  - "AppPlaceholder.tsx: badge colors (BADGE_TONE_CLASS) now match Stage.tsx's palette instead of falling through to the Badge 'default' variant's brand amber for verified/known"
affects: ["04-family-verification-and-dashboard (post-merge hosting redeploy needed — see Deviations)", "any later phase reading porchlight_member_id/porchlight_passkey_enrolled from memberSession.ts"]

actuals:
  tokens: 4262
  tasks: 5
  commits: 4
plan_head_before: bf72b2cb5cdf50e856d34c1bdaf0d916674b2be7

tech-stack:
  added: []
  patterns:
    - "Pairing vs. enrollment split into two localStorage keys (porchlight_member_id / porchlight_passkey_enrolled) so 'which member is this phone' and 'has this phone actually completed the passkey ceremony' can be asked independently — the ?member= query param only ever answers the first question."
    - "BADGE_TONE_CLASS / bannerStyle share the same green/amber/red/blue palette across Stage.tsx (banner) and AppPlaceholder.tsx (badges), layered on top of the Badge component's 'secondary' variant via className since shadcn's Badge has no native green/amber/blue variant (matches the pre-existing 'info'/blue convention)."

key-files:
  created: []
  modified:
    - apps/web/src/lib/memberSession.ts
    - apps/web/src/pages/Verify.tsx
    - apps/web/src/components/LiveCounter.tsx
    - apps/web/src/pages/Stage.tsx
    - apps/web/src/pages/AppPlaceholder.tsx

key-decisions:
  - "`?member=brenden&paired=1` escape hatch pairs the phone (skips Enroll) but deliberately does NOT set porchlight_passkey_enrolled — handleAnswer's WebAuthn attempt will naturally fail (no real credential registered) and fall through to the existing link-token fallback path, so the escape hatch exercises VER-05's real fallback code path rather than faking a passkey success."
  - "Kept memberSession.ts's public API surface additive (getPairedMemberId/setPairedMemberId unchanged; added isPasskeyEnrolled/setPasskeyEnrolled; recoverPairedMemberIdFromQuery now returns the query member id instead of void) rather than introducing new module-level state, since the only two callers (Verify.tsx, memberSession.ts itself) were both in-scope to update."
  - "'Passkey: enrolled' / 'not enrolled — using secure link' status text placed on the armed/waiting screen (not the enroll screen) since that's the surface where verification will actually happen and where the mode matters to whoever is holding the phone."
  - "Left AppPlaceholder.tsx's Firestore query untouched for the 'newest history first' item — households/demo/feed is already queried with orderBy('startedAt', 'desc') and Array.filter() preserves order, so history was already newest-first; added a one-line comment documenting this instead of a no-op re-sort."

patterns-established:
  - "liveCallBadge(call) / bannerStyle(call): the outcome-aware color+label override pattern already used by Stage.tsx's stateLabel/OUTCOME_STATE_LABEL is now applied everywhere a call's state/outcome is rendered as a badge or banner, so 'known' and 'message' outcomes read identically (label and color) on both /stage and /app."

requirements-completed: []

coverage:
  - id: D1
    description: "A bare /verify?member=brenden no longer bypasses the passkey enroll screen; ?member=brenden&paired=1 remains a working escape hatch; the armed screen shows the active passkey/link-fallback mode"
    verification:
      - kind: other
        ref: "pnpm --filter web build && pnpm -r typecheck (both exit 0); code review of memberSession.ts + Verify.tsx confirms recoverPairedMemberIdFromQuery no longer calls setPairedMemberId unless paired=1 is present, and handleEnroll is the only remaining call to setPasskeyEnrolled"
        status: pass
    human_judgment: true
    rationale: "This is a client-side auth-adjacent gating change with no unit tests in the repo (apps/web's vitest environment is 'node', no jsdom/window/localStorage available to exercise memberSession.ts directly) — a human should manually load /verify?member=brenden on a fresh device/incognito profile and confirm the Enroll screen still appears before relying on this in the live demo."
  - id: D2
    description: "Landing waitlist counter reads '1 family on the waitlist' for n=1 and 'N families on the waitlist' otherwise"
    verification:
      - kind: other
        ref: "code review of apps/web/src/components/LiveCounter.tsx; pnpm --filter web build exits 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "/stage's persistent state banner is green for verified/known, red for scam, blue for message, pulsing amber while verifying (previously always static amber); transcript auto-scroll to newest turn confirmed already working"
    verification:
      - kind: other
        ref: "pnpm --filter web build && pnpm -r typecheck (both exit 0); code review of Stage.tsx's new bannerStyle()"
        status: pass
    human_judgment: true
    rationale: "Color correctness and the pulsing animation are inherently visual — needs a human (or the other executor's post-merge visual pass) looking at the deployed /stage page during a live/simulated call to confirm the banner actually reads as intended on the projector."
  - id: D4
    description: "/app's badge colors for verified/known/verifying now match /stage's palette (green/amber) instead of the Badge 'default' variant's brand amber; history list confirmed already newest-first"
    verification:
      - kind: other
        ref: "pnpm --filter web build && pnpm -r typecheck (both exit 0); code review of AppPlaceholder.tsx's BADGE_TONE_CLASS/STATE_BADGE_CLASS/liveCallBadge"
        status: pass
    human_judgment: true
    rationale: "Same visual-consistency judgment as D3 — needs eyes on the deployed /app page, not just passing type/build checks."

duration: ~25min
completed: 2026-09-22
status: complete
---

# Phase 4 Polish: Verify Enrollment Gate + Stage/Dashboard Color Consistency Summary

**Closed a `?member=` enrollment bypass in `/verify`, fixed waitlist counter grammar, and made `/stage`'s state banner and `/app`'s badges use the same verdict color palette (green/amber/red/blue) instead of a fixed/mismatched amber.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 5/5 completed (4 code tasks + verification/deploy)
- **Files modified:** 5
- **Commits:** 4 task commits (this SUMMARY is commit 5)

## Accomplishments
- **Verify enrollment gate (security-relevant fix):** `?member=brenden` alone used to both pair AND fully enroll the phone, letting anyone with the URL skip the Face ID/Touch ID ceremony entirely. `memberSession.ts` now tracks pairing (`porchlight_member_id`) and passkey enrollment (`porchlight_passkey_enrolled`) as two independent flags; a bare query param only pre-selects which member the Enroll button targets. `?member=brenden&paired=1` is a documented escape hatch that still bypasses Enroll, for rehearsing the VER-05 secure-link fallback path without redoing the ceremony on a device. This matches `DEMO.md` step 4's own description of the expected flow ("confirm they're enrolled... if not, they tap Enroll"), which the old code silently violated.
- **Armed-screen status text:** the waiting-for-a-call screen now shows "Passkey: enrolled" or "Passkey: not enrolled — using secure link" so whoever is holding the phone (and the builder, debugging) can see which verification mode is active.
- **Waitlist grammar:** `LiveCounter.tsx` now reads "1 family on the waitlist" vs "N families on the waitlist" instead of always pluralizing.
- **Stage banner colors:** `Stage.tsx`'s persistent state banner previously rendered in a fixed amber regardless of call state — directly contradicting its own code comment about the banner staying green for a known-caller call. `bannerStyle()` now returns green for verified/known, red for scam, blue for message, and a pulsing amber (`animate-pulse`) while verifying; idle/screening/ended keep the neutral amber. Transcript auto-scroll-to-newest-turn was already implemented correctly and needed no change.
- **Dashboard badge colors:** `AppPlaceholder.tsx`'s "verified"/"known" badges fell through to the Badge component's `default` variant, which resolves to the brand amber (`--primary`), not green — inconsistent with `/stage`'s green verdict. Introduced a shared `BADGE_TONE_CLASS` palette (green/amber/blue) reused by both the live-call state badge and the history row's outcome badge, and gave the live-call badge the same `known`/`message` outcome-aware label override `/stage` already has. History ordering was checked and is already newest-first (Firestore `orderBy('startedAt', 'desc')` plus order-preserving `.filter()`) — documented with a comment, no behavior change needed.
- Full verification suite green: `pnpm -r typecheck`, `pnpm --filter web build`, `pnpm --filter web test` (13/13 existing tests) all pass. Deployed `firebase deploy --only hosting --project porchlight-hack` — succeeded (`https://porchlight-hack.web.app`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix /verify enrollment bypass (memberSession.ts + Verify.tsx)** - `26683d2` (fix)
2. **Task 2: Landing counter singular/plural grammar** - `0ddf78e` (fix)
3. **Task 3: Stage.tsx state banner colors + pulsing verifying state** - `44ca137` (fix)
4. **Task 4: AppPlaceholder.tsx badge colors matched to Stage + history order confirmed** - `a03c9f8` (fix)

**Plan metadata:** this SUMMARY's own commit (immediately following).

## Files Created/Modified
- `apps/web/src/lib/memberSession.ts` - split pairing and passkey-enrollment into separate localStorage flags; `recoverPairedMemberIdFromQuery` now only pairs on the `&paired=1` escape hatch
- `apps/web/src/pages/Verify.tsx` - enroll screen targets a pre-selected (not auto-paired) member id; armed screen shows passkey/link-fallback mode text
- `apps/web/src/components/LiveCounter.tsx` - singular/plural waitlist copy
- `apps/web/src/pages/Stage.tsx` - `bannerStyle()` colors the state banner per verdict, pulses amber while verifying
- `apps/web/src/pages/AppPlaceholder.tsx` - `BADGE_TONE_CLASS`/`STATE_BADGE_CLASS`/`liveCallBadge` align badge colors with Stage.tsx; history-order comment added

## Decisions Made
See `key-decisions` in frontmatter above — summarized: the `paired=1` escape hatch intentionally does not fake passkey enrollment (it exercises the real link-token fallback code path); `memberSession.ts`'s public API grew additively rather than being restructured; the enrollment-mode status text lives on the armed screen; history order needed no code change, only a documenting comment.

## Deviations from Plan

### Auto-fixed Issues

None — this prompt-as-plan's four described fixes were each genuine, verifiable bugs (the enrollment bypass and the Stage/Badge amber-instead-of-verdict-color mismatches were even self-contradicted by existing code comments), so no additional Rule 1/2/3 fixes were needed beyond what was asked.

---

**Total deviations:** 0 auto-fixed beyond the plan's own four described fixes.
**Impact on plan:** None — plan executed as written.

## Issues Encountered
- `apps/web`'s Vitest config runs in a `node` environment (no `jsdom`/`window`/`localStorage`), so no new automated test could be added for `memberSession.ts`'s enrollment-gate logic without introducing a new `jsdom` devDependency — out of scope for a polish task under a feature freeze. Verified instead via code review, `tsc --noEmit`, and `vite build`; flagged in `coverage` (D1) as needing a human manual check (load `/verify?member=brenden` on a fresh/incognito device and confirm Enroll still shows).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- **Hosting was deployed from this worktree** (`firebase deploy --only hosting --project porchlight-hack`, succeeded). Per this plan's parallel-execution note: another executor may deploy hosting concurrently for its own `Sim.tsx` change. **The orchestrator must redeploy hosting once both this worktree's changes and the sibling `Sim.tsx`/`functions/` changes are merged to `main`**, so the live site reflects both sets of fixes together rather than whichever deploy happened to run last.
- Recommend a human manually exercise `/verify?member=brenden` (expect Enroll screen) and `/verify?member=brenden&paired=1` (expect armed screen, "not enrolled — using secure link") on the redeployed site before the live demo, per D1's rationale above.
- `/stage` and `/app` visual color changes should get a quick human look on the redeployed site (D3/D4) — no code blockers, just standard post-deploy visual confirmation given the demo's projector-readability requirement.

---
*Phase: 04-family-verification-and-dashboard*
*Completed: 2026-09-22*

## Self-Check: PASSED

- FOUND: apps/web/src/lib/memberSession.ts
- FOUND: apps/web/src/pages/Verify.tsx
- FOUND: apps/web/src/components/LiveCounter.tsx
- FOUND: apps/web/src/pages/Stage.tsx
- FOUND: apps/web/src/pages/AppPlaceholder.tsx
- FOUND: .planning/phases/04-family-verification-and-dashboard/04-POLISH-SUMMARY.md
- FOUND commit: 26683d2 (Task 1)
- FOUND commit: 0ddf78e (Task 2)
- FOUND commit: 44ca137 (Task 3)
- FOUND commit: a03c9f8 (Task 4)
