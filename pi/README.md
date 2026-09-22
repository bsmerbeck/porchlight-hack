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
```

Expected visuals (eyeball the lamp — a test harness cannot see LEDs):
`idle` = slow amber breathe, `screening`/`verifying` = faster blue breathe,
`verified` = solid green with the name scrolling, `scam` = red/black flash,
`ended` = reverts to idle. `/joystick` returns `{"pressed": true|false}` and
clears the flag on every read — press the physical joystick and poll this
endpoint to confirm `pressed` flips to `true` once.
