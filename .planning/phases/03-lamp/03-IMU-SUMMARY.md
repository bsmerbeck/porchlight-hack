---
phase: 03-lamp
plan: IMU
subsystem: infra
tags: [raspberry-pi, sense-hat, lsm9ds1, i2c, iio, accelerometer, orientation, font]

requires:
  - phase: 03-lamp (Plan 01, FIX)
    provides: "pi/lamp.py HTTP contract (POST /state, GET /health, GET /joystick), 3x5 scrolling-name renderer, deployed on the real Pi at 169.254.10.2:8080"
provides:
  - "pi/lamp.py: IMU-driven auto-rotation (0/90/180/270) applied to every rendered frame via a new _rotate_frame(), so scrolling text is never upside down regardless of physical mounting"
  - "pi/lamp.py: accelerometer discovery (kernel IIO sysfs, then raw I2C fcntl.ioctl against the LSM9DS1) -- stdlib only"
  - "pi/lamp.py: POST /state additive \"rotation\" field (0|90|180|270|\"auto\"), GET /health rotation + auto_rotate fields, PORCHLIGHT_ROTATION env override"
  - "pi/lamp.py: 5x7 uppercase A-Z + digits + space + hyphen font replacing the original 3x5 table, with N/M/W made visually distinct"
  - "pi/test_lamp.py: rotation-math, orientation-mapping, env-override, and font-dimension test coverage (31/31 passing locally)"
affects: ["03-lamp (live deploy still pending -- Pi unreachable this session, see Deploy Status below)"]

actuals:
  tokens: 8800
  tasks: 5
  commits: 2
  plan_head_before: 5ee26b24d05eef28eeada2eccfd6a5857e9c6328

tech-stack:
  added: []
  patterns:
    - "Accelerometer discovery: kernel IIO sysfs first (no ioctl needed if already exposed), raw I2C fcntl.ioctl fallback against a known chip (LSM9DS1) and register map -- same fallback shape as the existing framebuffer/joystick discovery-by-name pattern, just one level lower (register-level instead of device-node-level) since the rpi-sense overlay doesn't expose the IMU as a named device."
    - "Single _rotate_frame() applied uniformly to every frame_for_state() output right before the RGB565 write -- one rotation implementation shared by idle/screening/scam/verified, not a per-animation special case."
    - "Axis-to-rotation sign mapping isolated into four named constants (ROTATION_FOR_POSITIVE_Y etc.) specifically so a wrong physical-tilt-to-rotation mapping is a one-line fix, not a logic rewrite."

key-files:
  created: []
  modified:
    - pi/lamp.py
    - pi/test_lamp.py
    - pi/README.md

key-decisions:
  - "Chose a 5x7 font over 4x6 (both were in-scope per the task) for maximum legibility within the 8-wide matrix constraint (5 cols + 1 gap = 6, leaves room for the 8-wide window to always show most of a glyph) -- 5x7 is also the widely-used baseline dot-matrix font size, so hand-drawing each glyph from well-established shapes was lower-risk than inventing a novel 4x6 set from scratch."
  - "Made POST /state's \"rotation\" field additive and optional independently of \"state\" (a rotation-only POST with no \"state\" key is now valid, not just a rotation-alongside-state POST) -- keeps the existing bridge contract (always POSTs state) completely unchanged while satisfying the plan's literal `POST /state {\"rotation\": ...}` spec without breaking backward compatibility."
  - "Isolated the axis->rotation sign mapping into four standalone module constants (ROTATION_FOR_POSITIVE_Y/NEGATIVE_Y/POSITIVE_X/NEGATIVE_X) rather than inlining the sign logic in _rotation_from_gravity, specifically so a wrong physical mapping (discovered only by tilting the real hardware) is a one-line constant swap, not a re-derivation of the detection algorithm."
  - "PORCHLIGHT_ROTATION env override always takes precedence at startup and disables auto_rotate, giving a guaranteed escape hatch if the IMU mapping turns out wrong right before the demo and there's no time to debug it."

requirements-completed: []

coverage:
  - id: D1
    description: "_rotate_frame() correctly rotates an 8x8 row-major frame by 0/90/180/270 degrees: four 90-degree rotations return the original frame, 180 degrees flips both axes, 270 is the exact inverse of 90"
    verification:
      - kind: unit
        ref: "pi/test_lamp.py RotationMathTests -- a fully-marked frame (each pixel a distinct (row,col) tuple, not a symmetric test pattern that could mask a bug) rotated 90 degrees four times equals the original; 180-degree result checked pixel-by-pixel against grid[7-r][7-c]; 270 checked as the inverse of 90; invalid degrees raises ValueError. 5/5 pass."
        status: pass
    human_judgment: false
  - id: D2
    description: "5x7 font: every glyph matches the declared GLYPH_WIDTH x GLYPH_HEIGHT dimensions, uses only '#'/'.' characters, and N/M/W are visually distinct shapes"
    verification:
      - kind: unit
        ref: "pi/test_lamp.py FontGlyphTests -- height/width assertions over every _GLYPHS entry, character-set assertion, N/M/W pairwise-inequality assertion, unknown-character space fallback, verified_frame('Brenden') produces a full 64-pixel frame. 7/7 pass."
        status: pass
      - kind: manual_procedural
        ref: "ASCII-art render of every glyph (B,R,E,N,D,E,N,M,W,-,0-9) printed and eyeballed this session -- BRENDEN reads clearly, N/M/W are unambiguous, digits are legible"
        status: pass
    human_judgment: true
    rationale: "ASCII-art rendering and unit tests confirm the bitmap data is internally consistent and the three previously-confusable letters are now distinct shapes, but how the font actually reads on the physical 8x8 LED matrix at brightness=0.4 and demo viewing distance can only be judged by eyeballing the real hardware -- not done this session (Pi unreachable, see below)."
  - id: D3
    description: "Accelerometer is discovered on the real Pi via kernel IIO sysfs or raw I2C, and orientation_loop drives auto-rotation as the board is physically tilted"
    verification: []
    human_judgment: true
    rationale: "BLOCKED THIS SESSION -- the Pi (pi@169.254.10.2) was unreachable over the direct ethernet cable for the entire session (ssh: \"Host is down\", ping: \"sendto: Host is down\", ARP shows a reject route on the Mac's en8 interface -- consistent with the cable being unplugged or the Pi being powered off, not a software problem on either side). Neither the IIO-vs-I2C discovery path, nor the actual accelerometer readings, nor the axis-to-rotation sign mapping could be verified against real hardware. The rotation math itself (D1) and the discovery code's structure are unit-tested and reviewed, but which discovery path fires and whether the sign mapping matches this board's physical mounting are both open until a human runs the calibration procedure in pi/README.md \"Orientation Calibration\" against the live Pi. See Deploy Status and User Setup Required below."
  - id: D4
    description: "GET /health and POST /state's rotation contract works end-to-end against the live service"
    verification:
      - kind: unit
        ref: "pi/test_lamp.py HealthAndStateRotationFieldTests, RotationEnvOverrideTests -- default state-dict shape and PORCHLIGHT_ROTATION parsing/validation exercised directly against the shared in-process state (same pattern this suite already uses for the joystick contract). 4/4 pass."
        status: pass
      - kind: manual_procedural
        ref: "NOT RUN -- requires a live curl against the deployed Pi (blocked, see D3)"
        status: fail
    human_judgment: false
    rationale: "The handler logic (state-dict mutation under lock, validation branching) is code-reviewed and covered by unit tests against the shared _state dict, but the actual HTTP request/response round-trip (Content-Length parsing, JSON body, response codes) has not been curled against a live server this session."

duration: 55min
completed: 2026-09-22
status: complete
---

# Phase 3 IMU: Auto-Orientation + Legible Font Summary

**Sense HAT accelerometer now drives auto-rotation (0/90/180/270) applied uniformly to every rendered frame so scrolling text can't end up upside down, and the scrolling-name font was upgraded from a cramped 3x5 table to a legible 5x7 uppercase+digit set with N/M/W made visually distinct — code is written, unit-tested (31/31 passing), and committed, but live deploy/verification against the physical Pi is blocked because the Pi was unreachable over the direct ethernet cable for this entire session.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-09-22T14:10:00Z (approx.)
- **Completed:** 2026-09-22T15:05:00Z (approx.)
- **Tasks:** 5 planned; 4 fully done (code + tests + docs), 1 blocked (live deploy/verify)
- **Files modified:** 3 (`pi/lamp.py`, `pi/test_lamp.py`, `pi/README.md`)

## Deploy Status: BLOCKED — Pi unreachable this session

`pi@169.254.10.2` did not respond to `ping` or `ssh` at any point during this
session:
```
ping: sendto: Host is down
ssh: connect to host 169.254.10.2 port 22: Host is down
```
The Mac's own ARP table (`netstat -rn`) shows a reject-flagged route for
`169.254.10.2` on `en8`, consistent with the direct ethernet cable being
unplugged or the Pi being powered off — not a software/config regression on
either side (the same address, service, and deploy script that were
confirmed working live in `03-01-SUMMARY.md` and `03-FIX-SUMMARY.md` are
unchanged in shape here). This was checked three times across the session
(start, mid-implementation, and immediately before writing this summary) and
never came up.

**Nothing that requires the physical Pi was skipped by choice** — `bash
pi/deploy.sh`, `--selftest`, `curl /health`, and the physical tilt-test
calibration were all planned and are all ready to run the moment the Pi is
back on the cable.

## Accomplishments

- **Auto-rotation.** `_rotate_frame()` performs a correct row-major 8x8
  clockwise rotation (0/90/180/270), applied identically to every state's
  output (idle/screening/verifying/verified/scam) in both `render_loop` and
  `run_selftest`, one implementation shared by all animations.
- **Accelerometer discovery.** `_make_accelerometer()` tries kernel IIO
  sysfs first (`in_accel_{x,y,z}_raw` + `in_accel_scale`), then falls back
  to raw I2C via `fcntl.ioctl` against the LSM9DS1 at `0x6a`/`0x6b`
  (`WHO_AM_I` confirmed, `CTRL_REG6_XL` configured for 119Hz/±2g, 6 bytes
  read from `OUT_X_L_XL` with the auto-increment bit) — stdlib only, no
  `smbus2`/`RTIMU` package, matching the Pi's no-internet/no-pip constraint.
- **Orientation loop.** `orientation_loop()` samples gravity every 2s;
  dominant X/Y axis (with a documented, swappable sign-to-rotation mapping)
  updates `_state["rotation"]` when `auto_rotate` is on; Z-dominant (flat)
  leaves the last rotation untouched, per spec.
- **Wire contract.** `POST /state` accepts an additive `"rotation"` field
  (`0|90|180|270|"auto"`) independently of `"state"` (a rotation-only POST
  with no `"state"` key is valid); `GET /health` now reports `rotation` and
  `auto_rotate`; `PORCHLIGHT_ROTATION` env var pins rotation at startup as a
  guaranteed override if the IMU mapping is ever wrong on demo night.
- **Font.** Replaced the 3x5 glyph table with a 5x7 uppercase A-Z + digits +
  space + hyphen set (34 glyphs total), redrawn so N/M/W — the old font's
  worst legibility failure — are unambiguous. Scroll speed tightened to
  90ms/column for the wider glyphs. `DEMO_CYCLE_NAME = "Brenden"` still
  renders "BRENDEN" in the `verified` demo state.
- **Tests.** Added `RotationMathTests` (4x90°=identity, 180° flips both
  axes via pixel-by-pixel check against a fully-marked frame, 270° is the
  inverse of 90°, invalid degrees raises), `OrientationMappingTests`,
  `RotationEnvOverrideTests`, `HealthAndStateRotationFieldTests`, and
  `FontGlyphTests` (dimension checks on every glyph, N/M/W distinctness,
  unknown-char fallback). 31/31 tests pass locally (`python3 -m unittest
  test_lamp`).

## Task Commits

1. **Tasks 1-4: IMU accelerometer discovery, rotation math, orientation loop, wire contract, 5x7 font, tests** - `041e2b0` (feat)
2. **Task 5 (partial — docs): README auto-orientation contract + calibration procedure** - `676f636` (docs)

Task 5's remaining scope (deploy + live selftest/curl verification) is
**not committed** because it could not be executed — see Deploy Status.

## Files Created/Modified

- `pi/lamp.py` — `_rotate_frame()`, `_IIOAccel`/`_I2CAccel`/`_make_accelerometer()`, `_rotation_from_gravity()`, `_rotation_from_env()`, `orientation_loop()`, rotation applied in `render_loop`/`run_selftest`, `POST /state` rotation field, `GET /health` rotation/auto_rotate fields, 5x7 `_GLYPHS` table (replaces 3x5), `SCROLL_STEP_SEC` tightened to 0.09s
- `pi/test_lamp.py` — `RotationMathTests`, `OrientationMappingTests`, `RotationEnvOverrideTests`, `HealthAndStateRotationFieldTests`, `FontGlyphTests` (18 new test methods)
- `pi/README.md` — new "Auto-Orientation (IMU)" section (discovery order, wire contract, mapping table, calibration procedure) and "Font" section; manual-runbook curl examples extended with rotation POSTs

## Decisions Made

See `key-decisions` in frontmatter — summarized: chose 5x7 over 4x6 for the font (better legibility, well-established glyph shapes, still fits the 8-wide matrix with a 1px gap); made the rotation field on `POST /state` additive and independently optional from `state` so the existing bridge contract is untouched; isolated the axis-to-rotation sign mapping into four standalone constants specifically so a wrong-on-hardware mapping is a one-line fix; `PORCHLIGHT_ROTATION` always wins at startup as a guaranteed manual override.

## Deviations from Plan

### Auto-fixed Issues

None — no bugs or missing-functionality auto-fixes were needed; the deviation here is a blocked verification step, not a code deviation, documented below under Issues Encountered.

## Issues Encountered

**Pi unreachable for the entire session (blocking Task 5's live verification).** `pi@169.254.10.2` never answered ping or ssh, checked at session start, mid-implementation, and immediately before writing this summary. This is almost certainly the direct ethernet cable being unplugged or the Pi being powered off (not a config regression — the address/service/deploy script are unchanged from the last confirmed-working session in `03-01-SUMMARY.md`/`03-FIX-SUMMARY.md`). No workaround exists for physically verifying hardware behavior without the hardware; all code that *can* be verified without the physical Pi (rotation math, font dimensions, env-var parsing, state-dict contract) was verified via unit tests (31/31 passing) and a manual ASCII-art render of every glyph.

## User Setup Required

**1. Reconnect the Pi, then deploy and verify:**
```bash
bash pi/deploy.sh
ssh pi@169.254.10.2 'cd /home/pi/porchlight/pi && python3 lamp.py --selftest'
curl http://169.254.10.2:8080/health   # confirm "rotation" and "auto_rotate" are present
```

**2. Confirm which accelerometer discovery path is live:**
```bash
ssh pi@169.254.10.2 'ls /sys/bus/iio/devices/ 2>&1; cat /sys/bus/iio/devices/iio:device*/name 2>&1'
```
Empty/error output is expected and means the I2C fallback is in use (the
`rpi-sense` overlay doesn't expose the IMU via IIO by default) — confirm
`journalctl -u porchlight-lamp.service` logs `accelerometer via raw I2C at
0x6a` (or `0x6b`) shortly after the service starts.

**3. Physically confirm the rotation mapping — the most important step.**
Set `verified` state with a name (`curl -X POST .../state -d
'{"state":"verified","name":"Brenden"}'`), then tilt the board onto each of
its four edges while watching `journalctl -u porchlight-lamp.service -f`.
Each tilt should log `auto-rotate -> N (x=... y=... z=...)`. **Confirm
"BRENDEN" reads right-side-up from the corresponding physical viewing
angle for all four tilts.** If any orientation is wrong, swap the matching
constant in `pi/lamp.py` (`ROTATION_FOR_POSITIVE_Y` / `_NEGATIVE_Y` /
`_POSITIVE_X` / `_NEGATIVE_X`) and redeploy — see `pi/README.md`
"Orientation mapping — NEEDS PHYSICAL CONFIRMATION" for the full procedure.
If there's no time to debug a wrong mapping before the demo, pin the
correct rotation directly via `PORCHLIGHT_ROTATION=<N>` in
`porchlight-lamp.service`'s `[Service]` block instead of relying on
auto-rotate.

**4. Eyeball the new font** on the real matrix during the same session —
the ASCII-art render this session confirmed "BRENDEN" is legible and N/M/W
are distinct, but the actual LED appearance at `BRIGHTNESS=0.4` from normal
demo viewing distance hasn't been confirmed.

## Next Phase Readiness

**Code-complete, hardware-unverified.** All logic that doesn't require the
physical Pi is implemented, unit-tested (31/31 passing), and committed:
rotation math, accelerometer discovery code (both paths), the wire contract
additions, and the 5x7 font. Nothing here changes `bridge/index.mjs` or the
existing `state`/`name`/`joystick` contract the bridge already depends on —
the rotation field is purely additive, so Phase 3's existing bridge
integration is unaffected regardless of when the Pi is reconnected.

**Blocking for demo-readiness (not for other phases):** the orientation
mapping needs a human to physically tilt the board and confirm/correct the
four rotation constants before relying on auto-rotate on stage — see User
Setup Required above. `PORCHLIGHT_ROTATION` is available as a same-effort
fallback if that calibration can't happen before the demo.

## Self-Check: PASSED

- `pi/lamp.py` contains `_rotate_frame`: FOUND
- `pi/lamp.py` contains `orientation_loop`: FOUND
- `pi/lamp.py` contains `_I2CAccel`: FOUND
- `pi/lamp.py` contains `GLYPH_WIDTH = 5` / `GLYPH_HEIGHT = 7`: FOUND
- `pi/test_lamp.py` contains `RotationMathTests`: FOUND
- `pi/README.md` contains "Auto-Orientation (IMU)": FOUND
- Commit `041e2b0` exists: FOUND
- Commit `676f636` exists: FOUND
- `python3 -m unittest test_lamp` (pi/): 31/31 PASSED
- `python3 -m py_compile pi/lamp.py`: PASSED (no syntax errors)
- Live Pi verification (`deploy.sh`, `--selftest`, `curl /health`, physical tilt test): NOT RUN — Pi unreachable this session (see Deploy Status)

---
*Phase: 03-lamp*
*Completed: 2026-09-22*
