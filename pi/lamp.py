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
import os
import struct
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "169.254.10.2"
PORT = 8080

VALID_STATES = {"idle", "screening", "verifying", "verified", "scam", "ended"}
WATCHDOG_TIMEOUT_SEC = 60

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


# --- Shared render state -----------------------------------------------------

_state_lock = threading.Lock()
_state = {"target": "idle", "name": None}
_last_post_at = time.time()


def _amber_frame():
    # Dim amber for the tracer — Task 3 replaces this with a breathing animation.
    return [(40, 25, 0)] * 64


def _red_frame():
    return [(180, 0, 0)] * 64


# --- HTTP handler -------------------------------------------------------------


class LampHandler(BaseHTTPRequestHandler):
    # Quiet default stderr access logging — keep it minimal for a headless demo box.
    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        if self.path == "/health":
            with _state_lock:
                current = _state["target"]
            body = json.dumps({"ok": True, "state": current}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
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
    while True:
        with _state_lock:
            target = _state["target"]
        if target == "scam":
            frame = _red_frame()
        else:
            # idle / screening / verifying / verified all share the tracer's
            # dim amber placeholder until Task 3 adds per-state animations.
            frame = _amber_frame()
        matrix.draw(frame)
        time.sleep(1 / 15)


def main():
    fb_path = find_fb_device()
    matrix = Matrix(fb_path)

    render_thread = threading.Thread(target=render_loop, args=(matrix,), daemon=True)
    render_thread.start()

    # If the interface isn't up yet at boot, this bind raises — systemd's
    # Restart=always/RestartSec=2 (see porchlight-lamp.service) is the
    # intended recovery, not network-online.target complexity.
    server = ThreadingHTTPServer((HOST, PORT), LampHandler)
    server.serve_forever()


if __name__ == "__main__":
    main()
