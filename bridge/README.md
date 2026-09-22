# Porchlight Lamp Bridge

The Mac-side relay for the Porchlight lamp (Phase 3). Watches `lamp/current` in Firestore
(mirrored from `calls/{id}` by `functions/src/lamp.ts`'s `mirrorActiveCallToLamp`) and POSTs the
resulting state to the Pi's `pi/lamp.py` HTTP service over the direct ethernet cable — **never
over Wi-Fi** (CLAUDE.md network constraint). It also polls the Pi's `/joystick` endpoint every
~500ms and turns a real CENTER-button press into a `households/{id}/alerts` record via the
`raiseFamilyAlert` callable (`functions/src/alerts.ts`).

## Heartbeat (03-FIX)

The Pi's `pi/lamp.py` has a 60-second watchdog that reverts the lamp to `idle` if it hasn't
received a `POST /state` in that window — this is the "the bridge died" safety net. Because the
bridge previously only POSTed when `lamp/current` actually *changed* in Firestore, any call that
sat in the same state for more than 60 seconds (e.g. `verified` while everyone chats) got
silently reverted to `idle` on the Pi even though the bridge was alive and the Firestore
document still correctly said `verified`.

The bridge now re-POSTs the last known `lamp/current` state every 20 seconds — comfortably
inside the 60s window — in addition to POSTing immediately on every real Firestore change
(including the snapshot Firestore redelivers right after a reconnect). The watchdog now only
ever fires when the bridge process itself is gone, not merely because nothing changed.

## Joystick contract (03-FIX)

`GET /joystick` returns `{"pressed": bool, "demoState": "<state>|null"}`:

- **`pressed`** is a one-shot flag the Pi sets **only** on a real CENTER-button press and
  clears on every read. Direction presses (up/down/left/right), which drive the Pi's local
  demo-mode state cycle, never set this flag. The bridge treats `pressed === true` as the sole
  trigger for `raiseFamilyAlert` — nothing else raises an alert. As defense in depth, the bridge
  also enforces its own 5-second debounce client-side before calling the callable again.
- **`demoState`** mirrors whatever state is currently active on the Pi (bridge-driven or
  joystick-cycled). It's informational only — the bridge logs it when it changes, but never
  writes it to Firestore and never lets it influence the alert decision.

## Hue (03-HUE)

In addition to the Pi's Sense HAT lamp, the bridge optionally mirrors `lamp/current` onto every
reachable Philips Hue bulb (`bridge/hue.mjs`), over the same link-local LAN as the Pi -- no
internet required. This is purely additive: the Pi lamp path is unaffected whether or not Hue is
configured.

**Setup:** `bridge/hue-local.json` (gitignored, never committed) holds the paired app key:

```json
{ "ip": "169.254.12.12", "username": "<paired-app-key>" }
```

If this file is missing, or `HUE_DISABLED=1` is set in the environment, Hue is disabled and the
bridge logs `hue: disabled` once at startup -- everything else runs exactly as before.

**Re-pairing** (if the app key is lost or revoked): press the physical link button on the Hue
Bridge, then within 30 seconds:

```bash
curl -X POST http://169.254.12.12/api -d '{"devicetype":"porchlight#mac"}'
```

The response's `success.username` is the new app key -- write it into `bridge/hue-local.json`.

**Adding bulbs:** power on any additional Hue bulb already paired to this Hue Bridge (or use the
Hue app to pair a new one) -- it appears as `reachable: true` in `GET /api/<user>/lights` with no
bridge restart needed, since `bridge/hue.mjs` always targets Hue's built-in "all lights" group
(`groups/0/action`) rather than an explicit list of light IDs.

**State -> color mapping** (Hue v1 REST units: `hue` 0-65535, `sat` 0-254, `bri` 1-254):

| `lamp/current` state | Color | Effect |
| --- | --- | --- |
| `idle` / `ended` | warm amber (`hue:8000 sat:200 bri:120`) | solid |
| `screening` / `verifying` | blue (`hue:46000 sat:254`) | breathing: alternates `bri` 200/90 every 1.5s |
| `verified` | green (`hue:25500 sat:254 bri:254`) | solid |
| `scam` | red (`hue:0 sat:254 bri:254`) | `alert:"lselect"` flash, re-asserted every 15s |

The breathing effect is a manual `bri` alternation rather than Hue's built-in `alert:"lselect"` --
`lselect` reads as a sharp on/off blink, which felt too alarming for "we're screening this call."
`scam` uses `lselect` on purpose, since a scam call *should* read as urgent.

Hue state is re-asserted on the same 20s heartbeat cadence as the Pi's `/state` POST (see above),
so a bulb that misses one request (Wi-Fi/LAN blip, Hue Bridge busy) re-syncs automatically on the
next tick -- no separate watchdog needed on the Hue side.

## Running it

```bash
pnpm run lamp:bridge
```

Run this from the repo root (pnpm scripts always run from there, so `bridge/index.mjs`'s
relative config-file lookups resolve correctly). Leave it running for the whole demo — it's a
long-lived process, not a one-shot script.

Override the Pi's address (default `http://169.254.10.2:8080`) with `PI_URL`:

```bash
PI_URL=http://169.254.10.2:8080 pnpm run lamp:bridge
```

## Where its Firebase config comes from

The bridge uses **exactly the same public web Firebase config** `apps/web` already uses
(`apiKey`/`authDomain`/`projectId`/`appId` — none of this is secret; it ships in every visitor's
browser bundle). No service-account JSON, no new credential type.

It looks for config in this order:

1. `apps/web/.env.local` (the real file `apps/web` itself reads — gitignored, same as every
   other `.env.local` in this repo).
2. `bridge/.env.local` (also gitignored) as a fallback, for a checkout that doesn't already have
   `apps/web/.env.local` populated.

If neither exists, generate the fallback once:

```bash
pnpm run lamp:bridge:config
```

This runs `firebase apps:sdkconfig WEB --project porchlight-hack` (a CLI call to Firebase's own
servers, not a file read) and writes `bridge/.env.local` directly — no secret value is ever
printed to the console or committed (`.gitignore`'s `.env.*` pattern covers it).

## `DEMO_HOUSEHOLD_ID`

`bridge/index.mjs` declares a top-level constant:

```js
const DEMO_HOUSEHOLD_ID = 'demo';
```

This is the only household this hackathon build ever seeds
(`packages/shared/src/households.ts`'s `DEMO_HOUSEHOLD_ID`). Change this constant if a future
phase seeds a different household for a live (non-demo) run — the joystick poll loop passes it
directly to the `raiseFamilyAlert` callable.

## Manual verification runbook (no telephony required)

This exercises the full path — Function mirror → bridge `onSnapshot` → HTTP POST → Pi render —
with no telephony and no dependency on Phase 2 being finished.

**Note:** the Firebase CLI installed for this project (15.22.4) does **not** have a
`firestore:set` command (it was removed/renamed upstream from the version 03-RESEARCH.md's code
examples assumed). Use one of these two methods instead:

### Method A — Firebase Console (no setup)

Open the [Firestore console for `porchlight-hack`](https://console.firebase.google.com/project/porchlight-hack/firestore/data)
and create/edit `calls/demo` by hand for each state below.

### Method B — a short Admin SDK script (scriptable, repeatable)

Requires `gcloud auth application-default login` once (or `GOOGLE_APPLICATION_CREDENTIALS` set
to a service-account key). Run from `functions/` so Node resolves the already-installed
`firebase-admin` dependency:

```bash
cd functions
node -e '
import("firebase-admin/app").then(async ({ initializeApp, applicationDefault }) => {
  const { getFirestore } = await import("firebase-admin/firestore");
  initializeApp({ credential: applicationDefault(), projectId: "porchlight-hack" });
  const db = getFirestore();
  await db.doc("calls/demo").set({
    householdId: "demo",
    state: "scam",                 // change per step below
    from: "+15550001234",
    startedAt: Date.now(),
    provider: "simulator",
    turns: [],
    risk: { score: 90, tactics: ["urgency"], claimedIdentity: "Brenden", recommendedAction: "end", updatedAt: Date.now() },
  }, { merge: true });
  console.log("wrote calls/demo");
  process.exit(0);
});
'
```

Walk through every state, watching the Pi (or `curl http://169.254.10.2:8080/health` /
`GET /health` on the Pi) after each write:

| Step | `state` | Extra fields | Expected Pi render |
|---|---|---|---|
| 1 | `screening` | `risk.claimedIdentity: "Brenden"` | Blue breathing pulse |
| 2 | `verifying` | (same) | Blue breathing pulse (faster feel, same color) |
| 3 | `verified` | `verification: { memberId: "brenden", answer: "yes" }` — requires a seeded `households/demo` doc with a member whose `id` is `"brenden"` | Green + scrolling first name ("BRENDEN") |
| 4 | `scam` | `risk.claimedIdentity: "Brenden"` | Red/black flash |
| 5 | `ended` | — | Reverts to idle (amber breathe) within ~1s |

Seed a demo household once, if `households/demo` doesn't exist yet:

```bash
cd functions
node -e '
import("firebase-admin/app").then(async ({ initializeApp, applicationDefault }) => {
  const { getFirestore } = await import("firebase-admin/firestore");
  initializeApp({ credential: applicationDefault(), projectId: "porchlight-hack" });
  await getFirestore().doc("households/demo").set({
    name: "Demo Household",
    seniorName: "Grandma Rose",
    members: [{ id: "brenden", name: "Brenden", relation: "grandson", aliases: [], passkeyCredentialIds: [] }],
  });
  console.log("seeded households/demo");
  process.exit(0);
});
'
```

### Pre-deploy fallback (if `mirrorActiveCallToLamp` isn't deployed yet)

Skip the `calls/demo` write and set `lamp/current` directly with the same Admin SDK pattern above
(swap `calls/demo` for `lamp/current` and drop the `calls`-only fields) — the bridge and Pi side
are fully exercised either way, since the bridge only ever watches `lamp/current`.

### Joystick / alert check

The Pi's `/joystick` endpoint can't be triggered without physically pressing the Sense HAT
joystick. To exercise the `raiseFamilyAlert` callable path without hardware:

```bash
curl -X POST "https://us-central1-porchlight-hack.cloudfunctions.net/raiseFamilyAlert" \
  -H 'content-type: application/json' \
  -d '{"data":{"householdId":"demo"}}'
# -> {"result":{"id":"..."}}; check households/demo/alerts/{id} in the console
```

An actual physical joystick press producing a visible dashboard alert is a Phase 4 follow-up (the
dashboard doesn't exist yet).
