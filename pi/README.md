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
curl http://169.254.10.2:8080/health   # now also reports "rotation" and "auto_rotate"
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
   just never changes from whatever it was last set to (default `0`, or
   whatever `PORCHLIGHT_ROTATION` pinned it to).

**Which path is actually live on this Pi is not yet confirmed** — this was
implemented and unit-tested without physical access to the device this
session (the Pi was unreachable over the ethernet cable at implementation
time; see `03-IMU-SUMMARY.md`). Run this once the Pi is connected to find
out:
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

### Orientation mapping — NEEDS PHYSICAL CONFIRMATION

`orientation_loop` samples gravity every 2 seconds. When the board is lying
flat (Z-axis dominant), rotation is left unchanged (no way to infer "up" from
gravity alone when the display is horizontal). When tilted onto an edge
(X or Y dominant), the mapping is:

| Dominant axis | Sign | Rotation | Constant in `lamp.py` |
|---|---|---|---|
| Y | positive | 0° | `ROTATION_FOR_POSITIVE_Y` |
| Y | negative | 180° | `ROTATION_FOR_NEGATIVE_Y` |
| X | positive | 90° | `ROTATION_FOR_POSITIVE_X` |
| X | negative | 270° | `ROTATION_FOR_NEGATIVE_X` |

This mapping is a **best-effort default** written without a physical tilt
test against the real hardware (the Pi was unreachable this session — see
`03-IMU-SUMMARY.md`). **A human needs to confirm it** once the Pi is back on
the bench:

1. Deploy this build (`bash pi/deploy.sh`) and set a state that's easy to
   glance at, e.g. `curl -X POST http://169.254.10.2:8080/state -d '{"state":"verified","name":"Brenden"}'`.
2. Watch `journalctl -u porchlight-lamp.service -f` on the Pi (or over SSH)
   while tilting the board onto each of its four edges in turn. Each tilt
   should log a line like:
   `lamp.py: auto-rotate -> 90 (x=0.87g y=0.05g z=0.12g)`
3. For each tilt, confirm the scrolling "BRENDEN" text reads right-side-up
   from that viewing angle. If any orientation is upside down or sideways
   when it should read correctly, swap the corresponding constant (e.g. if
   tilting the board so the joystick ends up on the right produces upside
   down text at `rotation=90`, that physical tilt actually needs `270` —
   swap `ROTATION_FOR_POSITIVE_X` and `ROTATION_FOR_NEGATIVE_X`, or the Y
   pair, depending on which tilt was wrong) and redeploy.
4. If the IMU mapping can't be nailed down before the demo, use
   `PORCHLIGHT_ROTATION` to pin whatever rotation matches the lamp's actual
   fixed mounting instead of relying on auto-rotate.

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
