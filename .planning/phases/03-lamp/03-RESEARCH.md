# Phase 3: Lamp - Research

**Researched:** 2026-09-21
**Domain:** Raspberry Pi + Sense HAT ambient device (no internet), Mac-side Firestore→HTTP bridge over a direct link-local ethernet cable
**Confidence:** MEDIUM (hardware/package facts could not be verified against the physical Pi from this research session — see Assumptions Log)

<user_constraints>
## User Constraints (from CONTEXT.md)

No `03-CONTEXT.md` exists for this phase (not yet run through `/gsd-discuss-phase`). Constraints below are drawn from `PROJECT.md` Key Decisions and `ROADMAP.md` Phase 3, which function as the locked scope for this hackathon:

### Locked Decisions
- Lamp is driven by a **Mac-side bridge** (Firestore listener → HTTP POST to the Pi over ethernet); the Pi runs a tiny stdlib HTTP server. Rationale: Pi has no internet on the link-local cable; removes venue Wi-Fi as a failure point.
- Network: lamp is driven from the Mac over the direct ethernet cable, **never over Wi-Fi**. Mac may be on Wi-Fi/hotspot for everything else.
- `pi/` is Python, standard library **plus whatever the OS image preinstalls only** — no `pip install` (no internet).
- `bridge/` is a Node script (Node 24 on the Mac).
- Firestore is the realtime backbone; one `calls/{id}` doc (schema below) is the source of truth the lamp mirrors.

### Claude's Discretion
- Exact animation timing/frame rates, LED color values, font/text-rendering approach for scrolling names, systemd unit details, whether to use `sense_hat` or raw framebuffer/evdev, how the bridge authenticates to Firestore, exact Firestore mirror-document shape, joystick alert delivery mechanism.

### Deferred Ideas (OUT OF SCOPE)
- Lamp as a standalone Wi-Fi device with its own provisioning (v2 PROD-06).
- Acoustic/voice detection, billing, multi-household — irrelevant to this phase.

**Environment drift flagged for the planner (see Assumptions Log A1):** `PROJECT.md` and `ROADMAP.md` describe the Pi as Raspbian 11 "Bullseye" (Python 3.9, hostname `raspberrypi.local`, dual IPv4/IPv6 link-local). The task brief for this research instead states the Pi has been **reflashed to Raspberry Pi OS on Debian 13 "trixie"** (OpenSSH 10.0, hostname `smerbs`, user `pi`, SSH-key auth already installed, **IPv6-link-local only**, no IPv4 seen yet). These are contradictory and the newer facts are more recent. This research treats the **trixie/IPv6-only** facts as current, per the task brief. `PROJECT.md`'s Pi facts and `REQUIREMENTS.md` LAMP-01's "Python 3.9" wording are now stale and should be corrected at the next `/gsd-transition` or before planning locks LAMP-01's acceptance criteria to a specific Python version.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LAMP-01 | Pi runs a dependency-free Python service (stdlib HTTP + LED matrix) rendering amber idle, blue pulsing (screening/verifying), green + scrolling name (verified), red flashing (scam) | Architecture Patterns 1-3 (framebuffer discovery, RGB565 packing), Code Examples (frame generators), Don't Hand-Roll (name-scrolling font scope-cut), Common Pitfalls 1 & 5 (package-availability and struct-format risk) |
| LAMP-02 | Mac-side bridge subscribes to the active call in Firestore and POSTs state to the Pi over the ethernet link within ~1s | Architecture Patterns 4-5 (Firestore mirror Function, bridge fetch loop), Common Pitfalls 2-3 (IPv6 zone-id addressing), Code Examples (static IPv4 via nmcli, curl smoke tests) |
| LAMP-03 | Lamp service starts on boot (systemd) and returns to idle after a call ends or if the bridge goes silent | Code Examples (systemd unit), Architecture Patterns diagram (watchdog thread) |
| LAMP-04 | Joystick press triggers a "call my family" alert visible on the dashboard | Architecture Pattern 3 (evdev joystick reader), Architectural Responsibility Map (Edge Device captures input; API/Backend records the alert), Architecture diagram (poll loop + callable Function) |
</phase_requirements>

<architectural_responsibility_map>
## Architectural Responsibility Map

This phase is an IoT/edge system, not a browser+API app, so the standard 5-tier taxonomy is extended with an **Edge Device** tier (the Pi) and a **Local Bridge** tier (the Mac-side relay process, which behaves like a trusted backend even though it isn't cloud-hosted).

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Derive "what should the lamp show" from `calls/{id}` | API/Backend (Cloud Function) | — | Firestore rules deny client reads of `calls/{id}`; a Function must mirror only the fields the lamp needs into a narrowly-readable doc. Keeps the rule surface small (extends Phase 1's D-10 pattern). |
| Firestore listen → HTTP relay to Pi | Local Bridge (Mac, trusted Node process) | — | Not a browser; runs with the project's public web config exactly like `apps/web`, no admin creds needed if it only *reads* an openly-readable doc. |
| LED matrix rendering + animation state machine | Edge Device (Pi) | — | No business logic; pure rendering of whatever state byte it was last told. Must be self-contained (no internet). |
| Idle/watchdog timeout (LAMP-03) | Edge Device (Pi) | — | Must work even if the bridge process dies or the cable is unplugged — cannot depend on the Mac. |
| Joystick "call my family" capture (LAMP-04) | Edge Device (Pi) | API/Backend (alert write) | Pi captures the physical input; it has no internet, so it can only expose the event locally. The bridge (or the Pi itself, indirectly through the bridge) is responsible for turning that local event into a Firestore alert. |

**Why the Function mirrors instead of the bridge using Admin SDK:** avoids introducing a new secret (a service-account JSON) into a hackathon repo under time pressure. See Code Examples / Firestore Mirror Pattern below.
</architectural_responsibility_map>

<research_summary>
## Summary

This phase builds two small, disposable programs: a Python stdlib HTTP service on the Pi that renders an 8x8 LED animation and reads a joystick, and a tiny Node script on the Mac that watches Firestore and POSTs state to the Pi. The two hard technical risks are (1) whether the `sense_hat` Python package (or its `sense-hat` apt metapackage) is preinstalled on the Pi's OS image, which is now **Raspberry Pi OS trixie (Debian 13)**, not the Bullseye image `PROJECT.md` describes, and (2) getting the Mac and Pi to reliably address each other over the link-local ethernet cable given the Pi currently shows only an IPv6 link-local address.

For (1): the official Raspberry Pi trixie announcement blog lists only the AI HAT+, AI Kit, TV HAT, and Wolfram Mathematica as "not yet available in Trixie" — the Sense HAT is not on that list, but this research could not fetch the actual trixie apt package index to confirm `sense-hat`/`python3-sense-hat` is present (fetch blocked with HTTP 403), so package presence remains **unverified**, not confirmed-absent. Given that ambiguity, and given the explicit instruction to prefer "the approach with the fewest unknowns," **this research recommends building `pi/lamp_service.py` against the raw `/dev/fbN` (RGB565) framebuffer and raw `/dev/input/eventN` (evdev struct) directly, with zero Python packages beyond the standard library** — this works identically whether or not `sense_hat` ends up installed, and is documented by Raspberry Pi's own hardware docs (the LED matrix "is an RGB565 framebuffer with the id `RPi-Sense FB`" and "can be written to as a standard file or mmap-ed"; the joystick "comes up as an input event device... supported... directly through the evdev interface"). A community reference implementation (Photo-king/Rpi-sensehat-agent-led, a near-identical Sense-HAT-status-light project) validates the exact byte-level pattern for both. The plan should still add a 2-minute early verification task (`python3 -c "import sense_hat"`, `dpkg -l | grep -i sense`) so the executor knows immediately which path is live, but the framebuffer/evdev path should be built regardless as it needs no such confirmation.

For (2): this Mac (the actual dev machine, verified live during this research) already carries a macOS-assigned IPv4 link-local address on `en8` (`169.254.228.9`, via automatic private IP addressing) alongside its IPv6 link-local address. This strongly suggests the Pi will also acquire an IPv4 169.254.x.x address once it either runs its own IPv4 link-local negotiation or is given a static one — this is almost certainly what `PROJECT.md`'s older note (`Pi = 169.254.59.28, Mac = 169.254.208.0`) captured before the Pi was reflashed. **Recommendation: give the Pi a static, predictable IPv4 link-local address via `nmcli` (`169.254.10.2/16`) rather than relying on IPv6 zone-id syntax in Node's `fetch()`**, because Node's `net.isIP`/`isIPv6` validation is documented to reject zone-id-scoped IPv6 literals (`fe80::1%eth0`) in some code paths, making `fetch()` support for scoped IPv6 unreliable. Plain IPv4 sidesteps this entirely and lets `bridge/` use ordinary `fetch('http://169.254.10.2:8080/state', ...)` with no bracket/zone-id handling at all.

**Primary recommendation:** Build the Pi service on raw framebuffer + evdev (no `sense_hat` dependency either way), assign the Pi a static IPv4 link-local address via `nmcli` so the bridge can use plain `fetch()`, and mirror `calls/{id}` into an openly-readable `lamp/current` doc via a Cloud Function rather than giving the bridge admin credentials.
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Component | Version | Purpose | Why Standard |
|---|---|---|---|
| Python | 3.13 (assumed; verify with `python3 --version` over SSH) | `pi/lamp_service.py` runtime | Debian 13 "trixie" ships Python 3.13 as its default `python3` [CITED: computingforgeeks.com/install-python-debian, packages.debian.org/trixie/python3.13] — a jump from the Bullseye-era 3.9 that `PROJECT.md`/`REQUIREMENTS.md` currently reference. **[ASSUMED — confirm on the real Pi before locking LAMP-01's language-version acceptance criteria.]** |
| `http.server` (stdlib) | n/a | Pi's HTTP endpoint (`/state`, `/health`, `/joystick`) | Zero-dependency, works with no internet; `ThreadingHTTPServer` handles concurrent bridge POSTs + polling without extra code. [ASSUMED — standard library, well-known] |
| `struct`, `mmap`, `glob`, `threading` (stdlib) | n/a | Framebuffer writes, evdev parsing, animation loop, joystick thread | All stdlib; no install needed under any Python 3.x. [ASSUMED] |
| Node.js | 24 (already the dev machine's version — verified via `node --version` this session) | `bridge/index.mjs` runtime | Matches `PROJECT.md`'s stated dev-machine Node version; native global `fetch` since Node 18, no extra HTTP client package needed. [VERIFIED: local `node --version` → v24.11.1] |
| `firebase` (npm, web/client SDK) | 12.19.0 latest at time of research | Bridge's Firestore `onSnapshot` listener | Official Firebase JS SDK; matches the client config already used by `apps/web` (Phase 1 D-04) — no new credential type. [VERIFIED: npm registry — `npm view firebase version` → 12.19.0] |

### Supporting
| Component | Version | Purpose | When to Use |
|---|---|---|---|
| `sense_hat` (Python, apt `sense-hat` metapackage) | unknown on trixie | Higher-level LED/joystick API (`set_pixels`, `show_message`, `stick.direction_any`) | Only if `import sense_hat` succeeds on the real Pi — treat as a fast-path optimization, not the primary plan (see Common Pitfalls). |
| `nmcli` (NetworkManager CLI, preinstalled on Raspberry Pi OS trixie) | n/a | Give the Pi's ethernet interface a static IPv4 link-local address | Needed once, during setup, over SSH. |
| systemd | preinstalled | `porchlight-lamp.service` — start on boot, auto-restart | Standard init system on Raspberry Pi OS; no alternative needed. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|---|---|---|
| Raw framebuffer + evdev (recommended) | `sense_hat` Python package | `sense_hat` is nicer API (`set_pixels`, `show_message`) but its trixie apt availability is **unverified** in this session (see Assumptions Log A2) — building on it risks a dead end at 1AM with no internet to fall back on. |
| Static IPv4 link-local via `nmcli` (recommended) | IPv6 scoped literal (`fe80::...%en8`) in Node `fetch()` | IPv6 avoids a network config step, but Node's `net.isIP`/`isIPv6` validation is documented to reject zone-id syntax in some code paths (`fe80::1%lo0`), and `fetch()`/undici support for bracketed zone-id URLs is not confirmed reliable. Only use IPv6+curl for manual `curl -g` testing, not for the bridge's production path. |
| Cloud Function mirror doc (recommended) | `firebase-admin` in the bridge with a service-account JSON | Admin SDK bypasses rules cleanly, but introduces a new secret file (`GOOGLE_APPLICATION_CREDENTIALS`) that must be created, gitignored, and kept off a laptop that's about to demo on a stage — avoidable given the phase only needs one derived field mirrored. |

**Installation:**
```bash
# bridge/ (on the Mac)
cd bridge && npm init -y && npm install firebase

# pi/ — nothing to install (stdlib only). If sense_hat check passes, it's already present:
python3 -c "import sense_hat; print(sense_hat.__file__)"
```
</standard_stack>

<package_legitimacy_audit>
## Package Legitimacy Audit

This phase installs exactly one external package: `firebase` (npm, web SDK) into `bridge/`. `pi/` installs nothing (stdlib only, per the recommended framebuffer/evdev approach).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---|---|---|---|---|---|---|
| `firebase` | npm | Package itself is long-established (Firebase JS SDK); the specific latest version (12.19.0) was published very recently, which trips a "too-new" heuristic on the *version*, not the *package* | 7,435,870/week | github.com/firebase/firebase-js-sdk | SUS (reason: `too-new` — flags recency of the latest patch release, not first publish) | Approved with note — this is the same `firebase` package `apps/web` and `functions` already depend on per Phase 1 (D-04/D-01); the "too-new" signal is a false-positive on a routine version bump of a 10+-year-old, 7M-download/week, officially-maintained package. No `checkpoint:human-verify` needed before install, but the planner should pin `bridge/package.json` to the same major version already used elsewhere in the monorepo rather than blindly taking `latest`, to avoid a second, independently-drifting SDK version. |

**Packages removed due to `[SLOP]` verdict:** none
**Packages flagged as suspicious `[SUS]`:** `firebase` — see note above; recommend pinning to the monorepo's existing major version instead of a fresh `npm install firebase@latest`, but does not need a human-verify checkpoint given the package's established legitimacy is independently obvious (already in use elsewhere in this same repo).
</package_legitimacy_audit>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
Firestore (cloud)
  calls/{id}  ── onWrite trigger ──▶  Cloud Function: mirrorActiveCallToLamp
                                            │
                                            ▼
                                   lamp/current  { state, name?, callId }
                                   (rules: allow read: if true; deny write)
                                            │
                                   onSnapshot (bridge/index.mjs, Mac)
                                            │
                                            ▼
                          POST http://169.254.10.2:8080/state
                          { state: 'idle'|'screening'|'verifying'|'verified'|'scam', name?: string }
                                            │
                          ══════════ ethernet cable (en8 ⇄ Pi eth0) ══════════
                                            │
                                            ▼
                        pi/lamp_service.py  (ThreadingHTTPServer, :8080)
                          ├─ POST /state  → updates shared `target` + `last_post_at`
                          ├─ GET  /health → 200 "ok"
                          ├─ GET  /joystick → returns & clears pressed flag
                          ├─ [thread] render loop (~15fps) → /dev/fbN (RGB565, 8x8)
                          ├─ [thread] watchdog (1s tick) → if now-last_post_at > N s: target='idle'
                          └─ [thread] joystick reader → /dev/input/eventN → sets pressed flag

                                            ▲
                          GET /joystick (poll, ~500ms) ── bridge/index.mjs
                                            │
                                            ▼
                          httpsCallable('raiseFamilyAlert')({ householdId })
                                            │
                                            ▼
                          households/{id}/alerts/{autoId}  (Phase 4 renders this)
```

A reader can trace: a call's `state` write in Firestore → Function mirrors it → bridge sees it in ~1s via `onSnapshot` → bridge POSTs to the Pi over the cable → Pi's render thread picks up the new target on its next tick (well under 1s) and redraws the matrix. Independently: a joystick press → Pi sets a local flag → bridge's poll loop picks it up within 500ms → callable Function → Firestore alert.

### Recommended Project Structure
```
pi/
├── lamp_service.py       # stdlib HTTP server + render loop + watchdog + joystick reader
├── matrix.py             # framebuffer discovery (by name) + RGB565 pack/write
├── animations.py         # idle/screening/verified/scam frame generators
├── porchlight-lamp.service  # systemd unit, copied to /etc/systemd/system/ on the Pi
└── README.md             # deploy + verification commands (scp/ssh one-liners)

bridge/
├── index.mjs             # Firestore onSnapshot -> fetch() POST, joystick poll loop
├── firebase-config.mjs   # same public web config apps/web already uses (not a secret)
├── package.json
└── README.md
```

### Pattern 1: Framebuffer discovery by name (survives fb-number drift)
**What:** Never hardcode `/dev/fb0` — an HDMI cable or other display can shift which `/dev/fbN` is the Sense HAT.
**When to use:** Always, for any raw-framebuffer Sense HAT code.
**Example:**
```python
# Source: Raspberry Pi official docs (raspberrypi.com/documentation/accessories/sense-hat.html —
# "The LED matrix is an RGB565 framebuffer with the id RPi-Sense FB") +
# pattern verified against community reference: github.com/Photo-king/Rpi-sensehat-agent-led (pi/sensehat_led.py)
import glob, os

def find_fb_device():
    for sysdir in sorted(glob.glob("/sys/class/graphics/fb*")):
        name_path = os.path.join(sysdir, "name")
        try:
            with open(name_path) as f:
                name = f.read().strip().lower()
        except OSError:
            continue
        if "sense" in name:  # matches "RPi-Sense FB"
            dev = "/dev/" + os.path.basename(sysdir)
            if os.path.exists(dev):
                return dev
    raise RuntimeError("Sense HAT framebuffer not found — is the HAT seated and I2C enabled?")
```

### Pattern 2: RGB565 pack + 128-byte write, top-left origin
**What:** 8x8 grid = 64 pixels x 2 bytes = 128-byte buffer, row-major, index 0 = top-left (HDMI-port-down orientation), written via `mmap` for a flicker-free full-frame update.
**When to use:** Every render tick.
**Example:**
```python
# Source: pixel packing verified against community reference (Photo-king/Rpi-sensehat-agent-led);
# origin/orientation and "RGB565 framebuffer" fact from official docs (see Pattern 1);
# set_pixel() coordinate convention ("0 is on the left, 7 on the right"; "0 is at the top, 7 at
# the bottom") [CITED: github.com/astro-pi/python-sense-hat/blob/master/docs/api.md] used to infer
# set_pixels' row-major top-left ordering (not explicitly stated for set_pixels itself).
import struct, mmap, os

class Matrix:
    def __init__(self, dev_path):
        self.fd = os.open(dev_path, os.O_RDWR)
        self.mem = mmap.mmap(self.fd, 128)  # 8*8*2 bytes

    def draw(self, pixels):  # pixels: list of 64 (r, g, b) tuples, 0-255 each, row-major
        buf = bytearray(128)
        for i, (r, g, b) in enumerate(pixels):
            packed = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
            struct.pack_into("<H", buf, i * 2, packed)
        self.mem[0:128] = bytes(buf)
```

### Pattern 3: Joystick via raw evdev (no `sense_hat`, no `python-evdev`)
**What:** Read `/dev/input/eventN` directly with `struct`, matching the kernel's `input_event` layout.
**When to use:** Whenever `sense_hat`'s event-driven `stick.direction_*` callbacks aren't available.
**Example:**
```python
# Source: struct format verified against community reference
# (Photo-king/Rpi-sensehat-agent-led: EVENT_FMT = "llHHi" for aarch64 = timeval(16) + type(2) + code(2) + value(4) = 24 bytes).
# EXECUTOR MUST VERIFY on the real Pi before relying on this: `uname -m` should print aarch64,
# and `python3 -c "import struct; print(struct.calcsize('llHHi'))"` should print 24.
# If the Pi is running a 32-bit (armhf) userland instead, `long` is 4 bytes and this format/size differs.
import struct, glob, os

EVENT_FMT = "llHHi"
EVENT_SIZE = struct.calcsize(EVENT_FMT)  # expect 24 on 64-bit (aarch64)
EV_KEY = 1
KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_ENTER = 103, 108, 105, 106, 28  # "any direction" set

def find_joystick_device():
    # Match by name: official docs say the device is named
    # "Raspberry Pi Sense HAT Joystick" [CITED: raspberrypi.com/documentation/accessories/sense-hat.html]
    for name_path in glob.glob("/sys/class/input/event*/device/name"):
        with open(name_path) as f:
            if "sense hat joystick" in f.read().strip().lower():
                event_num = name_path.split("/")[4]  # eventN
                return f"/dev/input/{event_num}"
    raise RuntimeError("Sense HAT joystick input device not found")

def watch_joystick(on_press):
    dev = find_joystick_device()
    with open(dev, "rb") as f:
        while True:
            data = f.read(EVENT_SIZE)
            _, _, ev_type, code, value = struct.unpack(EVENT_FMT, data)
            if ev_type == EV_KEY and value == 1 and code in (KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_ENTER):
                on_press()
```
Permissions: `pi` is, by default Raspberry Pi OS convention, a member of both `video` (covers `/dev/fb*`) and `input` (covers `/dev/input/event*`) groups [CITED: apnorton.com/blog/2017/11/25/Raspberry-Pi-Default-Groups, roboticsbackend.com/raspberry-pi-hardware-permissions — community sources, not raspberrypi.com, but consistent with long-standing convention]. **Verify with `groups pi` over SSH early in the phase**; if either group is missing, either add the user (`sudo usermod -aG input,video pi`, requires re-login) or run the systemd unit as root (simplest fix under time pressure).

### Pattern 4: Firestore mirror Function (no admin creds needed in the bridge)
**What:** A Cloud Function mirrors just the fields the lamp needs from the active `calls/{id}` doc into a small, openly-readable `lamp/current` doc.
**When to use:** Any time a client (or client-like trusted process) needs a narrow read without opening up the full collection's security rules.
**Example:**
```typescript
// functions/src/lamp.ts — extends the Phase 1 Functions scaffold
// Pattern source: general Firestore trigger + rules-narrowing pattern [ASSUMED — standard Firebase
// idiom, not fetched from Firebase docs this session; verify onDocumentWritten import path against
// the actual firebase-functions version pinned in functions/package.json during planning].
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";

export const mirrorActiveCallToLamp = onDocumentWritten("calls/{callId}", async (event) => {
  const after = event.data?.after.data();
  const db = getFirestore();
  const lampRef = db.doc("lamp/current");

  if (!after || after.state === "ended") {
    // Only clear if this was the call currently mirrored (avoids a stale call clearing a newer one)
    const current = (await lampRef.get()).data();
    if (current?.callId === event.params.callId) {
      await lampRef.set({ state: "idle", callId: null, name: null });
    }
    return;
  }

  await lampRef.set({
    state: after.state, // idle | screening | verifying | verified | scam
    name: after.verification?.answer === "yes" ? after.verification?.memberId : after.risk?.claimedIdentity ?? null,
    callId: event.params.callId,
  });
});
```
```
// firestore.rules addition (extends Phase 1 D-10 pattern — keep all other client writes denied)
match /lamp/current {
  allow read: if true;
  allow write: if false; // only Functions (Admin SDK) write this
}
```

### Pattern 5: Bridge — plain-IPv4 fetch, no zone-id handling
**What:** `onSnapshot` the mirror doc, POST state to the Pi's static link-local IPv4 address.
**When to use:** Bridge's main loop.
**Example:**
```javascript
// bridge/index.mjs
// Source: Firebase JS SDK onSnapshot is a well-documented core API [ASSUMED — not re-fetched from
// firebase.google.com this session, but this is the same client-init pattern apps/web already uses].
import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";

const app = initializeApp(/* same public web config as apps/web — not a secret */);
const db = getFirestore(app);

const PI_URL = "http://169.254.10.2:8080"; // static link-local IPv4 assigned via nmcli — see Pitfall 2

onSnapshot(doc(db, "lamp", "current"), async (snap) => {
  const data = snap.data();
  if (!data) return;
  try {
    await fetch(`${PI_URL}/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: data.state, name: data.name ?? undefined }),
      signal: AbortSignal.timeout(2000),
    });
  } catch (err) {
    console.error("lamp POST failed", err); // Pi unreachable — watchdog on the Pi handles idle fallback
  }
});

// Joystick poll loop — LAMP-04
setInterval(async () => {
  try {
    const res = await fetch(`${PI_URL}/joystick`, { signal: AbortSignal.timeout(1000) });
    const { pressed } = await res.json();
    if (pressed) {
      // call the Phase-3-added callable Function (no admin creds needed here either)
      // await raiseFamilyAlert({ householdId: DEMO_HOUSEHOLD_ID });
    }
  } catch { /* Pi unreachable this tick — try again next tick */ }
}, 500);
```

### Anti-Patterns to Avoid
- **Hardcoding `/dev/fb0`:** breaks the moment anything else claims fb0 (e.g., a monitor plugged in for debugging). Always discover by name (Pattern 1).
- **Calling `sense_hat.show_message()` (if used) on the main request-handling thread:** it's a scrolling call and community consensus is that it blocks until the text finishes scrolling [ASSUMED — not confirmed against official docs this session, official API doc does not state blocking behavior explicitly]; run it in a dedicated thread with a stop-flag so a new state can interrupt an in-progress scroll.
- **Bridge writing directly to Firestore with the client SDK past Phase 1's closed rules:** either extend the rules narrowly (Pattern 4's `lamp/current`) or go through a callable Function — don't reopen broad client-write access under time pressure.
- **Using the bare IPv6 link-local address in the bridge's `fetch()` calls for the actual demo path:** works in `curl` reliably; `fetch()`/undici support for the zone-id syntax is not confirmed reliable in this session's research (see Common Pitfalls). Use static IPv4 for anything that has to work live on stage.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Full 8x8 pixel-font renderer for arbitrary scrolling text | A general bitmap-font engine | If `sense_hat` is present: its built-in `show_message()`. If not: a **hardcoded** tiny glyph table for only the handful of characters the demo actually needs (first names in the seeded household — a handful of letters), scrolled with a simple column-shift loop | A general font renderer is the single highest-effort item in this phase and the demo only ever needs to spell 2-3 short names. Building the general case wastes the 1-2h budget on the least demo-visible part. |
| Process supervision / crash restart | A custom watchdog script, cron polling `pgrep` | systemd `Restart=always` | This is exactly what systemd is for; hand-rolled restart loops miss edge cases (rapid-crash backoff, clean shutdown handling) that `Restart=always` + `RestartSec=` already solve. |
| IPv6 zone-id parsing/validation in Node | Manual regex or socket-level `if_nametoindex` calls to work around `net.isIP` rejecting scoped literals | A static IPv4 link-local address via `nmcli`, so the bridge never needs to think about zone ids at all | Node's own ecosystem has open issues about `net.isIP`/`isIPv6` rejecting zone-id syntax; working around library internals under a midnight deadline is a bad trade against a five-minute `nmcli` command. |
| Firestore auth for the bridge | A service-account JSON + `firebase-admin` just to read one document | The public web SDK config (already used by `apps/web`) + a narrowly-opened `lamp/current` read rule | Admin credentials are a new secret-management surface (a JSON key file that must never leak) for a problem solvable with one rule line. |

**Key insight:** every "don't hand-roll" here is really the same lesson: pick the path with the fewest new moving parts given a hard deadline and no internet on the target device. The framebuffer/evdev approach, static IPv4, and rules-narrowing are all instances of removing a dependency (a package, a credential type, a protocol edge case) rather than managing it.
</dont_hand_roll>

<common_pitfalls>
## Pitfall 1: `sense_hat` may or may not be preinstalled on trixie — don't build a two-path branch that only gets tested on one path
**What goes wrong:** Writing code that calls `import sense_hat` at the top and only has a half-finished framebuffer fallback, discovered dead at 1AM when the import fails.
**Why it happens:** The Pi's OS image changed (Bullseye → trixie) after `PROJECT.md` was written, and this research could not confirm from official channels whether `sense-hat`/`python3-sense-hat` ships in the trixie apt archive (direct package-index fetch returned HTTP 403; the official trixie announcement blog doesn't mention Sense HAT either way).
**How to avoid:** Build the framebuffer/evdev path (Patterns 1-3) as the **only** path — it works whether or not `sense_hat` is installed, since it never imports it. Treat `sense_hat` as pure upside if a later `import sense_hat` check succeeds and there's spare time to swap in `show_message()`/`stick.direction_any` for polish.
**Warning signs:** Any code path that only gets exercised if a package import fails — those paths are, in practice, the ones nobody tests until it's too late.

## Pitfall 2: Node's `fetch()` and IPv6 zone-id (scoped link-local) addresses don't mix reliably
**What goes wrong:** `fetch('http://[fe80::e65f:1ff:fe71:216e%25en8]:8080/state')` fails or times out unpredictably from the bridge, even though the identical address works fine from `curl`.
**Why it happens:** Node's `net.isIP`/`net.isIPv6` validation has a documented open issue rejecting zone-id-scoped literals (`fe80::1%lo0`) in some code paths that `fetch`/undici rely on for address validation, while Node itself (lower-level socket APIs) does accept the syntax. This mismatch means scoped-IPv6 support in `fetch()` is not something to depend on for a live demo.
**How to avoid:** Give the Pi a static IPv4 link-local address (`169.254.10.2/16`) via `nmcli` (see Environment Availability / Code Examples), and use that in the bridge. Reserve the IPv6 scoped address for manual `curl -g` testing only.
**Warning signs:** `fetch()` calls that hang until the `AbortSignal.timeout` fires, or throw `ERR_INVALID_URL`/`ENOTFOUND`-style errors specifically when the URL contains `%25`.

## Pitfall 3: `curl` needs `-g` (globoff) for bracketed IPv6 literals with a zone id
**What goes wrong:** `curl -X POST 'http://[fe80::e65f:1ff:fe71:216e%25en8]:8080/state' -d '...'` fails or curl misinterprets the brackets.
**Why it happens:** curl's default URL-globbing parser treats `[` and `]` as range-expansion syntax; a literal IPv6-bracketed URL needs globbing turned off.
**How to avoid:** Always pass `-g`/`--globoff` when testing against the bracketed IPv6 form: `curl -g -X POST 'http://[fe80::e65f:1ff:fe71:216e%25en8]:8080/state' -d '{"state":"scam"}'`. Once the static IPv4 is assigned, this whole class of pitfall disappears — plain `curl -X POST 'http://169.254.10.2:8080/state' ...` needs no special flags.
**Warning signs:** curl errors mentioning "bad range" or unexpected globbing behavior when the URL contains brackets.

## Pitfall 4: `show_message()`-style scrolling text blocks the thread that's supposed to answer HTTP requests
**What goes wrong:** The lamp stops responding to new POSTs while a name is mid-scroll (or, in the raw-framebuffer version, while a custom scroll loop is running).
**Why it happens:** A naive implementation does rendering inline in the HTTP request handler thread.
**How to avoid:** Run rendering in its own background thread that reads a shared `target_state` variable (protected by a simple lock or just relying on the GIL for a single-writer/single-reader string swap); the HTTP handler thread only ever writes `target_state` and returns immediately. `ThreadingHTTPServer` already gives each request its own thread, so this mostly just means: don't put a `time.sleep`-driven animation loop inside `do_POST`.
**Warning signs:** POSTs from the bridge start timing out or queueing during a "verified" (scrolling-name) state.

## Pitfall 5: Assuming the Pi is 64-bit (aarch64) for the evdev `struct` format
**What goes wrong:** `struct.unpack("llHHi", data)` raises `struct.error: unpack requires a buffer of 24 bytes` (or silently misparses) if the OS userland is actually 32-bit (armhf), where C `long` is 4 bytes, not 8.
**Why it happens:** Raspberry Pi 4 supports both 32-bit and 64-bit Raspberry Pi OS images; which one is installed on this specific SD card is not confirmed in this research session.
**How to avoid:** Run `uname -m` over SSH early in the phase — `aarch64` confirms the assumed format; `armv7l` means the struct format and size differ and must be re-derived (still `llHHi` but `EVENT_SIZE` becomes 16, not 24, since 32-bit `long` is 4 bytes: 4+4+2+2+4=16... verify with `struct.calcsize` on the actual device rather than trusting either number here).
**Warning signs:** Immediate `struct.error` on the very first joystick read attempt.
</common_pitfalls>

<code_examples>
## Code Examples

### Frame generators (row-major 64-pixel lists)
```python
# pi/animations.py — timing/color choices are this research's discretion-area
# recommendation for an 8x8 matrix viewed from ~3m. [ASSUMED — reasonable defaults, not sourced]
import math

AMBER, BLUE, GREEN, RED = (255, 170, 0), (0, 110, 255), (0, 200, 60), (255, 0, 0)

def _breathe(color, t, period, floor=0.25):
    b = floor + (1 - floor) * (0.5 + 0.5 * math.sin(2 * math.pi * t / period))
    return [tuple(int(c * b) for c in color)] * 64

def idle_frame(t):      return _breathe(AMBER, t, 4.0)      # slow, ~4s period
def screening_frame(t): return _breathe(BLUE, t, 1.2)       # faster — "actively listening"
def verified_frame(t):  return [GREEN] * 64                 # + scrolling name overlay, see Don't Hand-Roll
def scam_frame(t):                                           # fast flash — no font needed, see Don't Hand-Roll
    return [RED if int(t / 0.3) % 2 == 0 else (0, 0, 0)] * 64
```

### systemd unit — start on boot, always restart
```ini
# pi/porchlight-lamp.service
# Source: standard systemd directive names [ASSUMED — extremely well-established systemd
# convention (Restart=always, WantedBy=multi-user.target); not re-fetched from
# freedesktop.org/software/systemd/man this session (fetch returned HTTP 403), but this exact
# shape is the textbook "always-on service" unit used across the Linux ecosystem.]
[Unit]
Description=Porchlight Lamp Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/porchlight/pi
ExecStart=/usr/bin/python3 /home/pi/porchlight/pi/lamp_service.py
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```
Install/enable:
```bash
sudo cp /home/pi/porchlight/pi/porchlight-lamp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now porchlight-lamp.service
systemctl is-active porchlight-lamp.service   # expect: active
```

### Deploying with no internet on the Pi (scp/ssh over the cable)
```bash
# While the Pi is still IPv6-only (before nmcli static IPv4 is set):
scp -6 pi/*.py "pi@[fe80::e65f:1ff:fe71:216e%en8]:/home/pi/porchlight/pi/"
ssh "pi@fe80::e65f:1ff:fe71:216e%en8" "sudo systemctl restart porchlight-lamp.service"

# After the static IPv4 is assigned (recommended for the rest of the phase):
scp pi/*.py pi@169.254.10.2:/home/pi/porchlight/pi/
ssh pi@169.254.10.2 "sudo systemctl restart porchlight-lamp.service"
```
Note the **unbracketed, unescaped** `%en8` zone suffix works directly in `ssh`'s and `scp`'s own address parsing (OpenSSH handles zone ids natively) — this is different from the bracket+`%25` dance needed inside an HTTP URL, and is not a `curl`-style edge case.

### Static IPv4 link-local via `nmcli` (recommended fix for the addressing pitfall)
```bash
# On the Pi, over the existing IPv6 SSH session:
nmcli con show                                  # find the wired connection's exact name (often "Wired connection 1")
sudo nmcli con mod "Wired connection 1" ipv4.method manual ipv4.addresses 169.254.10.2/16
sudo nmcli con up "Wired connection 1"
ip -4 addr show                                 # confirm 169.254.10.2/16 is now live

# On the Mac (already showed a self-assigned 169.254.228.9/16 on en8 during this research —
# APIPA is automatic on macOS, no action needed unless it changes):
ifconfig en8 | grep 'inet '
```
`ipv4.method manual` (a specific, chosen address) is recommended over `ipv4.method link-local` (OS-negotiated via RFC 3927 Address Conflict Detection, which can take up to ~1 minute and isn't guaranteed to pick the same address across reboots) — manual gives a predictable, demo-safe address every time. [ASSUMED — `nmcli` command shape verified against general NetworkManager/RHEL docs conventions, not run against the actual Pi this session; verify the exact connection name via `nmcli con show` before running `mod`.]

### curl smoke tests (works with both addressing schemes)
```bash
# Via IPv6 (before nmcli static IPv4; -g is required for the bracket+zone-id form):
curl -g http://[fe80::e65f:1ff:fe71:216e%25en8]:8080/health
curl -g -X POST 'http://[fe80::e65f:1ff:fe71:216e%25en8]:8080/state' \
  -H 'content-type: application/json' -d '{"state":"scam"}'

# Via static IPv4 (recommended once assigned — no flags needed):
curl http://169.254.10.2:8080/health
curl -X POST http://169.254.10.2:8080/state -H 'content-type: application/json' -d '{"state":"verified","name":"Brenden"}'
```

### Testing the bridge without a real call
```bash
# From the Firebase emulator or console, or a short Node one-liner using the same client SDK,
# write a fake calls/demo doc directly (bypassing telephony/risk scoring entirely):
firebase firestore:set calls/demo '{"householdId":"demo","state":"screening","from":"+15550001234","turns":[],"risk":{"score":0,"tactics":[],"recommendedAction":"continue","updatedAt":null}}' --project <project-id>
# Then flip state by hand to exercise each lamp mode:
firebase firestore:set calls/demo '{"state":"verified"}' --project <project-id> --merge
firebase firestore:set calls/demo '{"state":"scam"}' --project <project-id> --merge
firebase firestore:set calls/demo '{"state":"ended"}' --project <project-id> --merge
```
This exercises the full path (Function mirror → bridge `onSnapshot` → HTTP POST → Pi render) with no telephony and no dependency on Phase 2 being finished, matching Phase 3's stated ability to run in parallel with Phase 2.
</code_examples>

<sota_updates>
## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Raspberry Pi OS Bullseye, Python 3.9, `sense_hat` reliably preinstalled | Raspberry Pi OS trixie (Debian 13), Python 3.13, `sense_hat`/`sense-hat` apt availability unconfirmed | This Pi was reflashed sometime after `PROJECT.md` was written (this session) | LAMP-01's "Python 3.9... preinstalled `sense_hat`" acceptance language is stale; plan against raw framebuffer/evdev instead (see Summary). |
| dhcpcd-era Raspberry Pi OS auto-assigning IPv4 link-local (APIPA) alongside IPv6 | NetworkManager-based trixie network stack, which on this Pi has so far only brought up IPv6 link-local | Debian/Raspberry Pi OS moved to NetworkManager as the default network stack in recent releases | The old `PROJECT.md` IPv4 addresses (`169.254.59.28` / `169.254.208.0`) no longer apply; a fresh static IPv4 assignment via `nmcli` is needed (see Code Examples). |

**Deprecated/outdated:**
- `PROJECT.md`'s Pi network facts (hostname `raspberrypi.local`, dual-stack 169.254 addresses, Raspbian 11/Bullseye, SSH banner `OpenSSH_8.4p1`) — superseded by the trixie reflash. Recommend updating `PROJECT.md` at the next `/gsd-transition`.
</sota_updates>

<open_questions>
## Open Questions

1. **Is `sense-hat`/`python3-sense-hat` present in the trixie apt archive on this specific Pi?**
   - What we know: the official trixie announcement blog does not list Sense HAT among currently-unsupported hardware; a direct fetch of the trixie apt package index returned HTTP 403 from this research environment, so it could not be checked directly.
   - What's unclear: whether `apt list --installed | grep sense` or `python3 -c "import sense_hat"` succeeds on the real device.
   - Recommendation: treat this as a **non-blocking** open question — the recommended framebuffer/evdev implementation (Patterns 1-3) does not depend on the answer. Add a 2-minute check as the very first phase task purely for information (whether to also wire up `show_message()` as a nice-to-have polish item), not as a gate.

2. **Is the Pi's userland 32-bit (armhf) or 64-bit (aarch64)?**
   - What we know: Raspberry Pi 4 supports both; Pi OS defaults to 64-bit for recent releases, but this specific SD card's history (age, how it was imaged) is unknown.
   - What's unclear: which `struct` format/size applies for evdev parsing (Pitfall 5).
   - Recommendation: `uname -m` over SSH as an early phase task; derive `EVENT_FMT`/`EVENT_SIZE` from `struct.calcsize` on the device rather than trusting either number in this document.

3. **Does the bridge's plain `fetch()` actually work against a bracketed+zone-id IPv6 URL on this Node version, or is the static-IPv4 workaround strictly necessary?**
   - What we know: Node has open, documented issues around `net.isIP`/`isIPv6` rejecting zone-id syntax in some code paths; behavior specifically for the global `fetch()` (undici) was not empirically tested against the real Pi in this session.
   - What's unclear: whether Node 24's `fetch()` specifically would succeed or fail against `http://[fe80::...%25en8]:8080/`.
   - Recommendation: don't spend phase time testing this — go straight to the static-IPv4 `nmcli` fix, which is verified-workable by construction (plain IPv4, no zone-id ever enters the URL).
</open_questions>

<assumptions_log>
## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Pi's OS/network facts from the task brief (trixie, hostname `smerbs`, IPv6-only) are current and `PROJECT.md`'s facts (Bullseye, `raspberrypi.local`, dual-stack) are stale | User Constraints, State of the Art | If actually still on Bullseye/Python 3.9, the framebuffer/evdev approach still works (it doesn't depend on OS version), but the `nmcli`/NetworkManager commands would be wrong (Bullseye used `dhcpcd`, not NetworkManager, for network config) — verify `cat /etc/os-release` and `systemctl status NetworkManager` before running any `nmcli` command. |
| A2 | `sense-hat`/`python3-sense-hat` package presence on trixie is unverified (package index fetch blocked with HTTP 403) | Summary, Standard Stack, Pitfall 1 | Low risk given the recommended plan doesn't depend on this package at all — only affects whether a "nice-to-have" `show_message()` polish path is available. |
| A3 | Python 3.13 is the Pi's actual `python3` | Standard Stack | Low risk — all recommended code is stdlib-only and uses no 3.13-specific syntax; would work on 3.9-3.13 alike. Only matters if the planner writes acceptance criteria naming a specific Python version. |
| A4 | `pi` user is in the `video` and `input` groups by default on trixie | Architecture Pattern 3 | If false, the joystick reader or framebuffer writer gets a `PermissionError` at runtime; fix is a one-line `usermod` or running the systemd unit as root — cheap to fix once discovered, but should be checked (`groups pi`) before assuming it. |
| A5 | `show_message()` (if `sense_hat` turns out to be available) blocks the calling thread until scrolling finishes | Common Pitfalls (Pitfall 4), Anti-Patterns | If it does NOT block, the "run in a thread" guidance is unnecessary extra complexity — low risk, since threading it is harmless even if not required. |
| A6 | Node 24's `fetch()` cannot reliably reach a bracketed, zone-id-scoped IPv6 URL | Common Pitfalls (Pitfall 2), Standard Stack alternatives | If `fetch()` actually handles this fine, the static-IPv4 `nmcli` step becomes an unnecessary (though still harmless and arguably still worth doing for demo-address predictability) extra setup step. |
| A7 | `nmcli` connection-modify syntax (`ipv4.method manual ipv4.addresses ...`) works unmodified on this Pi's trixie NetworkManager | Code Examples (static IPv4 section) | If the exact connection name or property names differ, the command errors harmlessly (no network change applied) — safe to retry after `nmcli con show` reveals the actual profile name. |

**If this table is empty:** N/A — see rows above. Every claim not independently verified via an official doc fetch, an authoritative package registry, or a local tool run this session is listed here.
</assumptions_log>

<environment_availability>
## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js (Mac) | `bridge/` runtime | ✓ | v24.11.1 (verified: `node --version`) | — |
| npm (Mac) | installing `firebase` into `bridge/` | ✓ | 11.6.2 (verified: `npm --version`) | — |
| ssh (Mac) | deploying `pi/*.py` and managing the systemd unit | ✓ | OpenSSH_10.5p1 (verified: `ssh -V`) | — |
| curl (Mac) | smoke-testing the Pi's HTTP endpoints | ✓ | 8.7.1 (verified: `curl --version`) | — |
| `nmcli` (Mac) | not needed — macOS has no `nmcli`; only the **Pi** needs it | n/a on Mac | — | macOS already self-assigns IPv4 link-local (APIPA) with no tooling needed — verified live: `169.254.228.9/16` on `en8` |
| `nmcli` (Pi, trixie) | assigning a static IPv4 link-local address | UNVERIFIED — not reachable from this research environment | — | If missing, fall back to `ipv4.method link-local` OS-negotiated APIPA on both ends (slower to converge, address not guaranteed stable across reboots) or hardcode `/etc/network/interfaces`-style config if the Pi turns out to still use the legacy `dhcpcd`/ifupdown stack instead of NetworkManager (see Assumption A1) |
| Python 3 (Pi) | `pi/lamp_service.py` | UNVERIFIED (assumed 3.13 per trixie default) | — | stdlib-only code recommended in this research runs unmodified on Python 3.9 through 3.13 |
| `sense-hat`/`python3-sense-hat` apt package (Pi) | optional fast-path only | UNVERIFIED | — | Recommended plan does not require it (raw framebuffer + evdev) |
| systemd (Pi) | `porchlight-lamp.service` autostart | Assumed present — standard on all current Raspberry Pi OS releases | — | — |

**Missing dependencies with no fallback:** none — every uncertain dependency above has a stated fallback.
**Missing dependencies with fallback:** `nmcli` on the Pi (fallback: OS-negotiated link-local or legacy `dhcpcd` config), the `sense-hat` apt package (fallback: raw framebuffer/evdev, which is the primary recommendation anyway).
</environment_availability>

<security_domain>
## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | No | The Pi's HTTP service has no user-facing auth surface; it is reachable only over a physically direct ethernet cable with no other hosts on the segment. Adding auth would be net-negative complexity for a hackathon device with no network path to an attacker. |
| V3 Session Management | No | No sessions — each POST is stateless. |
| V4 Access Control | Yes | The Pi's `ThreadingHTTPServer` should bind to the specific link-local address (`169.254.10.2`) rather than `0.0.0.0`, so it never listens on any interface other than the trusted cable, even though no other interface currently exists on this device. |
| V5 Input Validation | Yes | `/state` POST body must be validated against the exact `calls/{id}` state enum (`idle`, `screening`, `verifying`, `verified`, `scam` — `ended` maps to `idle` client-side) before touching the render thread; reject/ignore unknown values rather than rendering garbage or crashing the handler thread. |
| V6 Cryptography | No | No secrets or crypto operations in this phase; the Firestore mirror doc (`lamp/current`) is deliberately non-sensitive (just a state name and a first name). |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Malformed/garbage POST body to `/state` crashing the HTTP handler thread | Denial of Service | Wrap JSON parsing and enum validation in a try/except that returns `400` on bad input rather than raising; keep the render/watchdog threads independent of request-handling exceptions. |
| `lamp/current` being made too permissively writable while narrowing the `calls/{id}` read rule | Tampering | Firestore rule for `lamp/current` must be `allow write: if false` (Function/Admin SDK only) — see Architecture Pattern 4; a client-writable mirror doc would let anyone on the internet flip the lamp to `scam` mid-demo. |
| Bridge process crash silently leaving the lamp stuck on a stale state (e.g., "scam" from a test run) | — (availability, not a STRIDE-classic threat, but demo-critical) | LAMP-03's watchdog thread on the Pi (Common Pitfalls / Architecture diagram) is the mitigation — it self-reverts to idle if no POST arrives within N seconds, independent of the bridge's health. |
</security_domain>

<sources>
## Sources

### Primary (HIGH confidence — official docs, fetched this session)
- https://www.raspberrypi.com/documentation/accessories/sense-hat.html — `sense-hat` apt install command, "RGB565 framebuffer with the id `RPi-Sense FB`", joystick as a named input event device
- https://www.raspberrypi.com/news/trixie-the-new-version-of-raspberry-pi-os/ — list of hardware NOT yet supported on trixie (Sense HAT absent from that list)
- https://github.com/astro-pi/python-sense-hat/blob/master/docs/api.md — `set_pixel`/`set_pixels` coordinate convention, `show_message()` parameters, `rotation()`, joystick `direction_*` callback API
- Local tool output this session: `node --version` (v24.11.1), `npm view firebase version` (12.19.0), `ifconfig en8` (confirmed macOS APIPA-assigned `169.254.228.9/16` alongside IPv6 link-local `fe80::14ae:530f:1ef:6a4a%en8`)

### Secondary (MEDIUM confidence — community sources cross-checked against official facts above)
- https://github.com/Photo-king/Rpi-sensehat-agent-led — exact RGB565 packing code, framebuffer-by-name discovery pattern, evdev `struct` format (`"llHHi"`, 24 bytes on aarch64) for a near-identical Sense-HAT-status-light project
- https://github.com/nodejs/node — `net.isIP`/`isIPv6` zone-id handling issue referenced via search (confirms a real, open compatibility gap, not resolved by this research)
- https://www.apnorton.com/blog/2017/11/25/Raspberry-Pi-Default-Groups/, https://roboticsbackend.com/raspberry-pi-hardware-permissions/ — default `pi` user group memberships (`video`, `input`)
- https://computingforgeeks.com/install-python-debian/, https://packages.debian.org/trixie/python3.13 — Python 3.13 as trixie's default

### Tertiary (LOW confidence — not independently verified, flagged for validation)
- Whether `sense-hat`/`python3-sense-hat` is actually present in the trixie apt archive (package index fetch blocked; see Open Question 1)
- `show_message()`'s blocking behavior (widely reported in the Pi community; not stated in the official API doc fetched this session)
- Exact `nmcli` connection-name and command syntax on this specific Pi (general NetworkManager convention, not run against the device)
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: Raspberry Pi OS trixie + Sense HAT (raw framebuffer/evdev), Node 24 Firestore bridge
- Ecosystem: `firebase` (web SDK), stdlib-only Python, systemd, NetworkManager (`nmcli`)
- Patterns: framebuffer-by-name discovery, RGB565 packing, evdev joystick parsing, Firestore rules-narrowing mirror, static link-local IPv4 addressing
- Pitfalls checked: OS/package drift since `PROJECT.md` was written, Node IPv6 zone-id support, curl bracket/globbing, thread-blocking render calls, 32-bit vs 64-bit struct sizing

**Confidence breakdown:**
- Standard stack: MEDIUM — Node/npm facts verified locally this session; Pi-side Python version and package availability are assumed/unverified (no access to the physical device from this research environment)
- Architecture: HIGH for the framebuffer/evdev mechanics (cross-checked official docs + a working community reference implementation); MEDIUM for the Firestore-mirror-Function pattern (standard Firebase idiom, not re-fetched from firebase.google.com this session)
- Pitfalls: MEDIUM-HIGH — the IPv6 zone-id/Node issue and the OS/package drift are the two pitfalls most likely to actually bite; both have verified-workable fallbacks (static IPv4, framebuffer-only build)
- Code examples: MEDIUM — packing/discovery code cross-checked against a live community project; animation timing/colors and systemd unit shape are reasonable defaults, not independently sourced

**Research date:** 2026-09-21
**Valid until:** demo day (2026-09-22) — this is a one-shot hackathon build; findings are not expected to need revalidation beyond that
</metadata>
