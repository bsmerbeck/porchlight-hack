---
phase: 06-demo-polish-and-workflow-hardening
plan: E
subsystem: web/verify
tags: [react, motion, tailwind, webauthn]
status: complete
requires:
  - phase: 06-A
    provides: "porch components (CallerCard, LampGlow, ReadyState, StatusDot), dark tokens"
  - phase: 04-FIX
    provides: "answered-call guard, verdict finality, verification.name"
key-files:
  created:
    - apps/web/src/pages/verify/VerifyScreens.tsx
    - apps/web/src/pages/verify/memberName.ts
    - apps/web/src/pages/verify/memberName.test.ts
  modified:
    - apps/web/src/pages/Verify.tsx
actuals:
  tasks: 1
  commits: 1
plan_head_before: b11f75c814bf0c1071dc14e9f1b2f9e5cf1cd1e8
---

# Phase 6 Plan E: /verify family phone polish (Summary)

/verify now looks like a dark native phone app at 390px, with four screens: Enroll, Armed idle, full-screen Prompt and Result card. The protocol code is unchanged.

## What changed
- **Screens** (`pages/verify/VerifyScreens.tsx`, presentational only):
  - **Enroll:** lamp, "Pair this phone with Margaret's line", 76px "Pair as Brenden" button.
  - **Armed (D-08 before):** `ReadyState` "Watching for calls to Margaret", an Armed/Connecting status dot (set by the first Firestore snapshot), and an info card showing Signed in as {member}, Confirm with Passkey/Secure link, and Sound & vibration On/Off. A 76px "Turn on alerts" button unlocks audio.
  - **Prompt (D-08 during):** full-screen `alertdialog` with an amber verifying wash, a "Verification request" pulsing dot, a countdown ring, `CallerCard` with the claimed name (and `claimedText` if the prompt doc ever carries it), the 34px "Is this you calling?" question, and 76px "Yes, it's me" and "No, block this call" buttons with per-button spinners.
  - **Result (D-08 after):** green Verified or red Call blocked. The copy differs for no, timeout and a failed yes. There is a passkey/link method chip. It holds for **6s** (was 5s), then returns to Armed.
- **Countdown:** still `computeSecondsLeft(promptedAt, now)`, so a refresh mid-prompt shows the time actually left.
- **Kept exactly:** passkey ceremony, then the VER-05 link-token fallback; `answerVerification` / `startPasskeyAuthentication` / registration calls; the `porchlight_answered_calls` guard, checked both at render and in `handleAnswer`; alert tone and vibration. Yes and No still call `handleAnswer` directly from the click, so WebAuthn keeps its user-gesture context.

## Deviations
- `PromptDoc.claimedText` was added as an optional client-side type field. `lamp.ts` doesn't write it yet, and functions/ was out of scope. The name shown comes from `claimedIdentity`, which is already `verification.name`-first per 04-FIX.
- No porch component APIs were changed. No other pages were touched.
- The headless visual check was skipped because the sandbox blocks running Chrome directly. Check it on a real phone before the demo.

## Verification
- `pnpm --filter @porchlight/web typecheck`: pass
- `pnpm --filter @porchlight/web test`: 4 files, 40 tests pass (3 are new `memberDisplayName` tests)
- `pnpm --filter @porchlight/web build`: pass (only the pre-existing chunk-size warning)

## Self-Check: PASSED
