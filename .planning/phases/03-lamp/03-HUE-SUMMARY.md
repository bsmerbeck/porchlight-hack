---
phase: 03-lamp
plan: HUE
subsystem: infra
tags: [philips-hue, ambient-device, node-esm, link-local-lan, hackathon-extra]

# Dependency graph
requires:
  - phase: 03-lamp (Plan 01/02/FIX)
    provides: "bridge/index.mjs Mac-side relay (lamp/current watcher, 20s heartbeat, joystick poll), live and reachable at 169.254.10.2:8080 for the Pi side"
provides:
  - "bridge/hue.mjs: loadHue()/setHueState() -- mirrors lamp/current onto every reachable Philips Hue bulb via Hue Bridge v2 REST group 0 (all lights), optional by contract (no bridge/hue-local.json or HUE_DISABLED=1 -> no-op)"
  - "bridge/index.mjs wired to call setHueState() alongside every Pi postState() call (real change + 20s heartbeat)"
  - "bridge/README.md 'Hue' section: hue-local.json shape, re-pairing curl command, bulb-add flow, state->color/effect table"
affects: ["phase-3-lamp demo (an optional second, more visible ambient signal alongside the Pi's Sense HAT lamp -- same lamp/current source of truth, no new Firestore writes)"]

actuals:
  tokens: 3415
  tasks: 5
  commits: 3
plan_head_before: 5ee26b24d05eef28eeada2eccfd6a5857e9c6328

tech-stack:
  added: []
  patterns:
    - "Optional-integration contract: a config file's absence (or an explicit *_DISABLED=1 env var) makes every exported function of the module a safe no-op, so the caller (index.mjs) never needs an `if (hueEnabled)` guard at each call site -- mirrors the existing loadFirebaseConfig()/postState() resilience style in this same file."
    - "Group-0 (all lights) PUT instead of per-light PUTs -- one Hue Bridge request updates every reachable bulb, and newly-powered-on bulbs join automatically with zero bridge restart or code change."
    - "State-driven effect-loop lifecycle: an internal `currentState` + `stopEffects()` pair ensures at most one setInterval (breathe or scam-alert) is ever running, torn down and restarted cleanly on every real state transition, and left alone (not re-created) on a heartbeat tick for an already-active effect state."

key-files:
  created:
    - bridge/hue.mjs
  modified:
    - bridge/index.mjs
    - bridge/README.md
    - .gitignore

key-decisions:
  - "Chose the manual bri-alternation breathe (200<->90 every 1.5s) over Hue's built-in `alert:\"lselect\"` for screening/verifying -- lselect reads as a sharp on/off blink, too alarming for 'we're screening this call.' Reserved `lselect` for `scam`, where an urgent flash is the correct feel."
  - "hue.mjs re-sends the full color PUT on every call (change AND heartbeat) for solid states (idle/verified/ended) since no interval is running to keep them in sync, but skips the redundant PUT for breathe/scam states once their own interval is active -- avoids double-driving the Hue Bridge with two independent timers for the same effect."
  - "Copied `bridge/hue-local.json` from the main checkout into this worktree via `cp` (never printed/catted) since it's a gitignored credential file identical in purpose to `bridge/.env.local`; added `bridge/hue-local.json` to `.gitignore` since it wasn't previously covered by the `.env.*` pattern (it's `.json`, not `.env`)."
  - "Skipped adding a new automated test file for bridge/hue.mjs -- bridge/ has no existing test infrastructure (unlike pi/lamp.py's test_lamp.py), and hand-rolling one for a single hackathon-extra module was judged not 'cheap' relative to the thorough manual mock-server verification already performed (see Verification below). Consistent with the existing bridge/ convention of runbook-documented manual verification over unit tests."

requirements-completed: []

coverage:
  - id: H1
    description: "setHueState() sends the correct Hue v1 REST payload (hue/sat/bri/alert/transitiontime) for every lamp/current state, via group 0 so all reachable bulbs update in one request"
    verification:
      - kind: integration
        ref: "local mock Hue Bridge (node:http, 127.0.0.1:8123) -- cycled idle -> screening -> verifying -> verified -> scam -> ended -> ended(heartbeat repeat); captured every PUT /groups/0/action body and confirmed: idle/ended {hue:8000,sat:200,bri:120,alert:none}, screening/verifying base {hue:46000,sat:254,bri:200,alert:none} plus alternating {bri:90}/{bri:200} breathe ticks every 1.5s, verified {hue:25500,sat:254,bri:254,alert:none}, scam {hue:0,sat:254,bri:254,alert:lselect}; heartbeat re-call on unchanged `ended` re-sent the same solid-color PUT as expected"
        status: pass
    human_judgment: false
  - id: H2
    description: "Hue is optional: no bridge/hue-local.json, or HUE_DISABLED=1, makes the integration a safe no-op with a clear startup log line"
    verification:
      - kind: unit
        ref: "code review of loadHue() -- three early-return paths (HUE_DISABLED=1, missing file, missing ip/username keys) all log and return null; setHueState() and all internal helpers check hueConfig !== null before any network call"
        status: pass
    human_judgment: false
  - id: H3
    description: "The real Hue Bridge (169.254.12.12) responds to the documented v1 REST contract (GET /lights, PUT /groups/0/action) exactly as bridge/hue.mjs assumes"
    verification:
      - kind: integration
        ref: "live, early in this session, before the Ethernet link dropped (see Issues Encountered): `GET /api/<user>/lights` returned all 7 paired bulbs with light 4 (\"BR2\") reachable:true; this confirmed the response shape hue.mjs's countReachable() parses (state.reachable per light) matches the real bridge"
        status: pass
    human_judgment: false
  - id: H4
    description: "End-to-end live verification: cycling lamp/current through screening/verified/scam/idle actually changes light 4's rendered hue/sat/bri on the physical Hue Bridge, while the Pi's /health also keeps following the same states"
    verification: []
    human_judgment: true
    rationale: "BLOCKED by a physical-layer outage discovered mid-task: the Mac's link-local Ethernet interface (en8, the same cable carrying both the Pi and Hue Bridge traffic per CLAUDE.md's network constraint) went to `status: inactive` partway through this session -- confirmed by `ifconfig en8`, by `arp -a` showing incomplete entries for both 169.254.10.2 (Pi) and 169.254.12.12 (Hue Bridge), and by a live-bridge test run failing BOTH `POST /state` (Pi) and Hue's `PUT /groups/0/action` with identical fetch-timeout errors. This is not a Hue-specific or code-specific failure -- the same physical link outage would also break the already-working Pi lamp path. Polled `ifconfig en8` for status changes across ~4 checks over roughly 2 minutes; link stayed down throughout. This is a hardware/cabling issue outside this task's control (no computer-use/physical access to the demo rig). Recommend a human check the Ethernet cable/switch connecting the Mac, Pi, and Hue Bridge, then re-run the verification runbook in bridge/README.md's 'Hue' section (or the existing lamp/current cycling runbook) once the link is confirmed `status: active`."

duration: 45min
completed: 2026-09-22
status: complete
---

# Phase 3 Extra: Hue Bulb Mirroring Summary

**The Mac bridge now optionally drives every reachable Philips Hue bulb (via Hue Bridge v2 group 0) to mirror `lamp/current` alongside the Pi's Sense HAT lamp -- idle amber, screening/verifying blue breathe, verified green solid, scam red flashing -- fully additive and no-op-safe if Hue isn't configured.**

## Performance

- **Duration:** ~45 min (including live connectivity troubleshooting)
- **Started:** 2026-09-22T15:10:00Z (approx, first tool call)
- **Completed:** 2026-09-22T15:55:00Z (approx)
- **Tasks:** 5 (read context, hue.mjs driver, wire into index.mjs, live verify, docs)
- **Files modified:** 4 (1 created: `bridge/hue.mjs`)

## Accomplishments

- `bridge/hue.mjs`: `loadHue()` reads the paired app key from `bridge/hue-local.json` (gitignored), disabled cleanly via missing file or `HUE_DISABLED=1`. `setHueState(state, name)` maps every `lamp/current` state to a Hue v1 REST color/effect and PUTs it to `groups/0/action` (all reachable bulbs, one request, no per-light ID list to maintain):
  - `idle`/`ended` -> warm amber, solid
  - `screening`/`verifying` -> blue, manual breathe (bri alternates 200/90 every 1.5s -- chosen over Hue's built-in `alert:"lselect"` blink because it reads calmer)
  - `verified` -> green, solid
  - `scam` -> red, `alert:"lselect"` flash re-asserted every 15s
- Every Hue Bridge request is wrapped in try/catch with a 2s timeout; a failure (bridge unreachable, bulb dropped off the mesh) logs and the bridge process keeps running -- same resilience contract as the existing `postState()` helper for the Pi.
- `bridge/index.mjs` calls `setHueState()` alongside every `postState()` call: on real `lamp/current` Firestore changes and on the existing 20s heartbeat tick, so Hue re-syncs on the same cadence as the Pi (no separate watchdog needed).
- `bridge/README.md` gained a full "Hue" section: config shape, re-pairing via the physical link button + `POST /api`, how newly-powered bulbs join automatically (group 0), and the complete state -> color/effect table.
- Confirmed early in the session, live against the real Hue Bridge (169.254.12.12): `GET /api/<user>/lights` returned all 7 paired bulbs, light 4 ("BR2") `reachable: true` -- proving the wire contract `hue.mjs` assumes matches the real hardware.
- Thoroughly verified the full state-machine logic (color values, breathe alternation, scam alert, heartbeat re-assertion of solid states) against a local mock Hue Bridge server, capturing and asserting on every PUT body sent for all 6 states in sequence (see `coverage.H1`).

## Task Commits

Each task was committed atomically:

1. **Add `bridge/hue.mjs` Hue driver** - `08b5310` (feat)
2. **Wire Hue into `bridge/index.mjs`** - `5204087` (feat)
3. **Document Hue in `bridge/README.md`** - `f83301d` (docs)

## Files Created/Modified

- `bridge/hue.mjs` (new) - optional Hue Bridge v2 REST driver, state -> color/effect mapping, no-op-safe
- `bridge/index.mjs` - imports and calls `loadHue()`/`setHueState()` alongside the existing Pi relay path
- `bridge/README.md` - new "Hue" section
- `.gitignore` - added `bridge/hue-local.json` (credential file, wasn't previously covered by `.env.*`)

## Decisions Made

See `key-decisions` in frontmatter above.

## Deviations from Plan

### Auto-fixed Issues

None -- no bugs or missing-functionality gaps found in existing code during this task; `bridge/hue.mjs` is new, additive code.

### Scope additions (Rule 2/3 -- correctness/testability, not architectural)

**1. Added `bridge/hue-local.json` to `.gitignore`.** The facts noted this file is "gitignored" but it wasn't actually covered by the existing `.env.*` pattern (it's `.json`, not `.env`). Added an explicit entry so the credential file can never be accidentally committed. Commit: `08b5310`.

## Issues Encountered

**The Mac's link-local Ethernet interface (en8) went down mid-session, blocking full live hardware verification.** Early in this session, a direct `fetch` to the real Hue Bridge (`GET /lights`) succeeded and returned all 7 paired bulbs with light 4 reachable -- confirming physical connectivity and the wire contract were both fine at that point. Partway through wiring and testing, `ifconfig en8` began reporting `status: inactive`, and `arp -a` showed incomplete entries for both `169.254.10.2` (Pi) and `169.254.12.12` (Hue Bridge). A live test-bridge run confirmed this wasn't Hue-specific: `POST /state` to the Pi also failed with the same fetch-timeout pattern. I polled `ifconfig en8` roughly every 10-20s across ~4 checks (about 2 minutes total) without the link recovering, then stopped polling to avoid burning the session on a hardware condition I cannot fix (no physical/computer-use access to the demo rig's cabling).

To still deliver strong verification despite this, I stood up a local mock Hue Bridge (`node:http` on `127.0.0.1:8123`), pointed a temporary copy of `bridge/hue-local.json` at it, and drove `bridge/hue.mjs`'s exported functions through all 6 `lamp/current` states end-to-end, capturing and confirming every `PUT /groups/0/action` body matched the spec exactly (color values, breathe alternation timing, scam alert, heartbeat re-assertion of solid states). I then restored the real `bridge/hue-local.json` unchanged. This is solid evidence the code is correct; it is not a substitute for confirming the physical bulb actually changes color, which requires the link to be back up.

**No processes were killed that shouldn't have been.** Per the parallel-execution safety note (referencing a prior incident where `pkill -f "node bridge/index.mjs"` killed both the test instance and the user's real tab), I started my test instance directly via `node ... &` and stopped it with `kill $PID` using the captured PID from `$!` -- never a pattern-matching kill. Confirmed via `ps aux` at the end of this session that the user's original `pnpm lamp:bridge` process (PID 89499, running since 11:00AM) is still alive and untouched.

## User Setup Required

**1. Restart the lamp bridge tab to pick up Hue.** The user's terminal tab running `pnpm lamp:bridge` (PID 89499, confirmed still running, untouched by this session) is running the pre-Hue code. It needs to be stopped (`Ctrl+C` in that tab -- do not `pkill` by command string, see Issues Encountered above) and restarted with `pnpm run lamp:bridge` from the repo root to load `bridge/hue.mjs` and start driving the Hue bulbs.

**2. Check the physical Ethernet link before the demo.** `en8` (the cable connecting the Mac, Pi, and Hue Bridge per CLAUDE.md's network constraint) was down (`status: inactive`) at the end of this session, after having been up at the start. Verify the cable/switch connections, confirm `ifconfig en8` reports `status: active` and an interface has a `169.254.x.x` address, then re-run the live verification runbook: cycle `lamp/current` through `screening` -> `verified` (name Brenden) -> `scam` -> `idle` via the Admin SDK script documented in `bridge/README.md`, and confirm via `GET /api/<user>/lights/4` (from `bridge/hue-local.json`) that light 4's `hue`/`sat`/`bri` change accordingly, and that the Pi's `GET /health` keeps following in parallel.

**3. `lamp/current` was left at `verified` (Brenden) from a prior session** -- not touched during this task (no writes were possible with the link down). Once the link and bridge are confirmed working, cycle it back to `idle` for a clean demo starting state.

## Next Phase Readiness

- Code is complete, committed, syntax-checked (`node --check`), and functionally verified against a local mock Hue Bridge covering every state transition.
- Blocked only on the physical Ethernet link being restored to confirm the real bulb responds -- this is a hardware/cabling check, not a code task.
- No blockers for other phases; this is an additive, isolated change to `bridge/*` only (per this task's ownership scope) with zero changes to `functions/` or `apps/web`.

---
*Phase: 03-lamp*
*Completed: 2026-09-22*

## Self-Check: PASSED

- FOUND: bridge/hue.mjs
- FOUND: bridge/index.mjs (modified)
- FOUND: bridge/README.md (modified)
- FOUND: .gitignore (modified)
- FOUND: commit 08b5310
- FOUND: commit 5204087
- FOUND: commit f83301d
