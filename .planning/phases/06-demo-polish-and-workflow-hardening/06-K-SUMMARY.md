---
phase: 06-demo-polish-and-workflow-hardening
plan: K
status: complete
subsystem: operator tooling / call lifecycle
key-files:
  created:
    - functions/src/screening/lineStatus.ts
    - functions/src/screening/lineStatus.test.ts
    - apps/web/src/components/porch/LineStatus.tsx
    - apps/web/src/components/porch/LineStatus.test.ts
  modified:
    - functions/src/index.ts
    - apps/web/src/components/porch/OperatorBar.tsx
    - apps/web/src/components/porch/useOperatorVisible.ts
    - apps/web/src/components/porch/index.ts
    - apps/web/src/pages/Stage.tsx
commits: 2
---

# Phase 6 Plan K: Line status + orphaned-call self-heal Summary

`lineStatus` callable asks Twilio whether the Porchlight number (+14015861988) has an in-progress or ringing inbound call and returns `{busy, since, checkedAt}`. It never throws: on a Twilio error it returns `{busy:null, error:'twilio'}`. When the line is free, it also ends orphaned live call docs.

- **Self-heal:** checks the newest 5 `calls` (orderBy startedAt desc). It ends a doc only if all of these hold: state is screening/verifying, provider is not simulator, there's no endedAt, and last activity (latest turn `at`, else startedAt) was more than 20s ago. The update is `state:'ended', outcome: existing ?? 'screened', endedAt: now`. The existing `mirrorActiveCallToLamp` trigger then updates the feed and sets the lamp to idle.
- **Response:** includes only the healed count. Call ids aren't returned because forceVerdict accepts a bare callId.
- **Web:** `useLineStatus(pollMs=4000)` uses one shared poller per page and polls only while `document.visibilityState === 'visible'`. The pill shows "On call · m:ss" (red), "Line free" (green) or "Line ?". It appears in the OperatorBar status row. It also appears in the /stage header next to "Live call", only while the operator bar is visible. `useOperatorVisible` instances now stay in sync through a window event, so closing the bar also hides the /stage pill.

## Gates
- `pnpm typecheck` passed
- functions vitest: 100/100 (5 new)
- web vitest: 51/51
- `pnpm build` passed

## Deviations
- Used a lucide `Phone` icon instead of the emoji in the pill.
- The response returns the healed count, not call ids (security).
- Added visibility sync to `useOperatorVisible` (Rule 2). Without it, the /stage pill would stay visible after the bar's X was clicked.

## Uncertain
- It hasn't been checked whether the attack call (ElevenLabs outbound via the same Twilio account) appears as a Twilio call TO +14015861988. If it does, the pill shows busy during the attack. If it doesn't, the pill says "Line free" during the attack, and the self-heal could end that live doc once it has been idle for more than 20s.
- Deploy: `firebase deploy --only hosting,functions:lineStatus`
