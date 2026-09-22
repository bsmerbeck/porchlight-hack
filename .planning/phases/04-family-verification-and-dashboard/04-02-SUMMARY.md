---
phase: 04-family-verification-and-dashboard
plan: 02
subsystem: auth
tags: [webauthn, simplewebauthn-browser, react, firestore-onsnapshot, vitest, web-audio, vibration-api]

# Dependency graph
requires:
  - phase: 04-family-verification-and-dashboard (Plan 01)
    provides: "startPasskeyRegistration/finishPasskeyRegistration/startPasskeyAuthentication/answerVerification onCall Functions; prompts/{memberId} public-read mirror doc carrying {callId, state, claimedIdentity, promptedAt, token}"
provides:
  - "apps/web/src/pages/Verify.tsx: the member phone app -- unpaired-phone passkey enrollment + paired-phone full-screen Yes/No verify modal, wired at /verify"
  - "apps/web/src/lib/memberSession.ts: localStorage memberId pairing + ?member= recovery"
  - "apps/web/src/lib/webauthn.ts: isolated @simplewebauthn/browser wrapper"
  - "apps/web/src/lib/verifyCountdown.ts: pure, unit-tested 20s countdown arithmetic"
  - "apps/web now has a Vitest test runner (pnpm --filter web test) -- did not exist before this plan"
affects: ["04-03-dashboard (no direct dependency, but shares the porchlight-hack.web.app hosting deploy)"]

actuals:
  tokens: 5376
  tasks: 3
  commits: 3
plan_head_before: 8664b019bd1b918068808625fd1d122bac7f047c

tech-stack:
  added:
    - "@simplewebauthn/browser@14.0.0 -- pre-vetted in 04-01's Task 2 package-legitimacy checkpoint (same MasterKale/SimpleWebAuthn family); no second checkpoint needed here per this plan's own precondition"
    - "vitest@^3.2.7 as a devDependency of apps/web -- first test runner this app has had; matches functions/package.json's already-installed version"
  patterns:
    - "apps/web/src/lib/webauthn.ts isolates @simplewebauthn/browser behind async wrapper functions with dynamic imports, mirroring apps/web/src/lib/firebase.ts's existing lazy-import isolation pattern -- Verify.tsx never imports the vendor package directly"
    - "Countdown/expiry arithmetic extracted into a pure, DOM-free module (verifyCountdown.ts) specifically so it is unit-testable without a browser -- the same test-first pattern this app should reuse for any future timer-driven UI"
    - "Web Audio unlock-then-alert pattern: a real click handler creates an AudioContext and plays a 1-sample near-silent buffer to satisfy the browser's autoplay-gesture requirement; the later alert tone (fired from an onSnapshot callback, no gesture in that call stack) reuses the already-unlocked context"

key-files:
  created:
    - apps/web/src/lib/memberSession.ts
    - apps/web/src/lib/webauthn.ts
    - apps/web/src/lib/verifyCountdown.ts
    - apps/web/src/lib/verifyCountdown.test.ts
    - apps/web/src/pages/Verify.tsx
  modified:
    - apps/web/src/App.tsx
    - apps/web/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Added vitest to apps/web (previously untested) rather than skipping Task 2's tdd=\"true\" requirement or hand-rolling assertions -- matches functions/package.json's already-installed vitest major (^3.2.7) so the monorepo has one Vitest version, not two."
  - "Yes handler checks webauthn.platformAuthenticatorIsAvailable() before attempting the ceremony (rather than always attempting startPasskeyAuthentication and only catching the throw) -- avoids an unnecessary Functions round-trip when the browser already knows a platform authenticator can't exist, while still falling back to the VER-05 token on any ceremony throw even when the availability check itself said yes (real-world authenticator failures are not fully predicted by platformAuthenticatorIsAvailable())."
  - "Result state (VERIFIED/SCAM BLOCKED, shown 5s) is driven by answerVerification's own {verified} response, not by waiting for prompts/{memberId} to clear via the mirror trigger -- gives the family member's phone instant feedback rather than waiting on an extra Firestore round-trip."
  - "Alert tone is a synthesized Web Audio oscillator beep (no bundled audio asset) -- avoids adding a binary asset to the repo for a single demo tone; the visual full-screen modal remains the channel that never fails (Pitfall 4/5), audio is a pure enhancement."

patterns-established:
  - "Countdown/expiry pure-function extraction (verifyCountdown.ts) for any timer-driven UI in this app going forward."
  - "webauthn.ts-style dynamic-import isolation wrapper for any future browser-only vendor package that should not bloat the landing page's default chunk."

requirements-completed: [VER-01, VER-02]

coverage:
  - id: D1
    description: "An unpaired phone visiting /verify can enroll a passkey against the real deployed startPasskeyRegistration/finishPasskeyRegistration callables, then shows the armed idle state"
    requirement: "VER-01"
    verification:
      - kind: e2e
        ref: "pnpm --filter web build produces a standalone Verify-*.js lazy chunk; pnpm --filter web exec tsc --noEmit exits 0"
        status: pass
      - kind: manual_procedural
        ref: "Task 3: real phone enrollment against the deployed site with a platform authenticator"
        status: unknown
    human_judgment: true
    rationale: "A real WebAuthn ceremony requires a physical platform authenticator (Face ID/Touch ID/Android biometric) hitting the deployed porchlight-hack.web.app origin -- cannot be exercised from this CLI-only executor. Task 3 documents the exact manual steps under Human Follow-up below; build/typecheck-level proof is captured above."
  - id: D2
    description: "computeSecondsLeft/hasExpired pure countdown arithmetic matches the plan's <behavior> spec exactly"
    verification:
      - kind: unit
        ref: "apps/web/src/lib/verifyCountdown.test.ts (7 tests: 20 at t=0, 0 at t=20000, clamped at t=45000, 15 at t=5000, hasExpired at 0/-1/1/20)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A paired phone subscribes to prompts/{memberId} and shows a full-screen Yes/No modal the instant prompt.state==='verifying', with a live 20s countdown"
    requirement: "VER-02"
    verification:
      - kind: unit
        ref: "grep -c answerVerification apps/web/src/pages/Verify.tsx -> 6 (non-zero, per plan's <fails_when>)"
        status: pass
      - kind: manual_procedural
        ref: "Task 3: phone-in-hand live prompt test"
        status: unknown
    human_judgment: true
    rationale: "The ~2s live-latency claim and the actual full-screen appearance on a real device require a live Firestore write + a real phone screen -- documented as a manual step in Task 3 / Human Follow-up, not exercisable from this executor."
  - id: D4
    description: "Yes always attempts the real passkey ceremony (or the VER-05 token fallback when the platform authenticator is unavailable or the ceremony throws) before calling answerVerification -- never a bare answer:'yes'; No/timeout never touch WebAuthn"
    verification:
      - kind: unit
        ref: "Source inspection: apps/web/src/pages/Verify.tsx handleAnswer -- the 'yes' branch always resolves either `response` (via startPasskeyAuthentication + webauthn.startAuthentication) or `currentPrompt.token` before calling answerVerification, and throws (never calls answerVerification with a bare yes) if neither is available; the else branch (no/timeout) never references webauthn.*"
        status: pass
    human_judgment: false
  - id: D5
    description: "Audio/vibrate alerting is gated behind an explicit user-gesture 'Enable alerts' button and never blocks the visual Yes/No modal on failure"
    verification:
      - kind: unit
        ref: "grep -c vibrate apps/web/src/pages/Verify.tsx -> 3 (feature-detected via 'vibrate' in navigator, try/catch-wrapped); unlockAudio/playAlertTone both wrapped in try/catch and never awaited/thrown into the render path"
        status: pass
    human_judgment: false
  - id: D6
    description: "The deployed https://porchlight-hack.web.app/verify route returns 200 after this plan's hosting deploy"
    verification:
      - kind: other
        ref: "curl -s -o /dev/null -w '%{http_code}' https://porchlight-hack.web.app/verify -> 200 (checked live, post-deploy, this session)"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-09-22
status: complete
---

# Phase 4 Plan 2: Member Phone Verify App Summary

Built the `/verify` page -- the family member's phone-side passkey enrollment UI plus a full-screen "Are you calling Grandma right now?" Yes/No modal with a live 20s countdown, gesture-gated audio/vibrate alerting, and a WebAuthn-or-VER-05-token Yes path -- and deployed it live to `porchlight-hack.web.app`.

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-09-22T04:39:00Z
- **Tasks:** 3/3 completed (Task 3's phone-in-hand test is a documented human follow-up, per dispatch instructions -- not a blocking checkpoint)
- **Files modified:** 8 (5 created, 3 modified), 3 commits

## Accomplishments
- `apps/web/src/pages/Verify.tsx` is a `React.lazy`-loaded page (own `Verify-*.js` chunk, confirmed via build output) wired into `App.tsx`'s existing pathname routing at `/verify`, the only touch this plan made to `App.tsx`.
- Unpaired-phone enrollment calls the real deployed `startPasskeyRegistration`/`finishPasskeyRegistration` (04-01), pipes the options through `@simplewebauthn/browser`'s `startRegistration` (isolated behind `apps/web/src/lib/webauthn.ts`), and pairs the phone via `apps/web/src/lib/memberSession.ts`'s localStorage `porchlight_member_id` (with a `?member=` query-param recovery path, per Pitfall 7).
- Paired phones subscribe to `prompts/{memberId}` via `onSnapshot` and render a full-screen black modal with a live countdown (from the new, unit-tested `apps/web/src/lib/verifyCountdown.ts`) the instant `prompt.state==='verifying'`.
- Yes always attempts `startPasskeyAuthentication` + `startAuthentication` first (gated by `platformAuthenticatorIsAvailable()`), falling back to `answerVerification({answer:'yes', token: prompt.token})` (VER-05) only when the platform authenticator is unavailable or the ceremony throws -- source-inspected to confirm a bare `answer:'yes'` is never possible. No/timeout call `answerVerification({answer})` with zero WebAuthn code paths.
- Alerting is layered: a gesture-gated "Enable alerts" button unlocks a `AudioContext` (Chrome/Safari autoplay-gesture requirement, Pitfall 5); `navigator.vibrate` is feature-detected and `try`/`catch`-wrapped (Pitfall 4, iOS Safari unreliability); both are enhancement-only and never block the Yes/No buttons.
- Any `answerVerification` throw shows an inline error and re-enables the buttons rather than silently closing the modal (source-inspected: the `catch` block sets `answerError`, the `finally` block resets `answering`, and the modal only unmounts via the separate `result`/`prompt.state` branches).
- A 5s full-screen VERIFIED ✓ / SCAM BLOCKED result screen (driven by `answerVerification`'s own response, not a second Firestore round-trip) precedes returning to the armed idle screen.
- `apps/web` gained its first test runner (`vitest@^3.2.7`, `pnpm --filter web test`) -- `verifyCountdown.test.ts`'s 7 cases all pass; `pnpm -r typecheck` (functions, packages/shared, apps/web) and `pnpm --filter web build` both exit 0.
- Deployed live: `firebase deploy --only hosting --project porchlight-hack` succeeded; `curl` against `https://porchlight-hack.web.app/verify` returns `200` (Task 3's automated check).

## Task Commits

Each task was committed atomically (Task 2's `tdd="true"` produced the RED/GREEN split):

1. **Task 1: /verify route tracer -- unpaired phone enrolls a passkey** - `660b840` (feat)
2. **Task 2 RED: failing test for verify countdown arithmetic** - `30272c0` (test)
3. **Task 2 GREEN: full-screen Yes/No verify modal + passkey-or-token Yes path** - `ffd47b0` (feat)
4. **Task 3: checkpoint:human-action** - N/A (no code change; deploy + curl check performed live this session, human phone-in-hand test documented below, not executed by this agent)

**Plan metadata:** this SUMMARY's own commit (immediately following).

## Files Created/Modified
- `apps/web/src/pages/Verify.tsx` - enrollment UI + full-screen Yes/No verify modal + result screen
- `apps/web/src/lib/memberSession.ts` - localStorage memberId pairing (Pitfall 7)
- `apps/web/src/lib/webauthn.ts` - isolated `@simplewebauthn/browser` dynamic-import wrapper
- `apps/web/src/lib/verifyCountdown.ts` + `.test.ts` - pure 20s countdown arithmetic, unit-tested
- `apps/web/src/App.tsx` - adds the lazy `/verify` route (minimal diff, matching `/sim`)
- `apps/web/package.json` / `pnpm-lock.yaml` - adds `@simplewebauthn/browser@14.0.0` (deps) and `vitest@^3.2.7` + a `test` script (devDeps)

## Decisions Made
See `key-decisions` in frontmatter above -- summarized: added vitest to apps/web (previously had none) to satisfy Task 2's `tdd="true"` requirement, matching the version already installed in `functions`; the Yes handler checks `platformAuthenticatorIsAvailable()` before attempting the ceremony but still falls back to the token on any ceremony throw regardless of that check's answer; the 5s result screen is driven by `answerVerification`'s own response rather than waiting on the `prompts/{memberId}` mirror to clear; the alert tone is a synthesized Web Audio beep rather than a bundled audio asset.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] apps/web had no test runner, but Task 2 requires `tdd="true"` and `pnpm --filter web test -- verifyCountdown` to pass**
- **Found during:** Task 2, before writing the RED test
- **Issue:** `apps/web/package.json` had no `test` script and no Vitest devDependency -- the plan's own `<verify>` command (`pnpm --filter web test -- verifyCountdown`) could not run at all.
- **Fix:** Added `vitest@^3.2.7` (matching `functions/package.json`'s already-installed major) as a devDependency and a `"test": "vitest run"` script to `apps/web/package.json`. No custom `vitest.config.ts` was needed -- Vite's own config (`apps/web/vite.config.ts`) already provides the `@` alias and React/Tailwind plugins Vitest reuses by default.
- **Files modified:** `apps/web/package.json`, `pnpm-lock.yaml`
- **Verification:** `pnpm --filter web test -- verifyCountdown` runs and all 7 cases pass; committed as part of the RED commit (framework setup is a one-time cost of the first TDD task in this app, per the TDD reference's `framework_setup` guidance).
- **Committed in:** `30272c0`

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking issue), necessary for Task 2's TDD requirement to be executable at all. No scope creep -- the fix is exactly the missing test infrastructure the plan's own `<verify>` command assumed existed.

## Issues Encountered

None.

## Human Follow-up

**Task 3 (checkpoint:human-action) was not executed by this agent, per dispatch instructions** ("do NOT stop; document the exact steps in SUMMARY under 'Human follow-up'"). This plan's automated portion of Task 3 (deploy + `/verify` returns 200) was completed live this session. The remaining manual steps, to be run on a real phone before the demo:

1. On the phone that will be handed to a judge, visit `https://porchlight-hack.web.app/verify` and tap "Enroll this phone."
2. Complete the platform authenticator ceremony (Face ID / Touch ID / Android screen lock).
3. Confirm the page switches to the "Armed — waiting for a call" idle state, and optionally tap "Enable alerts" to unlock audio/vibrate on that phone.
4. From a second device, drive a call into `state:'verifying'` with `verification.memberId: 'brenden'` -- either a real call, or `/sim`'s `JAIL_SCRIPT[0]` ("Hi grandma, it's me, Brenden.") per `04-RESEARCH.md`, which already triggers `verifying` through the existing `runTurn`/`matchIdentity` path with zero new code.
5. Confirm the full-screen prompt appears on the enrolled phone within ~2s, with sound/vibration where supported.
6. Tap Yes and confirm the passkey ceremony completes and the call moves to `verified` (green result screen for 5s, then back to armed idle).
7. Repeat once tapping No (or letting the 20s countdown expire) and confirm the call moves to `scam` (red result screen for 5s).

**Also note for the orchestrator:** this plan ran `firebase deploy --only hosting --project porchlight-hack` from this worktree, which deploys ONLY this plan's committed code (04-01's backend + this plan's frontend). If `04-03` (dashboard/stage) also deploys hosting concurrently from its own worktree, whichever deploy runs last will NOT include the other plan's frontend changes until both are merged. **The orchestrator must run `pnpm --filter web build && firebase deploy --only hosting --project porchlight-hack` once more after merging both `04-02` and `04-03`** to ensure the final deployed site includes both plans' code.

## User Setup Required

None -- all secrets this plan depends on (`VERIFY_LINK_SECRET`) were already set by 04-01. No new external service configuration.

## Next Phase Readiness

**Ready:** `04-03` (dashboard) has no dependency on this plan's files (owns `AppPlaceholder.tsx`, `Stage.tsx`, and new `components/`/`lib/` files per the dispatch's file-ownership split) and can proceed independently. This plan's `apps/web/src/App.tsx` diff was minimal (one lazy import + one pathname branch) to reduce merge-conflict surface with `04-03`.

**Blocked/open:** D1/D3's `human_judgment: true` entries (real phone enrollment + live full-screen prompt timing) are captured in "Human Follow-up" above and should be run before the live demo, not left until stage time. The orchestrator's post-merge hosting redeploy (see "Also note for the orchestrator" above) is required for the final demo build to include both `04-02` and `04-03`.

---
*Phase: 04-family-verification-and-dashboard*
*Completed: 2026-09-22*

## Self-Check: PASSED

- `apps/web/src/pages/Verify.tsx`: FOUND
- `apps/web/src/lib/memberSession.ts`: FOUND
- `apps/web/src/lib/webauthn.ts`: FOUND
- `apps/web/src/lib/verifyCountdown.ts` + `.test.ts`: FOUND
- `apps/web/src/App.tsx` (`/verify` route): FOUND (`grep -n "'/verify'" apps/web/src/App.tsx` matches)
- Commits `660b840`, `30272c0`, `ffd47b0`: all FOUND via `git log --oneline --all`
- `pnpm --filter web test -- verifyCountdown`: 7/7 pass
- `pnpm -r typecheck`: exits 0 (functions, packages/shared, apps/web)
- `pnpm --filter web build`: exits 0; `apps/web/dist/assets/Verify-*.js` chunk confirmed present
- `firebase deploy --only hosting --project porchlight-hack`: succeeded; `curl https://porchlight-hack.web.app/verify` -> `200`
- `git status --short` clean before writing this SUMMARY
