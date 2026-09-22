#!/usr/bin/env python3
"""Porchlight lamp service — Raspberry Pi Sense HAT ambient status light.

Stdlib-only HTTP server (ThreadingHTTPServer) that renders an 8x8 LED matrix
via the raw framebuffer (/dev/fb0, RGB565) based on POSTed call state, reads
the Sense HAT joystick via raw evdev, and reverts to idle if the bridge goes
silent for 60 seconds.

No internet, no pip install — the Pi has neither.

Bind address: the direct-ethernet-cable static link-local address
(169.254.10.2:8080), never 0.0.0.0 (ASVS V4 — only the trusted cable segment
can reach this service, by construction; T-03-03 in 03-01-PLAN.md's threat
model).
"""

import glob
import json
import math
import os
import struct
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# fcntl is POSIX-only (unavailable on Windows) but this service only ever runs on
# the Pi -- imported unconditionally like the rest of the stdlib-only surface.
import fcntl

HOST = "169.254.10.2"
PORT = 8080

VALID_STATES = {"idle", "screening", "verifying", "verified", "scam", "ended"}
WATCHDOG_TIMEOUT_SEC = 60
BRIGHTNESS = 0.4  # global cap applied uniformly to every generator's output

AMBER = (255, 170, 0)
BLUE = (0, 110, 255)
GREEN = (0, 200, 60)
RED = (255, 0, 0)
WHITE = (255, 255, 255)

# --- Framebuffer discovery (Pattern 1) --------------------------------------


def find_fb_device():
    """Never hardcode /dev/fb0 — discover the Sense HAT matrix by name.

    An HDMI cable or other display could otherwise claim fb0.
    """
    for sysdir in sorted(glob.glob("/sys/class/graphics/fb*")):
        name_path = os.path.join(sysdir, "name")
        try:
            with open(name_path) as f:
                name = f.read().strip().lower()
        except OSError:
            continue
        if "sense" in name:
            dev = "/dev/" + os.path.basename(sysdir)
            if os.path.exists(dev):
                return dev
    raise RuntimeError("Sense HAT framebuffer not found — is the HAT seated?")


# --- Matrix (Pattern 2: RGB565 pack + write) --------------------------------


class Matrix:
    """8x8 RGB565 framebuffer, 128-byte buffer, row-major, top-left origin."""

    def __init__(self, dev_path):
        self.fd = os.open(dev_path, os.O_RDWR)

    def draw(self, pixels):
        """pixels: list of 64 (r, g, b) tuples, 0-255 each, row-major."""
        buf = bytearray(128)
        for i, (r, g, b) in enumerate(pixels):
            packed = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
            struct.pack_into("<H", buf, i * 2, packed)
        os.lseek(self.fd, 0, os.SEEK_SET)
        os.write(self.fd, bytes(buf))


def _apply_brightness(frame, factor=BRIGHTNESS):
    return [tuple(int(c * factor) for c in pixel) for pixel in frame]


# --- Rotation (auto-orientation via IMU, Task: never-upside-down scrolling) -


def _rotate_frame(frame, degrees):
    """Rotates a 64-pixel row-major 8x8 frame clockwise by 0/90/180/270 degrees.

    Applied uniformly to every frame_for_state() output right before the RGB565
    write, so idle/screening/scam/verified all rotate identically -- one place,
    not a per-animation special case.
    """
    if degrees == 0:
        return frame
    size = 8
    grid = [frame[r * size : (r + 1) * size] for r in range(size)]
    rotated = [[None] * size for _ in range(size)]
    if degrees == 90:
        for r in range(size):
            for c in range(size):
                rotated[r][c] = grid[size - 1 - c][r]
    elif degrees == 180:
        for r in range(size):
            for c in range(size):
                rotated[r][c] = grid[size - 1 - r][size - 1 - c]
    elif degrees == 270:
        for r in range(size):
            for c in range(size):
                rotated[r][c] = grid[c][size - 1 - r]
    else:
        raise ValueError(f"invalid rotation degrees: {degrees!r} (expected 0/90/180/270)")
    return [pixel for row in rotated for pixel in row]


# --- Accelerometer / auto-orientation ---------------------------------------
#
# Two discovery paths, tried in order (README.md "Auto-Orientation (IMU)" has
# the full writeup): (1) the kernel IIO sysfs interface, if a driver already
# exposes the LSM9DS1 as an industrial-I/O device; (2) raw I2C via fcntl ioctl
# if not -- the rpi-sense overlay only wires up the framebuffer + joystick by
# default, so the IMU is commonly only reachable over I2C directly, per
# RESEARCH.md's stdlib-only constraint (no smbus2/RTIMU pip installs).

_IIO_GLOB = "/sys/bus/iio/devices/iio:device*"


class _IIOAccel:
    """Reads gravity via kernel IIO sysfs (in_accel_*_raw / in_accel_scale)."""

    def __init__(self, device_dir):
        self.device_dir = device_dir

    def _read(self, fname):
        with open(os.path.join(self.device_dir, fname)) as f:
            return float(f.read().strip())

    def read(self):
        try:
            scale = self._read("in_accel_scale")
        except OSError:
            scale = 1.0
        x = self._read("in_accel_x_raw") * scale
        y = self._read("in_accel_y_raw") * scale
        z = self._read("in_accel_z_raw") * scale
        return x, y, z


def _find_iio_accel():
    candidates = sorted(glob.glob(_IIO_GLOB))
    for device_dir in candidates:
        if not os.path.exists(os.path.join(device_dir, "in_accel_x_raw")):
            continue
        name_path = os.path.join(device_dir, "name")
        try:
            with open(name_path) as f:
                name = f.read().strip().lower()
        except OSError:
            name = ""
        # Match on the raw-channel files existing at all (already filtered above);
        # the name check is just diagnostic detail for the discovery-path log line.
        return _IIOAccel(device_dir), name
    return None, None


# LSM9DS1 accel/gyro register map, ST datasheet (DocID026899) Table 21 (register
# map) and Table 3 (linear-acceleration sensitivity) -- the same chip the Sense
# HAT's bundled `sense_hat`/RTIMU stack talks to, addressed directly here since
# the Pi has neither internet nor pip to install RTIMU (RESEARCH.md).
I2C_SLAVE = 0x0703  # ioctl request code, <linux/i2c-dev.h>
_LSM9DS1_ADDR_CANDIDATES = (0x6A, 0x6B)
_WHO_AM_I_REG = 0x0F
_WHO_AM_I_VAL = 0x68
_CTRL_REG6_XL = 0x20
_CTRL_REG6_XL_119HZ_2G = 0x60  # ODR=119Hz, +/-2g full scale
_OUT_X_L_XL = 0x28
_ACCEL_SCALE_2G = 0.000061  # g per LSB at +/-2g (datasheet Table 3)


class _I2CAccel:
    """Reads gravity from the LSM9DS1 directly over /dev/i2c-1 (stdlib fcntl.ioctl,
    no smbus2/RTIMU package -- the Pi cannot pip install anything, RESEARCH.md)."""

    def __init__(self, bus_path="/dev/i2c-1"):
        self.fd = os.open(bus_path, os.O_RDWR)
        self.addr = None
        for addr in _LSM9DS1_ADDR_CANDIDATES:
            fcntl.ioctl(self.fd, I2C_SLAVE, addr)
            try:
                os.write(self.fd, bytes([_WHO_AM_I_REG]))
                who = os.read(self.fd, 1)[0]
            except OSError:
                continue
            if who == _WHO_AM_I_VAL:
                self.addr = addr
                break
        if self.addr is None:
            os.close(self.fd)
            raise RuntimeError(
                "LSM9DS1 WHO_AM_I mismatch/no-ack on /dev/i2c-1 (tried 0x6a, 0x6b)"
            )
        fcntl.ioctl(self.fd, I2C_SLAVE, self.addr)
        os.write(self.fd, bytes([_CTRL_REG6_XL, _CTRL_REG6_XL_119HZ_2G]))

    def read(self):
        os.write(self.fd, bytes([_OUT_X_L_XL | 0x80]))  # 0x80 = auto-increment bit
        data = os.read(self.fd, 6)
        x_raw, y_raw, z_raw = struct.unpack("<hhh", data)
        return (
            x_raw * _ACCEL_SCALE_2G,
            y_raw * _ACCEL_SCALE_2G,
            z_raw * _ACCEL_SCALE_2G,
        )


def _make_accelerometer():
    """IIO sysfs first (no ioctl needed if the kernel already exposes it), raw
    I2C only as a fallback. Returns None (auto-rotate stays disabled, rotation
    holds at its configured/default value) if neither path finds the chip."""
    iio, iio_name = _find_iio_accel()
    if iio is not None:
        print(f"lamp.py: accelerometer via kernel IIO sysfs ({iio_name!r})", file=sys.stderr)
        return iio
    try:
        i2c = _I2CAccel()
        print(f"lamp.py: accelerometer via raw I2C at 0x{i2c.addr:02x}", file=sys.stderr)
        return i2c
    except (RuntimeError, OSError) as exc:
        print(
            f"lamp.py: no accelerometer found via IIO or I2C ({exc}) -- "
            "auto-rotate disabled, rotation stays at its configured/default value.",
            file=sys.stderr,
        )
        return None


# Empirically-determined axis -> rotation mapping (README.md "Orientation
# Calibration" has the tilt-test procedure). If a differently-mounted board
# ends up needing a different mapping, these four constants are the ONLY
# numbers that encode "which physical tilt maps to which rotation" -- change
# these, not the detection logic in _rotation_from_gravity.
ROTATION_FOR_POSITIVE_Y = 0
ROTATION_FOR_NEGATIVE_Y = 180
ROTATION_FOR_POSITIVE_X = 90
ROTATION_FOR_NEGATIVE_X = 270

ORIENTATION_SAMPLE_INTERVAL_SEC = 2.0


def _rotation_from_gravity(x, y, z):
    """Dominant-axis gravity -> rotation. Returns None when the board is lying
    flat (Z dominant) so the caller keeps the last rotation, per spec."""
    ax, ay, az = abs(x), abs(y), abs(z)
    if az >= ax and az >= ay:
        return None
    if ay >= ax:
        return ROTATION_FOR_POSITIVE_Y if y > 0 else ROTATION_FOR_NEGATIVE_Y
    return ROTATION_FOR_POSITIVE_X if x > 0 else ROTATION_FOR_NEGATIVE_X


def _rotation_from_env():
    raw = os.environ.get("PORCHLIGHT_ROTATION")
    if raw is None:
        return None
    try:
        val = int(raw)
    except ValueError:
        print(
            f"lamp.py: ignoring PORCHLIGHT_ROTATION={raw!r} (not an integer)",
            file=sys.stderr,
        )
        return None
    if val not in (0, 90, 180, 270):
        print(
            f"lamp.py: ignoring PORCHLIGHT_ROTATION={raw!r} (must be 0/90/180/270)",
            file=sys.stderr,
        )
        return None
    return val


def orientation_loop():
    """Daemon thread: samples gravity every ORIENTATION_SAMPLE_INTERVAL_SEC and
    updates _state["rotation"] whenever auto_rotate is on and the board isn't
    lying flat. Exits quietly (leaving rotation at whatever it was pinned to)
    if no accelerometer is found."""
    accel = _make_accelerometer()
    if accel is None:
        return
    while True:
        try:
            x, y, z = accel.read()
        except OSError as exc:
            print(f"lamp.py: accelerometer read failed ({exc}); keeping last rotation", file=sys.stderr)
            time.sleep(ORIENTATION_SAMPLE_INTERVAL_SEC)
            continue
        new_rotation = _rotation_from_gravity(x, y, z)
        if new_rotation is not None:
            with _state_lock:
                if _state["auto_rotate"] and _state["rotation"] != new_rotation:
                    _state["rotation"] = new_rotation
                    print(
                        f"lamp.py: auto-rotate -> {new_rotation} "
                        f"(x={x:.2f}g y={y:.2f}g z={z:.2f}g)",
                        file=sys.stderr,
                    )
        time.sleep(ORIENTATION_SAMPLE_INTERVAL_SEC)


# --- Shared render/joystick state -------------------------------------------

_state_lock = threading.Lock()
_state = {
    "target": "idle",
    "name": None,
    "joystick_pressed": False,
    # rotation/auto_rotate: applied to every frame before it's written to the
    # framebuffer, so scrolling text is never upside down regardless of how the
    # Pi+Sense HAT is physically mounted. auto_rotate=True means orientation_loop
    # (IMU-driven) owns `rotation`; a POST /state {"rotation": N} or
    # PORCHLIGHT_ROTATION env var pins it and sets auto_rotate=False until a
    # POST /state {"rotation": "auto"} re-enables tracking.
    "rotation": 0,
    "auto_rotate": True,
}
_last_post_at = time.time()


# --- Frame generators (breathe/pulse/scroll) --------------------------------


def _breathe(color, t, period, floor=0.25):
    b = floor + (1 - floor) * (0.5 + 0.5 * math.sin(2 * math.pi * t / period))
    return [tuple(int(c * b) for c in color)] * 64


def idle_frame(t):
    return _breathe(AMBER, t, 4.0)


def screening_frame(t):
    return _breathe(BLUE, t, 1.2)


def scam_frame(t):
    return [RED if int(t / 0.3) % 2 == 0 else (0, 0, 0)] * 64


# 5x7 uppercase glyph table (A-Z, 0-9, space, hyphen) -- a deliberate scope-cut vs.
# a general bitmap-font engine (RESEARCH.md Don't Hand-Roll), but wide/tall enough
# (vs. the original 3x5) to read cleanly at ~3m and keep N/M/W visually distinct.
# Each entry is 7 rows of a 5-column-wide string; "#" = lit, "." = blank.
GLYPH_WIDTH = 5
GLYPH_HEIGHT = 7

_GLYPHS = {
    " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
    "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
    "A": ["..#..", ".#.#.", "#...#", "#...#", "#####", "#...#", "#...#"],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "C": [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
    "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    "G": [".####", "#....", "#....", "#.###", "#...#", "#...#", ".####"],
    "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    "J": ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    # M and N and W are deliberately distinct shapes -- the 3x5 font's biggest
    # legibility failure was these three collapsing into near-identical blobs.
    "M": ["#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"],
    "N": ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    "W": ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
    "X": ["#...#", ".#.#.", "..#..", "..#..", "..#..", ".#.#.", "#...#"],
    "Y": ["#...#", ".#.#.", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "Z": ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", "#####"],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": ["####.", "....#", "....#", "..##.", "....#", "....#", "####."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "#....", "####.", "....#", "....#", "####."],
    "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
}

SCROLL_STEP_SEC = 0.09  # ~90ms per column -- readable at the wider 5px glyph width


def _glyph_columns(ch):
    rows = _GLYPHS.get(ch, _GLYPHS[" "])
    return [
        [rows[row][col] == "#" for row in range(GLYPH_HEIGHT)]
        for col in range(GLYPH_WIDTH)
    ]


def _build_scroll_columns(name):
    text = (name or "FAMILY").upper()
    columns = []
    for ch in text:
        columns.extend(_glyph_columns(ch))
        columns.append([False] * GLYPH_HEIGHT)  # 1-column gap between letters
    columns.extend([[False] * GLYPH_HEIGHT] * 8)  # blank run before the loop repeats
    return columns or [[False] * GLYPH_HEIGHT]


# --- Joystick demo mode (Task 3, 05-01-PLAN.md) -----------------------------
#
# The fixed local cycle order the joystick's up/down/left/right walk through
# (wrapping at both ends), and the demo name shown while `verified` is the
# active state -- purely local, no HTTP call out, no Firestore, no bridge
# involvement, so the lamp stays an interactive attraction on its own even
# with no call in progress.
DEMO_CYCLE_STATES = ["idle", "screening", "verifying", "verified", "scam"]
DEMO_CYCLE_NAME = "Brenden"
SELFTEST_HOLD_SEC = 2.0


def verified_frame(t, name):
    cols = _build_scroll_columns(name)
    width = len(cols)
    offset = int(t / SCROLL_STEP_SEC) % width
    frame = [GREEN] * 64
    # Glyph rows occupy display rows 0-6 (top-aligned, row 7 stays solid green)
    # so the scrolling text is visible in every row band, including row 0 —
    # kept deliberately top-aligned rather than vertically centered so any 8x8
    # slice always carries live scroll data.
    for display_col in range(8):
        bits = cols[(offset + display_col) % width]
        for row, lit in enumerate(bits):
            if lit:
                frame[row * 8 + display_col] = WHITE
    return frame


def frame_for_state(target, name, t):
    """The single state->frame dispatch, used identically by the continuous render
    loop (whether driven by a POST /state from the bridge or a local joystick nudge)
    and by --selftest -- one source of truth so a bridge-driven state and a
    joystick-driven state always render the same way."""
    if target == "idle":
        return idle_frame(t)
    if target in ("screening", "verifying"):
        return screening_frame(t)
    if target == "scam":
        return scam_frame(t)
    if target == "verified":
        return verified_frame(t, name)
    return idle_frame(t)


# --- HTTP handler -------------------------------------------------------------


class LampHandler(BaseHTTPRequestHandler):
    # Quiet default stderr access logging — keep it minimal for a headless demo box.
    def log_message(self, fmt, *args):
        pass

    def _json_response(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            with _state_lock:
                current = _state["target"]
                rotation = _state["rotation"]
                auto_rotate = _state["auto_rotate"]
            self._json_response(
                200,
                {
                    "ok": True,
                    "state": current,
                    "rotation": rotation,
                    "auto_rotate": auto_rotate,
                },
            )
            return
        if self.path == "/joystick":
            with _state_lock:
                pressed = _state["joystick_pressed"]
                _state["joystick_pressed"] = False
                current_state = _state["target"]
            # `pressed` is a one-shot flag set ONLY by a CENTER-button press
            # (joystick_loop's KEY_ENTER branch) and cleared on every read here --
            # direction presses (up/down/left/right) drive the local demo-mode cycle
            # via `_cycle_joystick_state` and never touch this flag (03-FIX). The
            # bridge must treat `pressed === true` as the sole family-alert trigger.
            #
            # `demoState` mirrors whatever the joystick's local demo-mode cycling (or
            # a bridge POST /state) last set -- purely informational, additive field,
            # so the bridge can log it if desired (Task 3 / 03-FIX). Never used to
            # decide whether to raise an alert.
            self._json_response(200, {"pressed": pressed, "demoState": current_state})
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path != "/state":
            self.send_response(404)
            self.end_headers()
            return

        global _last_post_at

        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length > 0 else b""
            payload = json.loads(raw)
            state = payload.get("state")
            name = payload.get("name")
            rotation = payload.get("rotation")
        except (ValueError, json.JSONDecodeError):
            self.send_response(400)
            self.end_headers()
            return

        # `state` is required for a state-change POST (the bridge's normal path,
        # unchanged); `rotation` is an optional additive field so a client can
        # pin/unpin orientation with or without also changing state in the same
        # call. At least one of the two must be present.
        if state is None and rotation is None:
            self.send_response(400)
            self.end_headers()
            return

        if rotation is not None and rotation != "auto" and rotation not in (0, 90, 180, 270):
            self.send_response(400)
            self.end_headers()
            return

        if state is not None:
            if state not in VALID_STATES:
                self.send_response(400)
                self.end_headers()
                return
            if state == "ended":
                state = "idle"

        with _state_lock:
            if state is not None:
                _state["target"] = state
                if name is not None:
                    _state["name"] = name
                _last_post_at = time.time()
            if rotation == "auto":
                _state["auto_rotate"] = True
            elif rotation is not None:
                _state["rotation"] = rotation
                _state["auto_rotate"] = False

        self.send_response(200)
        self.end_headers()


# --- Render loop (daemon thread; never runs inline in a request handler) ----


def render_loop(matrix):
    start = time.time()
    while True:
        with _state_lock:
            target = _state["target"]
            name = _state["name"]
            rotation = _state["rotation"]
        t = time.time() - start
        # Same frame_for_state() dispatch a joystick nudge and --selftest both use --
        # one source of truth for "what does state X look like."
        frame = frame_for_state(target, name, t)
        frame = _rotate_frame(frame, rotation)
        matrix.draw(_apply_brightness(frame))
        time.sleep(1 / 15)


# --- Watchdog (daemon thread) — reverts to idle after 60s of POST silence --


def watchdog_loop():
    while True:
        time.sleep(1)
        with _state_lock:
            if time.time() - _last_post_at > WATCHDOG_TIMEOUT_SEC:
                _state["target"] = "idle"


# --- Joystick reader (Pattern 3: raw evdev, no sense_hat / python-evdev) ---

EVENT_FMT = "llHHi"
EVENT_SIZE = struct.calcsize(EVENT_FMT)
EV_KEY = 1
KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_ENTER = 103, 108, 105, 106, 28


def find_joystick_device():
    for name_path in glob.glob("/sys/class/input/event*/device/name"):
        try:
            with open(name_path) as f:
                name = f.read().strip().lower()
        except OSError:
            continue
        if "sense hat joystick" in name:
            event_num = name_path.split("/")[4]
            return f"/dev/input/{event_num}"
    raise RuntimeError("Sense HAT joystick input device not found")


def _cycle_joystick_state(direction):
    """Advances the joystick demo-mode cycle forward (direction=1) or backward
    (direction=-1) through DEMO_CYCLE_STATES, wrapping at both ends, purely locally --
    updates the SAME shared `_state` the HTTP /state handler drives, so render_loop's
    frame_for_state() dispatch renders a joystick nudge exactly like a bridge-driven
    state change. Returns the new state string."""
    with _state_lock:
        current = _state["target"]
        try:
            idx = DEMO_CYCLE_STATES.index(current)
        except ValueError:
            idx = 0
        new_state = DEMO_CYCLE_STATES[(idx + direction) % len(DEMO_CYCLE_STATES)]
        _state["target"] = new_state
        _state["name"] = DEMO_CYCLE_NAME if new_state == "verified" else None
    return new_state


def joystick_loop(dev_path):
    # Center press (KEY_ENTER) keeps its pre-existing behavior UNTOUCHED -- it still
    # only sets joystick_pressed, which the bridge polls via GET /joystick to raise
    # the family alert. Up/down/left/right are repurposed here (Task 3) to drive the
    # local demo-mode cycle instead of the alert flag.
    global _last_post_at
    with open(dev_path, "rb") as f:
        while True:
            data = f.read(EVENT_SIZE)
            if len(data) < EVENT_SIZE:
                continue
            _, _, ev_type, code, value = struct.unpack(EVENT_FMT, data)
            if ev_type != EV_KEY or value != 1:
                continue
            if code == KEY_ENTER:
                with _state_lock:
                    _state["joystick_pressed"] = True
            elif code in (KEY_UP, KEY_RIGHT):
                _cycle_joystick_state(1)
                _last_post_at = time.time()
            elif code in (KEY_DOWN, KEY_LEFT):
                _cycle_joystick_state(-1)
                _last_post_at = time.time()


def run_selftest():
    """--selftest: walks DEMO_CYCLE_STATES in order via the SAME frame_for_state()
    dispatch render_loop uses, holding each for SELFTEST_HOLD_SEC, then exits 0
    without starting the HTTP server. Applies PORCHLIGHT_ROTATION if set (no
    IMU sampling here -- selftest never starts orientation_loop) so a pinned
    rotation can be sanity-checked without deploying the full service."""
    fb_path = find_fb_device()
    matrix = Matrix(fb_path)
    rotation = _rotation_from_env() or 0
    start = time.time()
    for state in DEMO_CYCLE_STATES:
        name = DEMO_CYCLE_NAME if state == "verified" else None
        hold_until = time.time() + SELFTEST_HOLD_SEC
        while time.time() < hold_until:
            frame = frame_for_state(state, name, time.time() - start)
            frame = _rotate_frame(frame, rotation)
            matrix.draw(_apply_brightness(frame))
            time.sleep(1 / 15)
    print(f"lamp.py --selftest: cycled {len(DEMO_CYCLE_STATES)} states successfully")
    return 0


def main():
    if "--selftest" in sys.argv:
        sys.exit(run_selftest())

    env_rotation = _rotation_from_env()
    if env_rotation is not None:
        with _state_lock:
            _state["rotation"] = env_rotation
            _state["auto_rotate"] = False
        print(f"lamp.py: PORCHLIGHT_ROTATION pinned rotation to {env_rotation}", file=sys.stderr)

    fb_path = find_fb_device()
    matrix = Matrix(fb_path)

    threading.Thread(target=render_loop, args=(matrix,), daemon=True).start()
    threading.Thread(target=watchdog_loop, daemon=True).start()
    threading.Thread(target=orientation_loop, daemon=True).start()

    if EVENT_SIZE != 24:
        print(
            f"lamp.py: evdev struct size is {EVENT_SIZE}, expected 24 "
            "(32-bit userland?) — skipping joystick thread, HTTP/render "
            "path is unaffected.",
            file=sys.stderr,
        )
    else:
        try:
            joystick_dev = find_joystick_device()
            threading.Thread(
                target=joystick_loop, args=(joystick_dev,), daemon=True
            ).start()
        except RuntimeError as exc:
            print(
                f"lamp.py: {exc} — skipping joystick thread, HTTP/render "
                "path is unaffected.",
                file=sys.stderr,
            )

    # If the interface isn't up yet at boot, this bind raises — systemd's
    # Restart=always/RestartSec=2 (see porchlight-lamp.service) is the
    # intended recovery, not network-online.target complexity.
    server = ThreadingHTTPServer((HOST, PORT), LampHandler)
    server.serve_forever()


if __name__ == "__main__":
    main()
