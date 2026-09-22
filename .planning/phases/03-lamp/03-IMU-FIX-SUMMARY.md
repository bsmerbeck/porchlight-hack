---
phase: 03-lamp
plan: IMU-FIX
subsystem: infra
tags: [raspberry-pi, sense-hat, lsm9ds1, i2c, accelerometer, orientation, joystick, evdev]

requires:
  - phase: 03-lamp (Plan IMU)
    provides: "pi/lamp.py IMU-driven auto-rotation (_rotate_frame, _rotation_from_gravity, ROTATION_FOR_*), POST /state rotation contract, GET /health rotation/auto_rotate fields, PORCHLIGHT_ROTATION env override"
provides:
  - "pi/lamp.py: corrected ROTATION_FOR_POSITIVE_X/ROTATION_FOR_NEGATIVE_X (physically confirmed against the real Pi -- the two SHORT-axis/ethernet-left-right tilts were 180 degrees wrong)"
  - "pi/lamp.py: DEFAULT_ROTATION=180 (confirmed correct for this board lying flat), replacing the previous hardcoded 0"
  - "pi/lamp.py: joystick long-press (>=0.8s, LONG_PRESS_SEC) manual orientation calibration -- a direction press pins rotation so that direction becomes the bottom of the text, persists to /home/pi/porchlight/rotation.json (atomic write), flashes a confirmation arrow; center long-press resets to auto and clears the persisted file"
  - "pi/lamp.py: GET /health rotation_source field (\"auto\"|\"joystick\"|\"api\"|\"env\")"
  - "pi/lamp.py: _process_joystick_event() pure press/release state machine -- short-press behavior (center alert flag, up/down/left/right demo cycling) preserved unchanged, now classified at release instead of at press"
  - "pi/test_lamp.py: 25 new tests (mapping-fix literal-value assertions, long-press timing, persistence round-trip, joystick calibration handlers, short-press parity, confirmation-frame shape) -- 56/56 passing"
  - "pi/README.md: updated orientation mapping table (physically confirmed), new \"Joystick Orientation Calibration\" section, confirmed accelerometer discovery path (raw I2C at 0x6a)"
affects: ["03-lamp (live on the deployed Pi as of this session)"]

actuals:
  tokens: 9600
  tasks: 5
  commits: 3
  plan_head_before: 883de1766c5acb76af16e4b935e2d911642fbbe0

tech-stack:
  added: []
  patterns:
    - "Native-edge-to-output-rotation derivation for joystick calibration: since the joystick's four direction switches are rigidly fixed to the same PCB as the LED matrix, 'pressing UP' always corresponds to the same native (pre-rotation) grid edge regardless of mounting. The rotation that brings a given native edge to the OUTPUT's bottom is a pure grid-math fact (down->0, right->90, up->180, left->270), independent of any physical mounting offset -- avoids needing hardware-specific calibration data that isn't available without the physical device in hand for exhaustive testing."
    - "Press/release classification via a pure, no-I/O state machine (_process_joystick_event) so long-press timing is unit-testable without a real evdev device or real time.sleep -- same shape as the existing _rotation_from_gravity/_rotate_frame pattern of isolating pure logic from the I/O loop that drives it."
    - "Atomic persistence (tmp file + os.replace) for rotation.json -- a crash mid-write never leaves a corrupt/partial file behind."

key-files:
  created: []
  modified:
    - pi/lamp.py
    - pi/test_lamp.py
    - pi/README.md

key-decisions:
  - "Derived the joystick-direction-to-rotation mapping from pure _rotate_frame grid math (which native edge maps to the output's bottom row under each rotation) rather than guessing a hardware-specific corner/direction correspondence with no way to physically verify it this session -- flagged in the README as a best-effort default needing human confirmation of all four directions, exactly like the original IMU axis mapping was flagged before this session's physical tilt test confirmed/corrected it."
  - "Chose to classify joystick presses as short/long only at RELEASE (not at press-down as the old code did) since press duration can't be known until release -- short-press actions now fire a few hundred ms later than before, imperceptible for the demo, and covered by ShortPressParityTests to confirm the refactor kept the existing behavior otherwise identical."
  - "Updated DEFAULT_ROTATION from 0 to 180 (Rule 1 -- the hardcoded 0 default was factually wrong for this board's confirmed-correct flat orientation) rather than leaving the stale default in place alongside the new joystick/persistence logic."
  - "PORCHLIGHT_ROTATION env var keeps top startup priority over a persisted joystick calibration (env > joystick > DEFAULT_ROTATION) -- it's the explicit demo-night escape hatch the prior session documented as 'always wins at startup', a stronger signal than a stored preference."
  - "Split commits into fix (lamp.py + test_lamp.py) then docs (README.md) rather than one task-per-commit, since the edge-mapping fix and the joystick-calibration feature share touched regions in the same files (_state dict, GET /health, POST /state) that don't separate cleanly at the hunk level without risky manual patch surgery -- documented here as the atomic-commit-boundary deviation for this quick fix."

requirements-completed: []

coverage:
  - id: D1
    description: "Edge-tilt auto-rotate mapping corrected: SHORT-axis (X, ethernet left/right) tilts, previously 180 degrees wrong, now match the LONG-axis (Y, ethernet up/down) tilts that were already correct."
    verification:
      - kind: unit
        ref: "pi/test_lamp.py ShortAxisMappingFixTests -- asserts the literal corrected values (ROTATION_FOR_POSITIVE_X=270, ROTATION_FOR_NEGATIVE_X=90) and that the Y pair is unchanged. 3/3 pass."
        status: pass
      - kind: manual_procedural
        ref: "Deployed to the real Pi (bash pi/deploy.sh, PASS) and --selftest run over SSH (cycled 5 states successfully) -- human must physically tilt the board onto all four edges to visually confirm the corrected mapping (README.md \"Manual verification\" has the exact steps); not done this session (no hands on the hardware, only SSH/curl access)."
        status: unknown
    human_judgment: true
    rationale: "The rotation math and constant values are unit-tested and code-reviewed, but whether text reads upright from each physical tilt angle can only be judged by a human looking at the actual LED matrix while tilting the real board -- not observable over SSH/curl."
  - id: D2
    description: "Joystick long-press (>=0.8s) sets manual rotation calibration for a flat-mounted board, persists across reboot, and can be reset via a center long-press; short presses are unaffected."
    verification:
      - kind: unit
        ref: "pi/test_lamp.py LongPressTimingTests, RotationPersistenceTests, JoystickCalibrationTests, ShortPressParityTests, ConfirmationFrameTests, HealthRotationSourceFieldTests -- 22 new tests covering timing classification, disk round-trip, handler state mutation, and short-press parity. All pass (56/56 total suite)."
        status: pass
      - kind: manual_procedural
        ref: "README.md \"Manual verification\" -- long-press a direction while flat, confirm the arrow flash points toward the viewer, confirm /health rotation_source, confirm the scrolling name reads upright, long-press center to reset, and confirm the pinned rotation survives a service restart. Not done this session (requires physically holding the joystick down for >=1s, and eyeballing the LED matrix)."
        status: unknown
    human_judgment: true
    rationale: "Timing logic, persistence, and state mutation are exhaustively unit-tested without hardware, but the actual joystick-direction-to-native-edge correspondence (whether pressing 'up' really does put the ethernet-adjacent native top edge at the output bottom on THIS physical board) and the visual confirmation flash can only be confirmed by a human physically pressing the joystick and watching the matrix."

duration: 40min
completed: 2026-09-22
status: complete
---

# Phase 3 IMU-FIX: Corrected Edge-Tilt Mapping + Joystick Flat-Orientation Calibration Summary

**Swapped the two SHORT-axis (X) rotation constants that a physical tilt test found 180 degrees wrong (ethernet-edge-left/right tilts were upside down; ethernet-edge-up/down were already correct), and added joystick long-press (>=0.8s) manual orientation calibration — with disk persistence, a visual confirmation flash, and a `rotation_source` field on `/health` — for when the board lies flat and gravity alone can't tell auto-rotate which way is up.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-09-22T (session start)
- **Completed:** 2026-09-22T (this session)
- **Tasks:** 5/5 (read, fix mapping, joystick long-press, flat/persistence precedence, tests+deploy+verify)
- **Files modified:** 3 (`pi/lamp.py`, `pi/test_lamp.py`, `pi/README.md`)

## Accomplishments

- **Corrected edge-tilt mapping.** `ROTATION_FOR_POSITIVE_X` and `ROTATION_FOR_NEGATIVE_X` swapped (90/270 -> 270/90), matching the human's physical observation that the two SHORT-axis (ethernet-left/right) tilts were 180 degrees off while the LONG-axis (ethernet-up/down) tilts were already correct.
- **Confirmed default flat rotation.** `DEFAULT_ROTATION = 180` replaces the old hardcoded `0`, matching the confirmed-correct value for this board lying flat with the joystick nub at the bottom-right from the viewer.
- **Joystick manual calibration.** A long press (>= `LONG_PRESS_SEC` = 0.8s) on any direction pins `rotation` so that direction becomes the bottom of the rendered text (derived from `_rotate_frame`'s own grid math — down->0°, right->90°, up->180°, left->270°), disables `auto_rotate`, persists `{"rotation": N}` to `/home/pi/porchlight/rotation.json` via an atomic write, and flashes a directional arrow for 1s. A long press on center clears the persisted file and resets to auto (flashing an "A"). Short presses (center alert flag, up/down/left/right demo cycling) are byte-for-byte unaffected — both are now classified only at release, via a new pure `_process_joystick_event()` state machine.
- **Startup precedence.** `main()` now loads, in order: `PORCHLIGHT_ROTATION` env var, then a persisted joystick rotation from disk, then falls back to `DEFAULT_ROTATION`/auto-rotate. A persisted joystick rotation wins over IMU auto-rotate (since it sets `auto_rotate=False`) until the next center long-press.
- **`rotation_source` on `/health`.** Reports `"auto"` (IMU) | `"joystick"` (long-press, persisted) | `"api"` (`POST /state` pin) | `"env"` (`PORCHLIGHT_ROTATION`).
- **Tests.** 25 new tests: literal-value assertions for the corrected mapping, long-press timing classification (press/release, autorepeat-ignored, threshold edge), on-disk persistence round-trip (save/load/clear/corrupt/out-of-range), joystick calibration handler behavior (direction mapping, disable-auto, persist, flash; center reset), short-press parity, and confirmation-frame shape checks. **56/56 tests pass** (31 pre-existing + 25 new), both locally and on the deployed Pi over SSH.
- **Deployed and smoke-tested on the real Pi.** `bash pi/deploy.sh` succeeded; `python3 lamp.py --selftest` cycled all 5 demo states over SSH; `GET /health` returns the new `rotation_source` field; `journalctl` confirms the raw-I2C accelerometer path is live (`accelerometer via raw I2C at 0x6a`) with no errors after restart, closing a previously-open question in `03-IMU-SUMMARY.md` about which discovery path is actually in use.
- **Docs.** README's orientation mapping table now shows the physically-confirmed values with the ethernet-edge framing; new "Joystick Orientation Calibration" section documents the derivation, behavior contract, startup precedence, and exact manual verification steps.

## Task Commits

Each logical unit was committed atomically:

1. **Tasks 1-4: mapping fix, joystick calibration, persistence, tests** - `ffe78eb` (fix)
2. **Task 5 (docs): orientation mapping + joystick calibration contract** - `a2923b7` (docs)
3. **Task 5 (docs): confirmed accelerometer discovery path from live journalctl** - `be18db0` (docs)

_Note: the edge-mapping fix and joystick-calibration feature share touched regions in `lamp.py` (`_state` dict, `GET /health`, `POST /state`) that don't separate cleanly into per-task commits without risky manual patch surgery — see key-decisions for the rationale._

## Files Created/Modified

- `pi/lamp.py` — `ROTATION_FOR_POSITIVE_X`/`ROTATION_FOR_NEGATIVE_X` swapped; `DEFAULT_ROTATION`; joystick calibration section (`ROTATION_FOR_JOYSTICK_*`, `_ROTATION_FOR_JOYSTICK_DIRECTION`, `LONG_PRESS_SEC`, `CONFIRMATION_FLASH_SEC`, `ROTATION_PERSIST_PATH`, `_save_rotation`/`_load_persisted_rotation`/`_clear_persisted_rotation`, `_ARROW_SHAPES`/`_shape_frame`/`_arrow_frame`/`_static_glyph_frame`, `_process_joystick_event`, `_handle_joystick_short_press`/`_handle_joystick_long_press`); `_state` gains `rotation_source`/`flash_frame`/`flash_until`; `GET /health` and `POST /state` updated; `render_loop` flash overlay; `joystick_loop` rewritten around the new press/release state machine; `main()` startup precedence (env > persisted joystick > default)
- `pi/test_lamp.py` — `ShortAxisMappingFixTests`, `LongPressTimingTests`, `RotationPersistenceTests`, `JoystickCalibrationTests`, `ShortPressParityTests`, `ConfirmationFrameTests`, `HealthRotationSourceFieldTests` (25 new test methods)
- `pi/README.md` — "Orientation mapping" table updated to confirmed values with ethernet-edge framing; new "Joystick Orientation Calibration" section (derivation table, behavior contract, manual verification steps); accelerometer discovery path confirmed (raw I2C at 0x6a)

## Decisions Made

See `key-decisions` in frontmatter — summarized: derived the joystick direction-to-rotation mapping from pure grid math (native edge -> output bottom) rather than guessing hardware specifics with no way to verify this session; classify press duration at release (not press-down), verified not to change short-press behavior; corrected the stale `DEFAULT_ROTATION` hardcoded value alongside the new logic since it was factually wrong; kept `PORCHLIGHT_ROTATION` env var as the top startup priority; consolidated commits at file-type granularity (fix vs. docs) rather than per-sub-task, since the two features share touched code regions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected `DEFAULT_ROTATION` from hardcoded `0` to the confirmed-correct `180`**
- **Found during:** Task 4 (flat/persisted-rotation precedence)
- **Issue:** The `_state["rotation"]` initial value was hardcoded to `0`, but the human observation confirmed the board lying flat (before any accelerometer reading or joystick calibration) needs `rotation=180` for upright text — the old default was simply wrong for this mounting.
- **Fix:** Added `DEFAULT_ROTATION = 180` constant and used it as `_state["rotation"]`'s initial value and the fallback in `main()`'s startup precedence chain.
- **Files modified:** `pi/lamp.py`
- **Verification:** `pi/test_lamp.py::ShortAxisMappingFixTests::test_default_rotation_constant_matches_the_confirmed_flat_orientation`
- **Committed in:** `ffe78eb`

**2. [Rule 2 - Missing Critical] Documented the accelerometer discovery path, closing an open question from the prior session**
- **Found during:** Task 5 (deploy/verify)
- **Issue:** `03-IMU-SUMMARY.md`/README left "which discovery path is actually live on this Pi" explicitly unconfirmed (the Pi was unreachable in that session).
- **Fix:** Checked `journalctl` and `/sys/bus/iio/devices/` on the live Pi this session, confirmed raw I2C at `0x6a` is the path in use, and updated the README from "not yet confirmed" to the confirmed fact.
- **Files modified:** `pi/README.md`
- **Verification:** `ssh pi@169.254.10.2 'sudo journalctl -u porchlight-lamp.service'` shows `accelerometer via raw I2C at 0x6a`; `ls /sys/bus/iio/devices/` returns "No such file or directory".
- **Committed in:** `be18db0`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing-context doc fix)
**Impact on plan:** Both auto-fixes are small, low-risk corrections directly supporting the plan's stated goals (correct default orientation; complete the orientation documentation). No scope creep.

## Issues Encountered

None blocking. The Pi was reachable this entire session (ping, ssh, and `/health` all responded immediately), unlike the prior `03-IMU` session.

## Known Stubs

None. All new code paths (mapping fix, joystick calibration, persistence, confirmation flash) are fully implemented, not stubbed.

## User Setup Required

**Physical verification is the only remaining step — cannot be automated (no way to see the LEDs or press a physical joystick from a script).** Exact steps:

**1. Confirm the edge-tilt fix (auto-rotate):**
```bash
curl -X POST http://169.254.10.2:8080/state -H 'content-type: application/json' -d '{"state":"verified","name":"Brenden"}'
```
Then, watching the LED matrix, stand the board on each of its four edges in turn and confirm "BRENDEN" reads right-side-up every time:
- Ethernet port edge down
- Ethernet port edge up (opposite short edge down)
- Ethernet port edge to the left (one long edge down)
- Ethernet port edge to the right (other long edge down)

Optionally watch `ssh pi@169.254.10.2 'sudo journalctl -u porchlight-lamp.service -f'` while tilting to see the `auto-rotate -> N` log lines and cross-check against the corrected table in `pi/README.md`.

**2. Confirm joystick flat-orientation calibration:**
```bash
# Lay the board flat first.
```
1. Long-press (hold >= 1s to be safe) the joystick direction that faces you.
2. Watch for the 1s arrow flash — it should point toward you.
3. `curl http://169.254.10.2:8080/health` should show `"auto_rotate": false, "rotation_source": "joystick"`.
4. Confirm "BRENDEN" (from step 1's state) now scrolls right-side-up toward you.
5. Long-press the center button — watch for the "A" flash, and confirm `/health` shows `"auto_rotate": true, "rotation_source": "auto"` again.
6. Re-run a direction long-press, then `sudo systemctl restart porchlight-lamp.service` on the Pi, and confirm `/health` still shows the pinned rotation and `"rotation_source": "joystick"` after the restart (proves the persisted-to-disk load-on-startup path).

**Note on the Mac bridge:** the bridge re-POSTs the last known state every 20s, which will overwrite any manual `curl POST /state` test state. If a visual check needs to hold for longer than 20s, either pause the bridge process or re-run the `curl POST` every ~3s while observing.

If any of the four edge tilts or four joystick directions comes out wrong, swap the matching constant pair in `pi/lamp.py` (`ROTATION_FOR_POSITIVE_X`/`_NEGATIVE_X`, the Y pair, or `ROTATION_FOR_JOYSTICK_UP`/`_DOWN`/`_LEFT`/`_RIGHT`) and redeploy — `pi/README.md` has the full procedure for both.

## Next Phase Readiness

**Code-complete, deployed, unit-tested (56/56 passing on both the dev machine and the live Pi over SSH), physical-behavior-unconfirmed.** The mapping fix and joystick calibration feature are live on the deployed Pi (`bash pi/deploy.sh` succeeded, `--selftest` ran cleanly, `/health` reports the new `rotation_source` field, no errors in `journalctl`). Nothing here changes the bridge/Firestore contract — purely additive to the existing `POST /state`/`GET /health`/`GET /joystick` surface.

**Blocking for demo-readiness (not for other phases):** a human needs to physically tilt the board onto all four edges and physically long-press all four joystick directions (see User Setup Required) to confirm the corrected/new mappings hold on the real hardware. If time runs out before the demo, `PORCHLIGHT_ROTATION` remains available as a guaranteed manual override for the edge-tilt case, and a straight `POST /state {"rotation": N}` pin works as an override for the flat case if the joystick calibration turns out wrong.

## Self-Check: PASSED

- `pi/lamp.py` contains `ROTATION_FOR_POSITIVE_X = 270`: FOUND
- `pi/lamp.py` contains `DEFAULT_ROTATION = 180`: FOUND
- `pi/lamp.py` contains `_process_joystick_event`: FOUND
- `pi/lamp.py` contains `ROTATION_PERSIST_PATH`: FOUND
- `pi/test_lamp.py` contains `ShortAxisMappingFixTests`: FOUND
- `pi/test_lamp.py` contains `JoystickCalibrationTests`: FOUND
- `pi/README.md` contains "Joystick Orientation Calibration": FOUND
- Commit `ffe78eb` exists: FOUND
- Commit `a2923b7` exists: FOUND
- Commit `be18db0` exists: FOUND
- `python3 -m unittest test_lamp` (pi/, local): 56/56 PASSED
- `python3 -m unittest test_lamp` (pi/, over SSH on the Pi): 56/56 PASSED
- `python3 -m py_compile pi/lamp.py`: PASSED (no syntax errors)
- `bash pi/deploy.sh`: PASSED (`/health` responded within the 10s retry window)
- `python3 lamp.py --selftest` (over SSH): PASSED (cycled 5 states successfully)
- `curl http://169.254.10.2:8080/health`: PASSED (`rotation_source` field present)
- Physical edge-tilt confirmation: NOT RUN — requires a human physically tilting the board (see User Setup Required)
- Physical joystick long-press confirmation: NOT RUN — requires a human physically holding the joystick (see User Setup Required)

---
*Phase: 03-lamp*
*Completed: 2026-09-22*
