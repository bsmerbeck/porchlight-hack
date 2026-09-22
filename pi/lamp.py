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


# --- Shared render/joystick state -------------------------------------------

_state_lock = threading.Lock()
_state = {"target": "idle", "name": None, "joystick_pressed": False}
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


# 3x5 uppercase glyph table (A-Z only) — a deliberate scope-cut vs. a general
# bitmap-font engine (RESEARCH.md Don't Hand-Roll). Each entry is 5 rows of a
# 3-column-wide string; "#" = lit, "." = blank.
_GLYPHS = {
    " ": ["...", "...", "...", "...", "..."],
    "A": [".#.", "#.#", "###", "#.#", "#.#"],
    "B": ["##.", "#.#", "##.", "#.#", "##."],
    "C": [".##", "#..", "#..", "#..", ".##"],
    "D": ["##.", "#.#", "#.#", "#.#", "##."],
    "E": ["###", "#..", "##.", "#..", "###"],
    "F": ["###", "#..", "##.", "#..", "#.."],
    "G": [".##", "#..", "#.#", "#.#", ".##"],
    "H": ["#.#", "#.#", "###", "#.#", "#.#"],
    "I": ["###", ".#.", ".#.", ".#.", "###"],
    "J": ["..#", "..#", "..#", "#.#", ".#."],
    "K": ["#.#", "#.#", "##.", "#.#", "#.#"],
    "L": ["#..", "#..", "#..", "#..", "###"],
    "M": ["#.#", "###", "###", "#.#", "#.#"],
    "N": ["#.#", "##.", "#.#", ".##", "#.#"],
    "O": [".#.", "#.#", "#.#", "#.#", ".#."],
    "P": ["##.", "#.#", "##.", "#..", "#.."],
    "Q": [".#.", "#.#", "#.#", ".#.", "..#"],
    "R": ["##.", "#.#", "##.", "#.#", "#.#"],
    "S": [".##", "#..", ".#.", "..#", "##."],
    "T": ["###", ".#.", ".#.", ".#.", ".#."],
    "U": ["#.#", "#.#", "#.#", "#.#", ".#."],
    "V": ["#.#", "#.#", "#.#", ".#.", ".#."],
    "W": ["#.#", "#.#", "###", "###", "#.#"],
    "X": ["#.#", ".#.", ".#.", ".#.", "#.#"],
    "Y": ["#.#", "#.#", ".#.", ".#.", ".#."],
    "Z": ["###", "..#", ".#.", "#..", "###"],
}

SCROLL_STEP_SEC = 0.15  # ~150ms per column, per Task 3's action text


def _glyph_columns(ch):
    rows = _GLYPHS.get(ch, _GLYPHS[" "])
    return [[rows[row][col] == "#" for row in range(5)] for col in range(3)]


def _build_scroll_columns(name):
    text = (name or "FAMILY").upper()
    columns = []
    for ch in text:
        columns.extend(_glyph_columns(ch))
        columns.append([False] * 5)  # 1-column gap between letters
    columns.extend([[False] * 5] * 8)  # blank run before the loop repeats
    return columns or [[False] * 5]


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
    # Glyph rows occupy display rows 0-4 (top-aligned) so the scrolling text
    # is visible in every row band, including row 0 — kept deliberately
    # top-aligned rather than vertically centered so any 8x8 slice always
    # carries live scroll data.
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
            self._json_response(200, {"ok": True, "state": current})
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
        except (ValueError, json.JSONDecodeError):
            self.send_response(400)
            self.end_headers()
            return

        if state not in VALID_STATES:
            self.send_response(400)
            self.end_headers()
            return

        if state == "ended":
            state = "idle"

        with _state_lock:
            _state["target"] = state
            if name is not None:
                _state["name"] = name
            _last_post_at = time.time()

        self.send_response(200)
        self.end_headers()


# --- Render loop (daemon thread; never runs inline in a request handler) ----


def render_loop(matrix):
    start = time.time()
    while True:
        with _state_lock:
            target = _state["target"]
            name = _state["name"]
        t = time.time() - start
        # Same frame_for_state() dispatch a joystick nudge and --selftest both use --
        # one source of truth for "what does state X look like."
        frame = frame_for_state(target, name, t)
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
    without starting the HTTP server."""
    fb_path = find_fb_device()
    matrix = Matrix(fb_path)
    start = time.time()
    for state in DEMO_CYCLE_STATES:
        name = DEMO_CYCLE_NAME if state == "verified" else None
        hold_until = time.time() + SELFTEST_HOLD_SEC
        while time.time() < hold_until:
            frame = frame_for_state(state, name, time.time() - start)
            matrix.draw(_apply_brightness(frame))
            time.sleep(1 / 15)
    print(f"lamp.py --selftest: cycled {len(DEMO_CYCLE_STATES)} states successfully")
    return 0


def main():
    if "--selftest" in sys.argv:
        sys.exit(run_selftest())

    fb_path = find_fb_device()
    matrix = Matrix(fb_path)

    threading.Thread(target=render_loop, args=(matrix,), daemon=True).start()
    threading.Thread(target=watchdog_loop, daemon=True).start()

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
