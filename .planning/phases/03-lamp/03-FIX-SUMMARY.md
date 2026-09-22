---
phase: 03-lamp
plan: FIX
subsystem: infra
tags: [raspberry-pi, ambient-device, firebase-web-sdk, node-esm, watchdog, joystick]

# Dependency graph
requires:
  - phase: 03-lamp (Plan 01/02)
    provides: "pi/lamp.py HTTP contract (POST /state, GET /health, GET /joystick), bridge/index.mjs Mac-side relay, both live at 169.254.10.2:8080"
provides:
  - "bridge/index.mjs: 20s heartbeat re-POST of last known lamp/current state so the Pi's 60s watchdog only fires when the bridge process itself is gone"
  - "bridge/index.mjs: joystick alert path hardened -- raiseFamilyAlert fires only on pressed===true (never demoState), plus a 5s client-side debounce"
  - "pi/lamp.py: GET /joystick returns {pressed, demoState} -- pressed stays a one-shot flag set only by the CENTER button; demoState is informational only"
  - "households/demo/alerts flushed (8 stale docs from the pre-fix flood deleted, live-confirmed empty)"
affects: ["phase-4-dashboard (renders households/{id}/alerts; the flood is cleared so live-demo alerts read clean)", "phase-5-attack-simulator (joystick demo-mode cycling is unaffected -- direction presses still never trigger alerts)"]

actuals:
  tokens: 3000
  tasks: 5
  commits: 2
plan_head_before: 95d1e6265dbfd002c17b5b8f0e60e50f43cad9e5

tech-stack:
  added: []
  patterns:
    - "Bridge heartbeat: re-POST the last onSnapshot payload on a fixed interval (20s), independent of whether Firestore actually changed, whenever a downstream watchdog/timeout exists on the receiving side (Pi's 60s no-POST revert)."
    - "One-shot press flags stay one-shot at the source (Pi clears on read) AND get a second, independent debounce at the consumer (bridge, 5s) -- defense in depth against any double-read race, not a substitute for the source-side contract."

key-files:
  created: []
  modified:
    - bridge/index.mjs
    - bridge/README.md
    - pi/lamp.py
    - pi/README.md

key-decisions:
  - "Heartbeat re-sends are silent in the log (only failures log) -- matches the existing 'quiet by default' logging style and avoids spamming the terminal every 20s for the whole demo."
  - "Renamed the additive GET /joystick field from `state` to `demoState` (rather than keeping `state`) to make explicit in the wire contract that it is informational-only and never an alert trigger, independent from `pressed`."
  - "Alert-flood cleanup used a one-off Admin SDK + ADC script (the documented bridge/README.md fallback pattern from 03-02-SUMMARY.md), not a new committed script file -- consistent with how that runbook already documents this exact pattern inline rather than as a repo script."

requirements-completed: []

coverage:
  - id: D1
    description: "Bridge re-POSTs the last known lamp/current state every 20s so the Pi's 60s watchdog never reverts a live call to idle just because the state hasn't changed recently"
    verification:
      - kind: integration
        ref: "live: set lamp/current to screening via Admin SDK, started a second bridge instance (bridge/write-config.mjs + node bridge/index.mjs), polled Pi GET /health every 10s for 90s -- stayed {state:\"screening\"} at t=+60s, +70s, +80s (30s past the 60s watchdog window) with zero errors in the bridge log"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /joystick's pressed flag is a one-shot, CENTER-button-only trigger; demoState is informational and never influences the alert decision"
    verification:
      - kind: unit
        ref: "pi/test_lamp.py -- 9/9 tests pass locally and over SSH on the deployed Pi, including CenterButtonUntouchedTests"
        status: pass
      - kind: integration
        ref: "live: curl http://169.254.10.2:8080/joystick twice in a row post-deploy -> {\"pressed\": false, \"demoState\": \"idle\"} both times"
        status: pass
    human_judgment: false
  - id: D3
    description: "A physical CENTER-button press still raises exactly one family alert, respecting the new 5s client-side debounce"
    verification: []
    human_judgment: true
    rationale: "No physical Sense HAT joystick press was performed in this session (remote execution, no hands on the hardware). The one-shot pressed flag and the 5s debounce are both code- and unit-test-verified, but the end-to-end feel of a real press has not been physically confirmed since this fix. Recommend a human press the center button once during rehearsal."
  - id: D4
    description: "households/demo/alerts flood from the pre-fix continuous-firing bug is cleared"
    verification:
      - kind: integration
        ref: "live: Admin SDK query of households/demo/alerts before cleanup returned 8 docs; batch-deleted all 8; re-query immediately after returned 0"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-09-22
status: complete
---

# Phase 3 Fix: Lamp Bridge Heartbeat + Joystick Alert Hardening Summary

**Bridge now re-POSTs lamp/current every 20s so the Pi's 60s watchdog can't mistake "no change" for "bridge died," the joystick alert path only fires on a real one-shot CENTER-button flag (with a 5s client debounce), and the 8-doc alert flood from the pre-fix bug is cleared.**

## Performance

- **Duration:** ~10 min (plus live verification against the physical Pi)
- **Started:** 2026-09-22T14:48:00Z
- **Completed:** 2026-09-22T14:58:42Z
- **Tasks:** 5 (read context, heartbeat, joystick contract, alert cleanup, redeploy+verify)
- **Files modified:** 4

## Accomplishments
- `bridge/index.mjs` re-POSTs the last known `lamp/current` state to the Pi every 20s (and immediately on every real Firestore delivery, including a post-reconnect redelivery), so the Pi's 60s watchdog only fires when the bridge process itself is gone — live-proven by holding `screening` for 90s straight.
- `pi/lamp.py`'s `GET /joystick` now returns `{"pressed": bool, "demoState": "<state>"}`: `pressed` is a one-shot flag set only by the CENTER button and cleared on read (direction presses never touch it — unchanged, just clarified and renamed for the wire contract); `demoState` is informational-only, logged by the bridge on change but never written to Firestore and never used to decide whether to raise an alert.
- `bridge/index.mjs`'s joystick poll loop adds a 5s client-side debounce around `raiseFamilyAlert` as defense in depth, on top of the Pi's own one-shot flag.
- Flushed the 8 stale `households/demo/alerts` docs left over from the pre-fix continuous-firing bug via a one-off Admin SDK + ADC script (the documented `bridge/README.md` fallback pattern) — confirmed 0 remaining.
- Redeployed `pi/lamp.py` via `pi/deploy.sh`; `/health` and `/joystick` verified live; `pi/test_lamp.py` (9 tests) green both locally and over SSH on the deployed Pi.

## Task Commits

Each task was committed atomically:

1. **Pi joystick contract (pressed/demoState rename + docs)** - `969b98f` (fix)
2. **Bridge heartbeat + joystick debounce (+ docs)** - `60ee055` (fix)

Alert-flood cleanup (Task 4) was a live Firestore data operation via a one-off Admin SDK script, not a repo file change — no commit produced (nothing to stage).

## Files Created/Modified
- `pi/lamp.py` - `GET /joystick` response renamed `state` -> `demoState`; comments clarify the one-shot/CENTER-only contract
- `pi/README.md` - documents the new `/joystick` response shape and the watchdog-vs-heartbeat relationship
- `bridge/index.mjs` - added `postState()` heartbeat helper + 20s `setInterval`, `lastKnownState` tracking, joystick poll loop hardened with `ALERT_DEBOUNCE_MS` and `demoState` change-logging
- `bridge/README.md` - documents the heartbeat mechanism and the joystick contract

## Decisions Made
See `key-decisions` in frontmatter above — summarized: heartbeat re-sends stay silent in the log (only failures log, matching existing style); the additive `GET /joystick` field was renamed `state` -> `demoState` to make the wire contract self-documenting; alert-flood cleanup used a one-off Admin SDK script rather than a new committed script file, consistent with the existing `bridge/README.md` runbook pattern.

## Deviations from Plan

None — plan executed as specified. One process incident during verification is documented below under Issues Encountered (not a deviation from the plan's code changes, but a real operational mistake worth flagging).

## Issues Encountered

**I accidentally killed the user's already-running bridge tab process.** During the live watchdog test I started my own `node bridge/index.mjs` instance (per the plan's isolation instructions) to avoid touching the user's terminal tab. When stopping mine afterward I ran `pkill -f "^node bridge/index.mjs$"`. `ps aux` shows **both** processes with the byte-identical command string `node bridge/index.mjs` (ps does not surface each process's cwd or which `.env.local` it loaded), so the pattern matched and killed **both** — my test instance AND the user's original tab process (PID 33534, which had been running since 12:17AM). I confirmed this via `ps -p 33534` returning no such process immediately after.

This converges on the same required action the plan already anticipated (the user's tab needs restarting to pick up the new heartbeat/debounce code), but the *mechanism* is different from what was expected: the user's tab didn't just go stale with old code, it actually exited. **The user's terminal tab running `pnpm lamp:bridge` needs to be restarted** — the process is no longer running at all, not just running outdated code.

## User Setup Required

**Restart the lamp bridge.** In the terminal tab that was running `pnpm lamp:bridge`, that process has stopped (see Issues Encountered above — it was inadvertently killed during this fix's verification, not left running old code). Run `pnpm run lamp:bridge` again from the repo root to pick up:
- The 20s heartbeat (keeps the lamp in sync with `lamp/current` past the Pi's 60s watchdog window)
- The hardened joystick alert path (5s debounce, `demoState` field renamed)

No other manual configuration required — `bridge/.env.local` / `apps/web/.env.local` config is unchanged in shape.

## Next Phase Readiness
- The Pi is deployed, healthy, and confirmed at `idle` with `lamp/current` restored to `idle` in Firestore (matching state).
- `households/demo/alerts` is clean (0 docs) — the next physical joystick press or `raiseFamilyAlert` call will write into an empty, easy-to-inspect collection.
- **Recommend a human physically press the Sense HAT center button once during rehearsal** (D3 above) to confirm the family-alert flow still feels right end-to-end after this fix — not physically pressed during this remote execution.
- No blockers for Phase 4/5 work; this was a targeted fix to Phase 3's bridge/Pi contract only.

---
*Phase: 03-lamp*
*Completed: 2026-09-22*

## Self-Check: PASSED

- FOUND: bridge/index.mjs
- FOUND: pi/lamp.py
- FOUND: pi/README.md
- FOUND: bridge/README.md
- FOUND: commit 969b98f
- FOUND: commit 60ee055
