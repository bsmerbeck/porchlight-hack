---
phase: 06-demo-polish-and-workflow-hardening
plan: D
subsystem: web/stage
tags: [stage, projector, operator-bar, polish]
status: complete
key-files:
  created:
    - apps/web/src/components/porch/useOperatorController.ts
  modified:
    - apps/web/src/pages/Stage.tsx
    - apps/web/src/components/porch/OperatorBar.tsx
    - apps/web/src/components/porch/index.ts
    - apps/web/src/pages/Styleguide.tsx
plan_head_before: b11f75c814bf0c1071dc14e9f1b2f9e5cf1cd1e8
commits: 3
---

# Phase 6 Plan D: /stage projector + OperatorBar wiring Summary

I rebuilt `/stage` on the porch components and `deriveStageState`, so the screen comes from the Firestore feed alone and rebuilds the same view after a refresh. `OperatorBar` is now fully wired and works as a drop-in: `<OperatorBar />` with no props.

## What changed
- **Stage.tsx:** dark theme, h-screen, and a 12-column grid laid out for 1920x1080.
  - **Header strip:** a small lamp tinted by state, "Porchlight · Margaret's line", and dots for feed status (Watching / Connecting / Feed offline) plus Live call.
  - **ready:** `ReadyState`, xl breathing lamp, "Porchlight is watching Margaret's line".
  - **live:** `StateBanner` with a context line, `CallerCard` and `RiskMeter` with tactic chips on the left, and an auto-scrolling `Transcript` on the right. The transcript shows a typing shimmer when Porchlight owes the next reply.
  - **result:** `StateBanner` with outcome copy (who said No, passkey confirmed, trusted list, message text), a lamp and `OutcomeBadge`, the caller card and final risk, and a bar counting down "Back to watching in Ns" over `RESULT_HOLD_MS`.
  - **Mode changes:** crossfade with AnimatePresence. Reduced-motion settings are respected.
  - **Stale-call guard:** a doc still marked live with no activity for 10 minutes is ignored, so a leftover `screening` doc can't lock the stage.
  - **Audio:** WebAudio cues fire once per (call, state) change. The first click or keypress arms them, and they never fire on the first snapshot after a refresh.
  - The feed query is limited to the 25 newest docs.
- **useOperatorController.ts (new):** handlers for:
  - `resetDemo({token})`.
  - The simulated scam: `startSimulatedCall` followed by the `JAIL_SCRIPT` `simulateTurn` loop. The buttons unlock once the call exists, and progress shows in the message line.
  - `attackCall({token})`.
  - The soundboard: plays all `attackClips` lines in order; pressing it again stops playback.
  - Lamp test.
  - It also exports `useBridgeStatus()` (live `status/bridge`), `getDemoToken()` (localStorage `porchlight_demo_token`, asks once; a `permission-denied` response clears the saved token) and `LAMP_TEST_EVENT`.

## Porch-component changes (additive, backward compatible)
- **`OperatorBar`:** the old presentational body is now the internal `OperatorBarView`. The exported `OperatorBar` adds two optional props:
  - `connected` (default true): any handler, `status`, `busy` or `soundboardOn` you leave out is filled in from `useOperatorController`. Props you pass always win.
  - `alwaysVisible` (default false): when false, the bar hides itself through `useOperatorVisible` (`?op=1` or pressing `o` three times) and shows an X that hides it. Your own `onClose` still runs as well.
  - The old pattern `{op && <OperatorBar … onClose={() => setOp(false)} />}` still works.
- **`index.ts`:** additionally exports `useOperatorController`, `useBridgeStatus`, `getDemoToken`, `DEMO_TOKEN_STORAGE_KEY`, `LAMP_TEST_EVENT` and `OperatorController`.
- **`Styleguide.tsx`:** its fake bar now passes `alwaysVisible connected={false}`, so it looks and behaves exactly as before.

For 06-F (/sim), `<OperatorBar />` is enough.

## Verification
- `pnpm --filter @porchlight/web typecheck`: passed
- `pnpm --filter @porchlight/web test`: 37/37 passed
- `pnpm --filter @porchlight/web build`: passed. The main `index` chunk is about 474 kB; I didn't compare that with the size before this plan.

## Known gaps
- **Lamp test is on-screen only.** It cycles `/stage`'s lamp through every state. No client-writable path to `lamp/current` exists (the rules deny it), and I left functions untouched as instructed. The physical sweep is `pnpm venue:up`. Adding a DEMO_TOKEN-gated `lampTest` callable would make the button drive the real Pi and Hue lights.
- **Not checked in a real browser.** The worktree sandbox blocked headless Chrome. 06-H should open `/stage?op=1` on the projector and step through W1–W6.
- The household name "Margaret" is hard-coded because the household doc can't be read publicly.

## Deviations from Plan
- [Rule 2] Added the stale-live guard (10 minutes) so an orphaned `screening` doc can't pin the stage to live mode forever.

## Self-Check: PASSED
