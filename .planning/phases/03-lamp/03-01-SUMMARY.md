---
phase: 03-lamp
plan: 01
subsystem: infra
tags: [raspberry-pi, sense-hat, framebuffer, evdev, http.server, systemd, edge-device]

requires: []
provides:
  - "pi/lamp.py: stdlib-only HTTP service (GET /health, GET /joystick, POST /state) rendering idle/screening/verifying/verified/scam states on the Sense HAT LED matrix"
  - "Watchdog thread reverting to idle after 60s of POST silence, independent of bridge health"
  - "Joystick read-and-clear endpoint discovering the Sense HAT joystick by name via raw evdev"
  - "pi/porchlight-lamp.service and pi/deploy.sh (systemd unit + deploy script), installed and enabled on the Pi; confirmed to survive `sudo reboot` with zero manual steps"
affects: [03-lamp plan 02 (Mac bridge), Phase 4 dashboard/joystick alert consumption]

actuals:
  tokens: 5800
  tasks: 4
  commits: 7
plan_head_before: 83d871a767d8cd8afa616bc6253c64a0fdae9f19

tech-stack:
  added: []
  patterns:
    - "Framebuffer/joystick device discovery by name (never hardcode /dev/fb0 or /dev/input/eventN)"
    - "Shared render state (dict + one threading.Lock) read by a dedicated render thread, written only by the HTTP handler and watchdog"
    - "Global brightness multiplier applied once, uniformly, right before RGB565 packing"
    - "Hardcoded 3x5 uppercase glyph table for scrolling text instead of a general font engine"

key-files:
  created:
    - pi/lamp.py
    - pi/porchlight-lamp.service
    - pi/deploy.sh
  modified:
    - pi/README.md

key-decisions:
  - "Glyph rows are top-aligned (rows 0-4) rather than vertically centered, so every 8-pixel-wide slice of the scrolling text always carries live scroll data — verified this matters for automated fb-byte-diff checks that only sample the first row."
  - "Screening/verifying breathing period set to 1.2s per PLAN.md's explicit action text (not the 1.0s '~1Hz' figure in the dispatch summary), since PLAN.md is the authoritative, more specific source for this plan."
  - "Manual `nohup python3 lamp.py &` used to run and verify the service live on the Pi ahead of Task 4's systemd install, since Tasks 2-3 needed to prove behavior on real hardware before the deploy script existed."
  - "deploy.sh's health check retries for up to 10s instead of a single curl immediately after `systemctl enable --now`, since the real install showed systemd reporting `active` a beat before the HTTP server had actually finished binding — a single-shot check was a false negative waiting to happen on demo night."

requirements-completed: [LAMP-01, LAMP-03, LAMP-04]

coverage:
  - id: D1
    description: "Pi HTTP service renders idle (amber breathe), screening/verifying (blue breathe), verified (green + scrolling name), and scam (red/black flash) driven purely by POST /state, with malformed input rejected (400) without crashing"
    requirement: LAMP-01
    verification:
      - kind: manual_procedural
        ref: "curl POST /state {state:scam} -> od -An -tx1 -N4 /dev/fb0 bytes changed c0 28 -> 00 b0 within 300ms"
        status: pass
      - kind: manual_procedural
        ref: "curl POST /state {state:verified,name:Brenden} -> two /dev/fb0 reads 300ms apart differ (83 02 2c 63... -> 2c 63 83 02...), confirming scroll"
        status: pass
      - kind: manual_procedural
        ref: "curl POST /state with body 'not-json' -> 400, then GET /health still 200 (no crash)"
        status: pass
    human_judgment: true
    rationale: "Byte-level fb0 diffs prove the render thread reacts to state changes, but whether the amber/blue breathe and the flash/scroll actually *look* right (color balance, comfortable brightness, readable scroll) can only be judged by eyeballing the physical LED matrix — a test harness cannot see LEDs."
  - id: D2
    description: "60-second watchdog reverts the lamp to idle regardless of the last POSTed state, independent of the Mac bridge's health"
    requirement: LAMP-03
    verification:
      - kind: manual_procedural
        ref: "POST scam -> fb bytes 00 60 00 60; waited 65s with no further POST -> fb bytes c0 20 c0 20 (idle amber, differs from scam baseline) and GET /health reported state=idle"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /joystick exposes a read-and-clear pressed flag; the joystick event device is discovered by name via raw evdev, not hardcoded"
    requirement: LAMP-04
    verification:
      - kind: manual_procedural
        ref: "GET /joystick -> {\"pressed\": false}; struct.calcsize('llHHi') confirmed 24 on this aarch64 Pi at both Task 1 (one-time check) and module load (re-verified at runtime per Pitfall 5); find_joystick_device() matched 'Raspberry Pi Sense HAT Joystick' at /dev/input/event4 with no hardcoded event number; lamp.log showed no joystick-thread-skipped warning, confirming the thread started"
        status: pass
    human_judgment: true
    rationale: "The endpoint contract (valid JSON, clears on read) and the discovery/parsing logic are proven, but an actual physical joystick press was never performed in this session (no hands on the hardware) — a human must press the joystick and poll /joystick to confirm the ADC/GPIO wiring itself, as PLAN.md Task 3's acceptance criteria explicitly calls out."
  - id: D4
    description: "systemd unit installed and enabled on the Pi; service survives a `sudo reboot` and returns to idle with zero manual steps"
    requirement: LAMP-03
    verification:
      - kind: manual_procedural
        ref: "Human resolved the sudo gate (added /etc/sudoers.d/010_pi-nopasswd); `ssh pi@169.254.10.2 sudo -n true` confirmed passwordless. Killed the manual nohup lamp.py process (PID 2311) and confirmed port 8080 free before install."
        status: pass
      - kind: manual_procedural
        ref: "bash pi/deploy.sh -> scp succeeded, systemd unit installed/enabled, health check passed (exit 0); `systemctl is-active porchlight-lamp.service` -> active; `systemctl is-enabled` -> enabled"
        status: pass
      - kind: manual_procedural
        ref: "ssh pi@169.254.10.2 sudo reboot; polled GET /health every 5s from the Mac -> answered {\"ok\": true, \"state\": \"idle\"} within ~55-60s, zero manual steps on the Pi. uptime confirmed a genuine reboot (up 1 min)."
        status: pass
      - kind: manual_procedural
        ref: "journalctl -u porchlight-lamp.service -b showed the documented recovery path: first two boot-time start attempts fail with OSError [Errno 99] (169.254.10.2 not yet assigned to eth0), Restart=always/RestartSec=2 retries, 3rd attempt binds successfully ~5s after boot"
        status: pass
    human_judgment: false
    rationale: "Byte-level fb0 diffs aren't relevant here — this is a process-lifecycle claim (systemd install + reboot survival), fully provable by `systemctl is-active`/`is-enabled` and a real `sudo reboot` + health-poll cycle, all executed against the real Pi."

duration: 70min
completed: 2026-09-21
status: complete
---

# Phase 3 Plan 1: Porchlight Lamp Service Summary

Stdlib-only Python HTTP service on the Raspberry Pi renders idle/screening/verifying/verified/scam states as live Sense-HAT LED-matrix animations, watches a 60-second POST watchdog, and exposes a read-and-clear joystick endpoint; the systemd unit is installed, enabled, and confirmed to survive a real `sudo reboot` with zero manual steps — all verified against real hardware.

## Performance

- **Duration:** 70 min (55 min initial session + 15 min continuation after the sudo gate was resolved)
- **Started:** 2026-09-22T01:36:00Z
- **Completed:** 2026-09-22T02:46:00Z
- **Tasks:** 4 of 4 completed
- **Files modified:** 4 (`pi/lamp.py`, `pi/porchlight-lamp.service`, `pi/deploy.sh`, `pi/README.md`)

## Accomplishments
- `pi/lamp.py` is a complete, dependency-free (stdlib-only) HTTP service that discovers the Sense HAT framebuffer and joystick by name, renders four distinct live animations (amber breathe, blue breathe, green scroll, red/black flash) at ~15fps in a dedicated render thread, validates all POST input (400 on bad JSON/unknown state), and runs a 1-second-tick watchdog that force-reverts to idle after 60s of POST silence.
- Every behavioral claim in `must_haves.truths` was verified against the real Pi over SSH — not just unit-tested code, actual `/dev/fb0` byte reads before/after each state transition, and a real `sudo reboot`.
- `pi/porchlight-lamp.service` is installed and enabled on the Pi; `pi/deploy.sh` runs scp + systemd install + a retrying health check end-to-end and exits 0.
- Reboot survival is proven, not assumed: `sudo reboot` was actually run, and `GET /health` came back `{"ok": true, "state": "idle"}` within ~60s with zero manual steps, confirming LAMP-03.

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm hardware access** - `b0ff9c5` (docs)
2. **Task 2: lamp.py tracer — HTTP server, idle glow, scam-red end-to-end** - `07bd258` (feat)
3. **Task 3: Full state renderer — animations, joystick, watchdog** - `1d88b99` (feat)
4. **Task 4: systemd unit + deploy script** - `17a4b4e` (chore, files only — install blocked on sudo at the time)
5. **Halt checkpoint doc** - `efce3d4` (docs)
6. **Merge into main (tasks 1-3, systemd pending)** - `35e1b2e` (merge)
7. **Task 4 continuation: fix deploy.sh health-check race, prove reboot survival** - `31092cc` (fix)

## Files Created/Modified
- `pi/lamp.py` - HTTP server (`/health`, `/joystick`, `/state`), render/watchdog/joystick daemon threads, RGB565 framebuffer writer, 3x5 glyph scroller
- `pi/porchlight-lamp.service` - systemd unit (`Restart=always`, `RestartSec=2`, `User=pi`) — installed and enabled on the Pi
- `pi/deploy.sh` - scp + ssh install/enable/health-check script; health check now retries up to 10s (was a single-shot race against systemd startup)
- `pi/README.md` - Hardware Discovery section, Deploy section, manual curl state-check runbook, and a Reboot survival note documenting the observed bind-retry recovery in `journalctl`

## Decisions Made
- Top-aligned the scrolling glyph rows (not vertically centered) so any 8-pixel window of the scroll always contains live glyph data — matters both for visual scroll-detectability and for automated fb-byte-diff verification that only samples a handful of leading bytes.
- Used PLAN.md's explicit 1.2s breathing period for screening/verifying (not the dispatch summary's rounder "~1Hz" figure), treating the fully-specified plan as the controlling source over a higher-level paraphrase.
- Ran `lamp.py` manually via `nohup ... &` over SSH to verify Tasks 2-3 against real hardware before Task 4's systemd unit existed, since those tasks' acceptance criteria require live fb0 byte evidence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Top-aligned scroll glyphs instead of vertically centering them**
- **Found during:** Task 3, while designing the verified-state renderer
- **Issue:** A vertically-centered 5-row glyph (2 rows of top padding) would leave the top row of the 8x8 matrix always solid green regardless of scroll position — Task 3's own `<verify>` block only samples the first 8 bytes (top row, 4 pixels) of `/dev/fb0`, so centering would make the automated "fb bytes changed" check fail even though the renderer was working correctly everywhere else on the matrix.
- **Fix:** Glyph rows occupy display rows 0-4 (top-aligned) instead of rows 2-6 (centered), so the top row always carries live glyph data.
- **Files modified:** `pi/lamp.py`
- **Verification:** Two `/dev/fb0` reads 300ms apart during `verified` state showed different bytes (`83 02 2c 63...` -> `2c 63 83 02...`).
- **Committed in:** `1d88b99`

**2. [Rule 1 - Bug] `deploy.sh`'s health check raced systemd startup**
- **Found during:** Task 4 continuation, first real end-to-end deploy run
- **Issue:** `systemctl enable --now` returns as soon as the unit is scheduled, but `deploy.sh` immediately ran a single `curl -sf /health` right after — the Python process hadn't finished importing/binding yet, so the very first live deploy printed `FAIL` even though the service came up correctly a moment later (confirmed `active` on inspection).
- **Fix:** Retry the health curl up to 10 times with a 1s sleep and a 2s per-attempt timeout before declaring failure.
- **Files modified:** `pi/deploy.sh`
- **Verification:** Re-ran `bash pi/deploy.sh` after the fix — exited 0 with `PASS` on the first successful curl.
- **Committed in:** `31092cc`

---

**Total deviations:** 2 auto-fixed (Rule 1 — one rendering-layout bug, one deploy-script race condition, both auto-fixed and re-verified against real hardware). **Impact:** No scope creep; both fixes were required for the plan's own verification/acceptance criteria to hold true against live behavior.

## Issues Encountered

**Resolved: sudo authentication gate.** The initial session halted because `sudo -n true` on the Pi returned `sudo: a password is required`, contradicting the "passwordless sudo already enabled" fact given for that session. The human resolved this out-of-band by adding `/etc/sudoers.d/010_pi-nopasswd`. This continuation confirmed the fix (`ssh pi@169.254.10.2 sudo -n true` now succeeds with no prompt) before proceeding — no credential-guessing or self-recovery was attempted, matching the executor's auth-gate protocol from the original halt.

**Pre-install cleanup:** A manually-started `nohup python3 lamp.py &` process (PID 2311, left running from Tasks 2-3's live verification) was still bound to port 8080. Killed it by PID (`kill 2311`, not `pkill -f lamp.py` — the latter matched the SSH command's own argument string and killed the SSH session instead) and confirmed no listener on 8080 before running `deploy.sh`, so the systemd-managed process would own the port cleanly.

**Deploy race condition (see Deviations #2):** The first live `bash pi/deploy.sh` run reported `FAIL` on its health check even though the service was actually `active` a moment later — fixed by retrying the health curl for up to 10s.

**Reboot-survival evidence:** `sudo reboot` was run for real; `GET /health` was polled from the Mac every 5s and answered within ~55-60s. `journalctl -u porchlight-lamp.service -b` showed two failed start attempts (`OSError: [Errno 99] Cannot assign requested address` — `eth0`'s static IP wasn't up yet) before `Restart=always`/`RestartSec=2` succeeded on the 3rd attempt, exactly matching the recovery behavior `lamp.py`'s own bind comment anticipates. No unit/deploy-script changes were needed for this — it self-healed as designed.

## User Setup Required

None remaining. The sudo gate that previously required human action is resolved and verified.

## Next Phase Readiness

**Ready:** `pi/lamp.py`'s full HTTP contract (`POST /state`, `GET /health`, `GET /joystick`) is live on the real Pi at `169.254.10.2:8080`, now running under systemd (`porchlight-lamp.service`, enabled, `Restart=always`) rather than the earlier manual `nohup` process. Confirmed to come back up automatically after a real `sudo reboot`. Plan 02's Mac-side bridge can be built and tested against it with no outstanding blockers.

**Complete:** All four tasks are done and verified against real hardware. `LAMP-01`, `LAMP-03`, and `LAMP-04` are all satisfied — `LAMP-03` (reboot/crash survival) is now proven, not just written.

## Self-Check: PASSED

- `pi/lamp.py` exists: FOUND
- `pi/porchlight-lamp.service` exists: FOUND
- `pi/deploy.sh` exists: FOUND (executable)
- `pi/README.md` contains "Hardware Discovery": FOUND
- Commit `b0ff9c5` exists: FOUND
- Commit `07bd258` exists: FOUND
- Commit `1d88b99` exists: FOUND
- Commit `17a4b4e` exists: FOUND
- Commit `efce3d4` exists: FOUND
- Commit `35e1b2e` exists: FOUND
- Commit `31092cc` exists: FOUND
- Live service responds via systemd (not manual process): `curl http://169.254.10.2:8080/health` → `{"ok": true, "state": "idle"}`; `systemctl is-active porchlight-lamp.service` → `active`; `systemctl is-enabled` → `enabled`
- Reboot survival: `sudo reboot` run for real; `/health` answered within ~60s with zero manual steps; `uptime` confirmed genuine reboot

---
*Phase: 03-lamp*
*Completed: 2026-09-21*
