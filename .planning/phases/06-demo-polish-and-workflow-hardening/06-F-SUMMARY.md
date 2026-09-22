---
phase: 06-demo-polish-and-workflow-hardening
plan: F
subsystem: web
tags: [ui, dashboard, operator-console]
status: complete
key-files:
  created: [apps/web/src/lib/useDemoFeed.ts]
  modified: [apps/web/src/pages/AppPlaceholder.tsx, apps/web/src/pages/Sim.tsx, apps/web/src/App.tsx]
commits: 2
---

# Phase 6 Plan F: /app family dashboard + /sim operator console Summary

Both pages now use the porch design system. /app is a light consumer dashboard and /sim is a dark operator console with a live preview that /stage mirrors. Both derive "what's live" from `deriveStageState` over the public `households/demo/feed`.

## What changed
- **/app** (`AppPlaceholder.tsx`, light): a sticky brand header and a protection hero (LampGlow tinted by the current state, "Porchlight is watching Margaret's line", counts of calls screened and scams blocked). A live or just-finished call card (StateBanner, CallerCard, RiskMeter, Transcript, message) appears only while deriveStageState is `live` or `result`. Recent calls use OutcomeBadge, caller name or number, relative time, a risk score in the risk color and tactic chips; each row expands to show the transcript, message and report. There is a W7 alerts panel ("Margaret asked you to call her"), plus shimmer skeletons and empty states. /app is now a lazy route in App.tsx.
- **/sim** (`Sim.tsx`, dark): a two-column console. The controls column has Simulated scam, Attack call, Attacker soundboard (a hide/show toggle, per-line status and Play all), Reset everything (new: calls `resetDemo` with the same DEMO_TOKEN), and a W1–W7 cheat sheet that includes the allowlisted number. The preview column has StateBanner, CallerCard, RiskMeter, Transcript and a compact feed list. The header shows a Ready/Live/Result pill and links to /stage, /verify and /app. `OperatorBar` is always mounted, starts collapsed, and is wired to reset, sim, attack and soundboard plus the `status/bridge` heartbeat. `handleRun`, `handleLaunchAttack`, `getOrFetchClipAudio`, `playAudioElement`, `handlePlayLine` and `handlePlayAllClips` are kept word for word.
- **`lib/useDemoFeed.ts`**: hooks that load Firebase lazily. `useDemoFeed`, `useDemoAlerts` (degrades to hidden on permission error), `useBridgeStatus` and `useNow`.

## Deviations
- **[Rule 1 - Bug]** The old /sim live card listened to `calls/{id}`, which the closed rules deny to clients, so it could never render. It now reads the same doc through the `households/demo/feed/{id}` mirror.
- **App.tsx** gets a small lazy-route change so /app (Firebase and motion) stays out of the landing chunk.
- No porch component, Stage/Verify/Landing, functions or rules files were touched.

## Known gap (needs orchestrator/rules owner)
- **W7 alerts on /app will not show against production rules.** `households/demo/alerts` falls under the catch-all `allow read: if false`. The UI is ready; it only needs this rule:
  `match /households/{h}/alerts/{a} { allow get, list: if true; allow write: if false; }`
  Until that is added, the alerts panel stays hidden and a console.warn is logged.
- The feed never loaded in headless Chrome, so I couldn't screenshot the populated states (live card or history rows). Only the empty and loading states were checked visually.

## Verification
typecheck passed; test passed (37/37); build passed.

## Self-Check: PASSED
