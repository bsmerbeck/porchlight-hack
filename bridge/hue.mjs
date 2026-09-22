#!/usr/bin/env node
// bridge/hue.mjs — optional Philips Hue integration (Phase 3 Hue extra).
//
// Drives every reachable Hue bulb (via the Hue Bridge v2 REST API, `groups/0/action` -- the
// built-in "all lights" group, so one request updates every reachable bulb) to mirror the same
// `lamp/current` state the Pi's Sense HAT lamp renders (bridge/index.mjs). Hue is entirely
// optional: if `bridge/hue-local.json` is missing, unreadable, or `HUE_DISABLED=1` is set, every
// export here becomes a no-op and index.mjs keeps working exactly as it did before this file
// existed. A Hue Bridge request failing (bridge unreachable, a bulb powered off, LAN hiccup)
// is caught, logged, and never crashes the bridge process -- same resilience contract as
// `postState()` in index.mjs for the Pi.
//
// Local-only, no internet: the Hue Bridge (v2, API 1.78) sits link-local on the same switch as
// the Mac and Pi (03-HUE facts). `bridge/hue-local.json` (gitignored) holds `{ip, username}` for
// the already-paired app key -- never printed, never committed.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Deciseconds (Hue's own transition-time unit) for a smooth 1s color change on state transitions.
const TRANSITION_TIME = 10;

// "Calm breathe" cadence for screening/verifying: alternate brightness every 1.5s rather than
// Hue's built-in `alert: "lselect"` effect (a sharp on/off blink) -- "we're screening this call"
// should read as attentive, not alarming. Transition time is set just under the tick interval so
// each fade completes before the next tick fires, producing a smooth pulse instead of a snap.
const BREATHE_INTERVAL_MS = 1500;
const BREATHE_TRANSITION_TIME = 13; // 1.3s, in deciseconds
const BREATHE_BRI_HIGH = 200;
const BREATHE_BRI_LOW = 90;

// Scam re-asserts a fresh 15s `alert: "lselect"` flash on this cadence so the flash never goes
// quiet if a call sits in `scam` for longer than one Hue alert cycle.
const SCAM_ALERT_REASSERT_MS = 15_000;

// hue: 0-65535, sat: 0-254, bri: 1-254 (Hue v1 REST units).
const COLORS = {
  idle: { hue: 8000, sat: 200, bri: 120 }, // warm amber
  screening: { hue: 46000, sat: 254, bri: 200 }, // blue
  verifying: { hue: 46000, sat: 254, bri: 200 }, // blue (same as screening)
  verified: { hue: 25500, sat: 254, bri: 254 }, // green
  scam: { hue: 0, sat: 254, bri: 254 }, // red
  ended: { hue: 8000, sat: 200, bri: 120 }, // same as idle
};

const BREATHE_STATES = new Set(['screening', 'verifying']);

let hueConfig = null; // { ip, username } | null -- null means "disabled"
let currentState = null;
let breatheHandle = null;
let scamHandle = null;

/**
 * Loads `bridge/hue-local.json` relative to `process.cwd()` (pnpm scripts always run from the
 * repo root, same convention as index.mjs's `loadFirebaseConfig`). Returns the parsed
 * `{ip, username}` config, or `null` if Hue should be disabled for any reason (missing file,
 * `HUE_DISABLED=1`, malformed JSON, missing keys). Never throws -- Hue is optional by contract.
 */
export function loadHue() {
  if (process.env.HUE_DISABLED === '1') {
    console.log('[bridge] hue: disabled (HUE_DISABLED=1)');
    hueConfig = null;
    return null;
  }

  const path = resolve(process.cwd(), 'bridge/hue-local.json');
  if (!existsSync(path)) {
    console.log(`[bridge] hue: disabled (no ${path})`);
    hueConfig = null;
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed.ip || !parsed.username) {
      console.error(`[bridge] hue: ${path} is missing "ip" or "username" -- hue disabled`);
      hueConfig = null;
      return null;
    }
    hueConfig = { ip: parsed.ip, username: parsed.username };
    console.log(`[bridge] hue: loaded config from ${path}`);
    return hueConfig;
  } catch (err) {
    console.error(`[bridge] hue: failed to parse ${path}: ${err?.message ?? err} -- hue disabled`);
    hueConfig = null;
    return null;
  }
}

async function countReachable() {
  try {
    const res = await fetch(`http://${hueConfig.ip}/api/${hueConfig.username}/lights`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    const lights = await res.json();
    return Object.values(lights).filter((l) => l?.state?.reachable).length;
  } catch (err) {
    console.error('[bridge] hue: GET /lights failed:', err?.message ?? err);
    return null;
  }
}

async function putGroupAction(body) {
  try {
    const res = await fetch(`http://${hueConfig.ip}/api/${hueConfig.username}/groups/0/action`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      console.error(`[bridge] hue: PUT /groups/0/action rejected: HTTP ${res.status}`);
    }
  } catch (err) {
    // Hue Bridge unreachable this tick, a bulb dropped off the mesh, etc. -- log and move on,
    // never crash the bridge process over an ambient-light side effect.
    console.error('[bridge] hue: PUT /groups/0/action failed:', err?.message ?? err);
  }
}

function stopEffects() {
  if (breatheHandle) {
    clearInterval(breatheHandle);
    breatheHandle = null;
  }
  if (scamHandle) {
    clearInterval(scamHandle);
    scamHandle = null;
  }
}

function startBreathe(color) {
  let high = true;
  putGroupAction({
    on: true,
    hue: color.hue,
    sat: color.sat,
    bri: BREATHE_BRI_HIGH,
    alert: 'none',
    transitiontime: TRANSITION_TIME,
  });
  breatheHandle = setInterval(() => {
    high = !high;
    putGroupAction({ bri: high ? BREATHE_BRI_HIGH : BREATHE_BRI_LOW, transitiontime: BREATHE_TRANSITION_TIME });
  }, BREATHE_INTERVAL_MS);
}

function startScam(color) {
  putGroupAction({
    on: true,
    hue: color.hue,
    sat: color.sat,
    bri: color.bri,
    alert: 'lselect',
    transitiontime: TRANSITION_TIME,
  });
  scamHandle = setInterval(() => {
    putGroupAction({ alert: 'lselect' });
  }, SCAM_ALERT_REASSERT_MS);
}

/**
 * Mirrors `lamp/current`'s `state` (and optional `name`) onto every reachable Hue bulb via
 * group 0. Called on both real state changes AND the same 20s heartbeat index.mjs already uses
 * for the Pi, so a Hue Bridge that misses one request (transient LAN blip) re-syncs on the next
 * heartbeat tick automatically -- no separate watchdog needed on the Hue side.
 *
 * No-ops silently if `loadHue()` returned `null` (Hue disabled) -- safe to call unconditionally
 * from index.mjs without checking a separate "is Hue enabled" flag at every call site.
 */
export async function setHueState(state, name) {
  if (!hueConfig) return;

  const isNewState = state !== currentState;
  currentState = state;

  if (isNewState) {
    stopEffects();
  }

  const color = COLORS[state] ?? COLORS.idle;

  if (BREATHE_STATES.has(state)) {
    if (isNewState) startBreathe(color);
    // else: the breathe interval is already re-asserting on its own 1.5s cadence -- nothing
    // more to do for this heartbeat tick.
  } else if (state === 'scam') {
    if (isNewState) startScam(color);
    // else: the scam interval is already re-asserting `alert: "lselect"` on its own cadence.
  } else {
    // idle / verified / ended / any unmapped state -- solid color, no effect loop running, so
    // re-send on every call (both a real change AND every heartbeat tick) since nothing else
    // keeps the bulbs in sync for a state with no interval of its own.
    await putGroupAction({
      on: true,
      hue: color.hue,
      sat: color.sat,
      bri: color.bri,
      alert: 'none',
      transitiontime: TRANSITION_TIME,
    });
  }

  if (isNewState) {
    const n = await countReachable();
    console.log(`[bridge] hue -> ${state}${name ? ` (${name})` : ''} (${n ?? '?'} reachable lights)`);
  }
}
