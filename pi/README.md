# Porchlight Lamp Controller

Runs on the Raspberry Pi 4 + Sense HAT beside the phone, showing call state as
a color: amber idle, blue screening/verifying (pulsing), green verified
(scrolling name), red flashing scam.

- Raspberry Pi OS trixie (Debian 13), Python 3.13.5, standard library only —
  no `sense_hat` module is installed and the Pi has no internet on the
  link-local ethernet cable, so it cannot `pip install` anything. The service
  talks directly to the raw framebuffer (`/dev/fb0`, RGB565) and raw evdev
  (`/dev/input/eventN`) instead.
- Driven from the Mac's bridge script over the direct ethernet link
  (`en8` / static `169.254.10.2:8080`), never over venue Wi-Fi.

## Hardware Discovery

Confirmed live over SSH against the real Pi (`pi@169.254.10.2`) before any
service code was written:

- `cat /sys/class/graphics/fb0/name` → `RPi-Sense FB` — `/dev/fb0` is
  confirmed to be the Sense HAT's 8x8 RGB565 LED matrix (128-byte buffer).
  `lamp.py` still discovers this by name at runtime (`find_fb_device()`) —
  this check only proves today's mapping is correct, it does not get
  hardcoded.
- Joystick input device, found by scanning
  `/sys/class/input/event*/device/name`:

  | Event device | Name |
  |---|---|
  | `event0` | `vc4-hdmi-0` |
  | `event1` | `vc4-hdmi-0 HDMI Jack` |
  | `event2` | `vc4-hdmi-1` |
  | `event3` | `vc4-hdmi-1 HDMI Jack` |
  | `event4` | **`Raspberry Pi Sense HAT Joystick`** |

  `event4` is the joystick today. `lamp.py` discovers it by name
  (`find_joystick_device()`) at startup rather than hardcoding `event4`,
  since the number can shift if other input devices are added/removed.
- `uname -m` → `aarch64`; `python3 -c "import struct; print(struct.calcsize('llHHi'))"`
  → `24`. Confirms the evdev `input_event` struct format (`llHHi`, 24 bytes)
  used to parse joystick events on this 64-bit box.
- Framebuffer write smoke test (as user `pi`, no `sudo`): opened `/dev/fb0`
  with `os.O_RDWR`, wrote 128 bytes of `\xff` (solid white, full brightness —
  a one-off visibility check only; production code caps brightness), waited
  1 second, then wrote 128 zero bytes to clear it. Succeeded with no
  permission error, confirming `pi`'s `video` group membership is sufficient
  to drive the matrix before any HTTP server exists.

## Deploy

```bash
./pi/deploy.sh
```

This copies `pi/` to the Pi (`/home/pi/porchlight/pi/`), installs and enables
`porchlight-lamp.service` via systemd, and curls `/health` (retrying for up
to 10s to give the unit time to finish starting) to confirm the service is
live.

**Reboot survival confirmed live** (`sudo reboot` on the Pi, then polling
`GET /health` from the Mac every 5s): `journalctl -u porchlight-lamp.service
-b` shows the unit fails its first two start attempts right after boot with
`OSError: [Errno 99] Cannot assign requested address` — the static
`169.254.10.2` link-local address isn't up on `eth0` yet when
`ThreadingHTTPServer` tries to bind. `Restart=always`/`RestartSec=2` retries
until the interface is ready (3rd attempt succeeded, ~5s after the first),
exactly the recovery path `lamp.py`'s bind comment describes — no
`network-online.target` ordering was needed. End to end, `/health` answered
`{"ok": true, "state": "idle"}` again within ~60s of `sudo reboot`, with zero
manual steps on the Pi.

## Manual state-check runbook

Run these from the Mac once the service is deployed, to sanity-check every
state a judge might ask about:

```bash
curl http://169.254.10.2:8080/health

curl -X POST http://169.254.10.2:8080/state -H 'content-type: application/json' -d '{"state":"idle"}'
curl -X POST http://169.254.10.2:8080/state -H 'content-type: application/json' -d '{"state":"screening"}'
curl -X POST http://169.254.10.2:8080/state -H 'content-type: application/json' -d '{"state":"verifying"}'
curl -X POST http://169.254.10.2:8080/state -H 'content-type: application/json' -d '{"state":"verified","name":"Brenden"}'
curl -X POST http://169.254.10.2:8080/state -H 'content-type: application/json' -d '{"state":"scam"}'
curl -X POST http://169.254.10.2:8080/state -H 'content-type: application/json' -d '{"state":"ended"}'

curl http://169.254.10.2:8080/joystick

# Rotation (see "Auto-Orientation (IMU)" below for the full contract):
curl -X POST http://169.254.10.2:8080/state -H 'content-type: application/json' -d '{"rotation":90}'
curl -X POST http://169.254.10.2:8080/state -H 'content-type: application/json' -d '{"rotation":"auto"}'
curl http://169.254.10.2:8080/health   # now also reports "rotation", "auto_rotate", "rotation_source"
```

Expected visuals (eyeball the lamp — a test harness cannot see LEDs):
`idle` = slow amber breathe, `screening`/`verifying` = faster blue breathe,
`verified` = solid green with the name scrolling, `scam` = red/black flash,
`ended` = reverts to idle. `/joystick` returns `{"pressed": true|false,
"demoState": "<state>"}`. `pressed` is a one-shot flag set ONLY by the CENTER
button and cleared on every read — press the physical center button and poll
this endpoint to confirm `pressed` flips to `true` exactly once. `demoState`
mirrors whichever state the local up/down/left/right demo cycle (or the
bridge's last POST /state) last set; it is informational only and never
drives the family alert (03-FIX).

## Auto-Orientation (IMU)

The Sense HAT's accelerometer/gyro (LSM9DS1) is read to auto-rotate every
rendered frame (idle/screening/verified/scam, including the scrolling name)
so it's never upside down regardless of how the Pi+Sense HAT ends up mounted
in the lamp housing.

**Discovery (`_make_accelerometer()` in `lamp.py`), tried in order:**
1. **Kernel IIO sysfs** — `/sys/bus/iio/devices/iio:device*/in_accel_{x,y,z}_raw`
   (+ `in_accel_scale`), used if the kernel already exposes a driver for the
   chip. **Not expected to exist by default** on the standard `rpi-sense`
   overlay — that overlay only wires up the framebuffer + joystick, not the
   IMU as an IIO device.
2. **Raw I2C fallback** — talks to the LSM9DS1 directly on `/dev/i2c-1` via
   `fcntl.ioctl` (I2C_SLAVE), no `smbus2`/`RTIMU` package (stdlib only, no
   pip on this Pi). Tries address `0x6a` then `0x6b`, confirms via
   `WHO_AM_I` (register `0x0F` must read `0x68`), enables the accelerometer
   (`CTRL_REG6_XL = 0x60`, 119 Hz / ±2g), then reads 6 bytes from
   `OUT_X_L_XL` (register `0x28 | 0x80` for auto-increment) as three
   little-endian `int16`s.
3. If **neither path** finds the chip, `orientation_loop` logs a warning to
   stderr and exits — `auto_rotate` stays `true` in `/health` but `rotation`
   just never changes from whatever it was last set to (`DEFAULT_ROTATION`,
   or whatever `PORCHLIGHT_ROTATION` pinned it to).

**Confirmed live on the real Pi (03-IMU-FIX, 2026-09-22):** the raw I2C
fallback is the path in use — `/sys/bus/iio/devices/` doesn't exist on this
Pi (the `rpi-sense` overlay doesn't expose the IMU via IIO, as expected), and
`journalctl -u porchlight-lamp.service` logs `accelerometer via raw I2C at
0x6a` on every start. To re-check after any future kernel/overlay change:
```bash
ssh pi@169.254.10.2 'ls /sys/bus/iio/devices/ 2>&1; cat /sys/bus/iio/devices/iio:device*/name 2>&1'
```
Empty/error output means the I2C fallback path is the one in use — expected
per the discovery order above.

### Rotation contract

- **`POST /state`** accepts an additive `"rotation"` field alongside (or
  instead of) `"state"`:
  - `{"rotation": 0 | 90 | 180 | 270}` — pins rotation to that value and
    disables auto-rotate.
  - `{"rotation": "auto"}` — re-enables IMU-driven auto-rotate.
  - `"state"` is still required for a state-change POST (unchanged bridge
    contract); a rotation-only POST (no `"state"` key) is also accepted.
- **`GET /health`** now reports `rotation` (the currently-applied value) and
  `auto_rotate` (whether the IMU or a pinned override currently owns it):
  `{"ok": true, "state": "idle", "rotation": 0, "auto_rotate": true}`.
- **`PORCHLIGHT_ROTATION`** env var (e.g. in `porchlight-lamp.service`'s
  `[Service]` block: `Environment=PORCHLIGHT_ROTATION=90`) pins rotation at
  startup, equivalent to an early `POST /state {"rotation": 90}` — use this
  if auto-rotate ever picks the wrong orientation for how the lamp ends up
  mounted and there's no time to debug the IMU mapping before the demo.

### Orientation mapping — PHYSICALLY CONFIRMED (03-IMU-FIX, 2026-09-22)

`orientation_loop` samples gravity every 2 seconds. When the board is lying
flat (Z-axis dominant), rotation is left unchanged (no way to infer "up" from
gravity alone when the display is horizontal — see "Joystick Orientation
Calibration" below for how to handle that case). When tilted onto an edge
(X or Y dominant), the mapping is:

| Dominant axis | Sign | Physical tilt | Rotation | Constant in `lamp.py` |
|---|---|---|---|---|
| Y | positive | board standing on a SHORT edge, ethernet port edge down | 0° | `ROTATION_FOR_POSITIVE_Y` |
| Y | negative | board standing on a SHORT edge, ethernet port edge up | 180° | `ROTATION_FOR_NEGATIVE_Y` |
| X | positive | board standing on a LONG edge, ethernet port edge to the right | 270° | `ROTATION_FOR_POSITIVE_X` |
| X | negative | board standing on a LONG edge, ethernet port edge to the left | 90° | `ROTATION_FOR_NEGATIVE_X` |

**Physically confirmed against the real Pi.** The Y-axis (SHORT-edge,
ethernet up/down) pair was already correct. The X-axis (LONG-edge, ethernet
left/right) pair was 180° wrong in both directions — upside down at both
tilts — and was fixed by swapping `ROTATION_FOR_POSITIVE_X` /
`ROTATION_FOR_NEGATIVE_X` (equivalent to adding 180° to each). If a future
remount ever needs re-calibrating, the procedure is the same:

1. Deploy this build (`bash pi/deploy.sh`) and set a state that's easy to
   glance at, e.g. `curl -X POST http://169.254.10.2:8080/state -d '{"state":"verified","name":"Brenden"}'`.
2. Watch `journalctl -u porchlight-lamp.service -f` on the Pi (or over SSH)
   while tilting the board onto each of its four edges in turn. Each tilt
   should log a line like:
   `lamp.py: auto-rotate -> 90 (x=0.87g y=0.05g z=0.12g)`
3. For each tilt, confirm the scrolling "BRENDEN" text reads right-side-up
   from that viewing angle. If any orientation is upside down or sideways
   when it should read correctly, swap the corresponding constant pair
   (`ROTATION_FOR_POSITIVE_X`/`ROTATION_FOR_NEGATIVE_X` or the Y pair,
   depending on which tilt was wrong) and redeploy.
4. If the IMU mapping can't be nailed down before the demo, use
   `PORCHLIGHT_ROTATION` to pin whatever rotation matches the lamp's actual
   fixed mounting instead of relying on auto-rotate.

## Joystick Orientation Calibration (flat mounting)

When the board is lying flat, gravity alone can't tell auto-rotate which way
is "up" — `_rotation_from_gravity` returns `None` (Z-dominant) and the last
rotation is kept. A **long press (≥ `LONG_PRESS_SEC` = 0.8s) on any joystick
direction** lets a human resolve this manually: point the joystick toward
whichever direction is "toward me / the table edge nearest me", press and
hold that direction for at least 0.8s, and the lamp pins rotation so that
direction becomes the bottom of the rendered text.

**Derivation.** The joystick's four direction switches are wired to fixed
physical positions on the same PCB as the LED matrix, so pressing a given
direction always corresponds to the same *native* (pre-`_rotate_frame`) edge
of the 8x8 grid, regardless of how the whole assembly is mounted in the
housing (mounting rotation applies equally to both). Given
`_rotate_frame`'s row-major clockwise rotation math, the rotation that puts a
given native edge at the *bottom* of the output frame is:

| Direction pressed | Native edge | Rotation | Constant in `lamp.py` |
|---|---|---|---|
| Down | bottom (row 7) | 0° | `ROTATION_FOR_JOYSTICK_DOWN` |
| Right | right (col 7) | 90° | `ROTATION_FOR_JOYSTICK_RIGHT` |
| Up | top (row 0) | 180° | `ROTATION_FOR_JOYSTICK_UP` |
| Left | left (col 0) | 270° | `ROTATION_FOR_JOYSTICK_LEFT` |

This is a **best-effort default derived from the grid math**, not yet
physically confirmed for every one of the four directions on the real
mounted board (only the "flat, joystick nub bottom-right, rotation=180"
data point was confirmed this session). **A human should confirm each
direction** — see "Manual verification" below — and if any direction is
wrong, swap the matching constant the same way the IMU constants are swapped.

**Behavior:**
- Long press a direction: pins `rotation` to the matching constant, sets
  `auto_rotate` to `false`, sets `rotation_source` to `"joystick"`, persists
  `{"rotation": N}` to `/home/pi/porchlight/rotation.json` (atomic write —
  survives a reboot), and flashes an arrow on the matrix for 1s
  (`CONFIRMATION_FLASH_SEC`) — the arrow always points at the render's
  bottom after rotation, confirming the calibration visually.
- Long press center: clears the persisted file, sets `auto_rotate` back to
  `true`, sets `rotation_source` to `"auto"`, and flashes a static "A" for 1s.
- Short presses (< 0.8s) are **unaffected** — center still sets the one-shot
  `joystick_pressed` alert flag, up/down/left/right still drive the local
  demo-mode cycle (both classified only at *release*, once the press
  duration is known).
- On startup, `main()` loads (in priority order): `PORCHLIGHT_ROTATION` env
  var, then a persisted joystick rotation from disk, then falls back to
  `DEFAULT_ROTATION` (`180`, confirmed correct for this board flat) with
  `auto_rotate=true`. A persisted joystick rotation wins over IMU auto-rotate
  until the next center long-press, since it sets `auto_rotate=false`.
- `GET /health` reports `rotation_source`: `"auto"` (IMU-driven) |
  `"joystick"` (long-press, persisted) | `"api"` (`POST /state` pin) |
  `"env"` (`PORCHLIGHT_ROTATION`).

**Manual verification (human — cannot be automated, no way to see the LEDs
or feel a physical press from a script):**
1. Lay the board flat on the table.
2. Long-press (hold ≥ 1s to be safe) the joystick direction that faces you.
3. Watch for the 1s arrow flash — it should point toward you (i.e. toward
   the bottom of the matrix as you're looking at it).
4. Confirm `curl http://169.254.10.2:8080/health` now shows
   `"auto_rotate": false, "rotation_source": "joystick"` and a `rotation`
   value.
5. Set `{"state":"verified","name":"Brenden"}` and confirm "BRENDEN" scrolls
   right-side-up toward you.
6. Long-press the center button; confirm the "A" flash, and `/health` shows
   `"auto_rotate": true, "rotation_source": "auto"` again.
7. `sudo systemctl restart porchlight-lamp.service` while the joystick
   rotation is still pinned (undo step 6 first) and confirm the pinned
   rotation survives the restart (persisted-to-disk load on startup).

## Font

The scrolling name (`verified` state) now uses a 5-column x 7-row uppercase
font (`_GLYPHS` in `lamp.py`) covering A-Z, 0-9, space, and hyphen — wider
and taller than the original 3x3-cell table, and specifically redrawn so
N/M/W are visually distinct (the old font's worst legibility failure at
demo viewing distance). Scroll speed is 90ms/column (`SCROLL_STEP_SEC`).

## Watchdog vs. bridge heartbeat

The Pi's `watchdog_loop` reverts `lamp/current`'s render target to `idle` if
60 seconds pass with no `POST /state` (this is the "bridge died" safety net,
unchanged). `bridge/index.mjs` now re-POSTs the last known state every 20
seconds (in addition to posting on every real Firestore change), so the
watchdog only ever fires when the bridge process itself is gone — not merely
because `lamp/current` hasn't changed in a while (03-FIX).
