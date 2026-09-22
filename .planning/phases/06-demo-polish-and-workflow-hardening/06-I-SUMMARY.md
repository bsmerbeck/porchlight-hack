---
phase: 06-demo-polish-and-workflow-hardening
plan: I
subsystem: web + functions
tags: [demo-polish, stage, reset, verification-timeout, live-test-fixes]
status: complete
requires: [06-H]
provides: [superseded-live filter, reset clears live feed docs, expireVerification callable]
key-files:
  created:
    - apps/web/src/lib/useVerificationBackstop.ts
    - apps/web/src/lib/useVerificationBackstop.test.ts
  modified:
    - apps/web/src/lib/stageState.ts
    - apps/web/src/lib/stageState.test.ts
    - apps/web/src/components/porch/index.ts
    - apps/web/src/pages/Stage.tsx
    - apps/web/src/pages/Sim.tsx
    - apps/web/src/pages/AppPlaceholder.tsx
    - functions/src/demo/resetDemo.ts
    - functions/src/demo/resetDemo.test.ts
    - functions/src/verification/passkeyAuthentication.ts
    - functions/src/verification/passkeyAuthentication.test.ts
    - functions/src/index.ts
decisions:
  - There is one phone line, so a live-state call counts as superseded (abandoned) as soon as any call started after it exists. deriveStageState applies this rule itself. /app and /sim history use isAbandonedLive (stale or superseded) and show those calls as "Ended".
  - resetDemo marks screening/verifying feed docs state 'ended' with outcome 'screened' (if no outcome is set), and sets endedAt to the call's last activity rather than now. Using now would make /stage show a 20s "CALL ENDED" result hold right after a reset.
  - The server-side timeout is 25s from verification.promptedAt; the phone's is 20s. If promptedAt is missing it falls back to risk.updatedAt, then startedAt. No token is required, because the callable can only apply the same verdict the phone's own timeout would, and only when the server's record says it is due.
  - The No/timeout verdict was pulled out into a helper (applyNoOrTimeoutVerdict) that both answerVerification and expireVerification use, so the two paths have identical effects.
  - The client backstop only fires for the call currently shown as live, not for every old verifying doc, so it never rewrites ancient history as scam.
metrics:
  completed: 2026-09-22
  duration: ~6 min
plan_head_before: eccef4f
actuals:
  tasks: 4
  commits: 4
---

# Phase 6 Plan I: Live-test fixes (superseded calls, reset feed, verify timeout) Summary

**What changed:** A newer call now supersedes an older abandoned live call on every surface. resetDemo ends feed docs that were left in screening/verifying. A server-side `expireVerification` callable ends a call stuck on VERIFYING when the phone is locked. The /stage header and body now switch on the same render.

## Fixes

1. **Stale live call outranking a newer result.** `deriveStageState` now drops the newest live call if any call started after it (`isSupersededLive`). The 10-minute stale cutoff is unchanged. `isAbandonedLive` combines the stale and superseded checks, and the /app HistoryRow and /sim feed list use it to show "Ended". Tests cover the exact production case (sYlM screening at 18:14Z, kx24 scam ended at 18:16:49Z): the result is shown, then ready once the hold expires, and the old call never comes back.
2. **Reset not clearing the feed.** resetDemo step (2c) goes through `households/demo/feed`. Every screening/verifying doc (except keepCallIds) becomes `state: 'ended'`, `outcome: outcome ?? 'screened'`, with endedAt set to its last activity. Terminal docs are left alone. The response now includes `feedEnded`.
3. **Verification timeout only ran on the phone.** New `expireVerification({callId})` callable. It does nothing unless the call is still `verifying`, has no answer, and was prompted at least 25s ago. When it does run, it uses the same helper as the phone's 'timeout' answer: record the answer, set state/outcome to scam, set endedAt, and force-end the Twilio call. Once it has run, a later phone answer still gets `failed-precondition`, so the verdict stays final. `useVerificationBackstop` on /stage and /sim fires it once per callId after promptedAt+25s. If promptedAt is missing it counts from when the page first saw the call verifying. On a 'too-early' reply (clock skew) it retries every 5s, up to 4 times.
4. **Header ahead of body.** Stage's `AnimatePresence` changed from `mode="wait"` to `mode="popLayout"`. The incoming screen now mounts on the same render as the header's LIVE CALL dot, while the outgoing screen fades out underneath.

## Deviations from Plan

None. All four items were done within the time box.

## Known limitations

- expireVerification and answerVerification both read the call and then update it, without a transaction. That leaves a very small race if the phone's timeout and the backstop land at the same moment. The two write the same verdict, and the 5s gap (20s vs 25s) makes it unlikely.
- The popLayout change was checked by build only. Nobody has looked at it on the projector yet.

## Verification

- `pnpm typecheck`: green (shared, functions, web)
- functions vitest: 12 files, 95 tests passing
- web vitest: 5 files, 50 tests passing
- `pnpm build`: green

## Deploy

`firebase deploy --only hosting,functions:expireVerification,functions:answerVerification,functions:resetDemo`

## Self-Check: PASSED
