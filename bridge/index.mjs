#!/usr/bin/env node
// bridge/index.mjs — the Mac-side relay (Phase 3 Plan 02).
//
// Watches `lamp/current` in Firestore (mirrored from `calls/{id}` by
// functions/src/lamp.ts's mirrorActiveCallToLamp) and POSTs the state to the Pi's lamp
// service (pi/lamp.py) over the direct ethernet cable — never over Wi-Fi (CLAUDE.md
// network constraint). Also polls the Pi's /joystick endpoint and turns a press into a
// household alert via the raiseFamilyAlert callable (functions/src/alerts.ts).
//
// Uses exactly the same public web Firebase config apps/web already uses (apiKey/authDomain/
// projectId/appId — none of this is secret, it ships in every visitor's browser bundle) so no
// service-account JSON or other new credential type is introduced (RESEARCH.md Don't Hand-Roll:
// "Firestore auth for the bridge").
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

// The static IPv4 link-local address assigned to the Pi's ethernet interface (03-RESEARCH.md
// Pattern 5 / Pitfall 2 — plain IPv4 sidesteps Node fetch()'s unreliable IPv6 zone-id support).
// Override via PI_URL for local testing against a different host.
const PI_URL = process.env.PI_URL ?? 'http://169.254.10.2:8080';

// The single demo household this repo ever seeds (packages/shared/src/households.ts's
// DEMO_HOUSEHOLD_ID). Change this constant once Phase 2/4 seeds a real household for a live
// (non-demo) run.
const DEMO_HOUSEHOLD_ID = 'demo';

const JOYSTICK_POLL_MS = 500;

// --- Firebase config loader --------------------------------------------------------------
//
// Reads the same gitignored `.env.local` convention apps/web already uses
// (`VITE_FIREBASE_API_KEY` etc., see apps/web/src/lib/firebase.ts), parsed with plain string
// splitting — no new dotenv-style dependency. Prefers apps/web/.env.local (the real file, since
// pnpm scripts always run from the repo root); falls back to bridge/.env.local (also gitignored,
// same shape) for a bridge-only checkout. Populate the fallback via `pnpm run lamp:bridge:config`.
function loadFirebaseConfig() {
  const candidates = [resolve(process.cwd(), 'apps/web/.env.local'), resolve(process.cwd(), 'bridge/.env.local')];
  const envPath = candidates.find((p) => existsSync(p));
  if (!envPath) {
    throw new Error(
      `[bridge] No Firebase web config found. Looked for:\n  ${candidates.join('\n  ')}\n` +
        'Run `pnpm run lamp:bridge:config` to generate bridge/.env.local from `firebase apps:sdkconfig WEB`.',
    );
  }

  const vars = {};
  for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key.startsWith('VITE_FIREBASE_')) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }

  const config = {
    apiKey: vars.VITE_FIREBASE_API_KEY,
    authDomain: vars.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: vars.VITE_FIREBASE_PROJECT_ID,
    appId: vars.VITE_FIREBASE_APP_ID,
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`[bridge] ${envPath} is missing required key(s): ${missing.join(', ')}`);
  }

  console.log(`[bridge] loaded Firebase config from ${envPath}`);
  return config;
}

const app = initializeApp(loadFirebaseConfig());
const db = getFirestore(app);
const fns = getFunctions(app, 'us-central1');
const raiseFamilyAlert = httpsCallable(fns, 'raiseFamilyAlert');

// --- State relay: lamp/current -> POST /state -------------------------------------------

console.log(`[bridge] watching lamp/current -> POST ${PI_URL}/state`);

onSnapshot(
  doc(db, 'lamp', 'current'),
  async (snap) => {
    const data = snap.data();
    if (!data) return;
    try {
      const res = await fetch(`${PI_URL}/state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: data.state, name: data.name ?? undefined }),
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) {
        console.error(`[bridge] Pi rejected /state POST: HTTP ${res.status}`);
      } else {
        console.log(`[bridge] lamp -> ${data.state}${data.name ? ` (${data.name})` : ''}`);
      }
    } catch (err) {
      // Pi unreachable this tick (cable unplugged, Pi rebooting, etc.) — the Pi's own 60s
      // watchdog (pi/lamp.py) reverts to idle independently, so we just log and move on.
      console.error('[bridge] POST /state failed:', err?.message ?? err);
    }
  },
  (err) => {
    console.error('[bridge] onSnapshot error:', err?.message ?? err);
  },
);

// --- Joystick poll loop: GET /joystick -> raiseFamilyAlert callable ----------------------
//
// Polls every ~500ms; on {"pressed": true} calls the raiseFamilyAlert callable for the demo
// household. Wrapped so a Pi-unreachable tick or a callable failure logs and moves on without
// ever crashing the bridge process (T-03-09 — DoS via a hung/failing fetch).
setInterval(async () => {
  try {
    const res = await fetch(`${PI_URL}/joystick`, { signal: AbortSignal.timeout(1000) });
    if (!res.ok) return;
    const { pressed } = await res.json();
    if (pressed) {
      console.log('[bridge] joystick press detected -> raiseFamilyAlert');
      await raiseFamilyAlert({ householdId: DEMO_HOUSEHOLD_ID });
    }
  } catch (err) {
    // Pi unreachable or callable failed this tick — try again next tick.
    console.error('[bridge] joystick poll tick failed:', err?.message ?? err);
  }
}, JOYSTICK_POLL_MS);
