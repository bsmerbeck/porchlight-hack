---
phase: 06-demo-polish-and-workflow-hardening
plan: 06-B
subsystem: bridge / venue ops / demo reset
tags: [bridge, hue, pi, firestore-rules, resetDemo, venue]
requires: [lamp/current mirror (03), resetDemo (05), Hue integration (03-HUE)]
provides: [settle-to-ready lamp, status/bridge doc, status/demo doc, pnpm venue:up, pnpm venue:search]
affects: [apps/web OperatorBar (reads status/bridge), reset toast (reads status/demo)]
key-files:
  created: [bridge/settle.mjs, bridge/settle.test.mjs, scripts/venue-up.mjs]
  modified: [bridge/index.mjs, bridge/hue.mjs, bridge/README.md, firestore.rules, functions/src/demo/resetDemo.ts, functions/src/demo/resetDemo.test.ts, scripts/demo-check.sh, package.json, DEMO.md]
decisions:
  - "Settle is bridge-local: the Pi and Hue go to idle 20s after updatedAt; lamp/current in Firestore is never written"
  - "The settle delay is clamped to [0, 20s], so Mac/server clock skew can never stretch the hold"
  - "status/bridge is writable without auth, but only in the exact shape. Demo-grade risk accepted"
status: complete
completed: 2026-09-22
plan_head_before: ef04552
commits: 5
---

# Phase 6 Plan 06-B: Room settles, venue bring-up, bridge status Summary

The bridge now sends the Pi and every Hue bulb back to idle 20 s after a verdict, without writing to Firestore. It writes a public, shape-locked `status/bridge` heartbeat doc. resetDemo also clears alerts and writes a `status/demo {resetAt}` marker. `pnpm venue:up` finds the ethernet link, the Pi, the Hue Bridge and every bulb, and sweeps colours on all of them.

## Shapes for the UI executors (exact)

```ts
// status/bridge (public get; written by the Mac bridge every 20s, on each lamp change, and on settle)
type BridgeStatus = {
  piOk: boolean;           // Pi GET /health returned ok:true
  piState: string | null;  // Pi's current render state (idle|screening|verifying|verified|scam|ended), null if unreachable
  hueReachable: number;    // reachable Hue bulbs (0 if Hue disabled/unreachable)
  hueTotal: number;        // all bulbs known to the Hue Bridge
  lastBeat: number;        // epoch ms, Mac clock. Treat as stale if Date.now() - lastBeat > ~45000
  version: string;         // "06-B"
};

// status/demo (public get; written only by resetDemo via Admin SDK, as the last step of a successful reset)
type DemoStatus = { resetAt: number }; // epoch ms. Show "Reset ✓" when resetAt changes / is recent
```

The resetDemo callable now returns `{ callsDeleted, promptsCleared, alertsCleared, resetAt }`.

## Live verification (real hardware, 2026-09-22)

`pnpm venue:up` (no --search):

```
DEVICE                 ADDRESS                    STATUS   DETAILS
---------------------  -------------------------  -------  ----------------------------------------
Ethernet link          en8 169.254.228.9          OK       active, link-local address
Raspberry Pi lamp      169.254.10.2:8080          OK       state=idle rotation=180
Hue Bridge             169.254.12.12              OK       Hue Bridge BSB002 api 1.78.0 via known IP
  bulb #1              BR1                        OFF      Hue color lamp
  bulb #2              BR3                        OFF      Hue color lamp
  bulb #3              Living Room Four           OFF      Hue color lamp
  bulb #4              BR2                        OK       Hue color lamp
  bulb #5              Living Room Three          OFF      Hue color lamp
  bulb #6              Living Room One            OFF      Hue color lamp
  bulb #7              Living Room Two            OFF      Hue color lamp
Hue bulbs reachable    169.254.12.12              OK       1/7

GO -- Pi + Hue Bridge up, 1 bulb(s) reachable. Start the bridge: pnpm lamp:bridge
```

(On the first run the Pi answered only on the `smerbs.local` fallback. I added a second probe round because the Pi's single-threaded server can miss a request while the running bridge polls it every 500 ms. After that change it answers on 169.254.10.2.)

- **Settle:** my own bridge instance (PID 83945, stopped by that PID) was running. I set `lamp/current = scam` with admin+ADC at 17:44:29Z and the Pi showed `scam` right away. My bridge logged `scam held 20s -> settling room to idle (Firestore untouched)`. The Pi `/health` was `idle` on the final polls (t+27 s through t+35 s), and Firestore `lamp/current` still read `{"state":"scam",...}`. The Pi log shows idle, then scam, then idle. The **user's older bridge tab** (pre-06-B code) re-sent `scam` on its 20 s heartbeat, and my heartbeat put the Pi back to idle. That tab has to be restarted.
- **status/bridge:** anonymous Firestore REST GET returned HTTP 200 with `{piOk:true, piState:"idle", hueReachable:1, hueTotal:7, lastBeat:1790099035908, version:"06-B"}`. An anonymous PATCH with an extra key returned **403**, and an anonymous write to `status/demo` also returned **403**.
- **Reset:** `pnpm demo:reset` returned `{"callsDeleted":0,"promptsCleared":0,"alertsCleared":3,"resetAt":1790099149284}`. `status/demo` is publicly readable (200). `lamp/current` was restored to idle.
- `bash scripts/demo-check.sh`: GO, 12/12 checks, including the new `Hue bulbs reachable >= 1   PASS  reachable bulbs 1/7`.
- Tests: `node --test bridge/settle.test.mjs` 6/6 pass. `vitest resetDemo.test.ts` 5/5 pass. The functions `tsc --noEmit` is clean.
- Deployed: `firestore:rules` and `functions:resetDemo` (both "Deploy complete").

## Deviations from Plan

- Tasks 1 and 2 share one commit (7b4d774). Both edit `bridge/index.mjs`, and splitting them would have cost time against the deadline.
- [Rule 2] Settle delay is clamped to at most 20 s so clock skew cannot extend the hold.
- [Rule 1] venue:up probes the Pi twice (see above).
- My test bridge ran with the main checkout as cwd, so it used that checkout's gitignored web config and `hue-local.json` directly. Nothing secret was copied into the worktree except the two files the orchestrator named.

## Operator action required

**Restart the user's bridge tab** (`Ctrl-C`, then `pnpm lamp:bridge`) once this is merged. The running instance is old code. It will not settle, will not write `status/bridge`, and will fight the settle of any new instance.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: unauth-write | firestore.rules | `status/bridge` is writable by anyone in the exact 6-key shape (bridge has no auth). Worst case: a spoofed operator status row. Accepted as demo-grade. |

## Self-Check: PASSED
- Files exist: bridge/settle.mjs, bridge/settle.test.mjs, scripts/venue-up.mjs
- Commits 7b4d774, 82a27ab, 49b16f2, a4f788f are present on the worktree branch
