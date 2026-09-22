#!/usr/bin/env node
// scripts/seed-allowlist.mjs — run via `node scripts/seed-allowlist.mjs`.
//
// 05-ALLOWLIST Task 1: one-off (and re-runnable) seed of households/demo.allowlist so a
// known number gets the allowlist pass-through (elevenlabsPersonalization.ts) without
// waiting for a full resetDemo() run. Talks to the Firestore REST API directly with an
// Application Default Credentials (ADC) access token -- mirrors demo-reset.mjs's own
// "no Admin SDK / service-account credential file needed on this machine" convention,
// just via `gcloud auth application-default print-access-token` instead of a Cloud
// Function's callable protocol, since this needs a Firestore field-mask PATCH.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(new URL('.', import.meta.url).pathname, '..');

function projectId() {
  const firebasercPath = resolve(REPO_ROOT, '.firebaserc');
  const firebaserc = JSON.parse(readFileSync(firebasercPath, 'utf8'));
  return process.env.FIREBASE_PROJECT ?? firebaserc.projects.default;
}

function accessToken() {
  return execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], {
    encoding: 'utf8',
  }).trim();
}

// Kept in sync by hand with resetDemo.ts's DEMO_HOUSEHOLD_BASELINE.allowlist and
// runTurn.ts's own fallback seed -- three copies of one literal, same tradeoff already
// accepted for the members[] baseline in this codebase.
const ALLOWLIST = [{ number: '+14014979735', name: 'Brenden Smerbeck', relation: 'grandson' }];

function toFirestoreValue(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (value && typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) fields[k] = toFirestoreValue(v);
    return { mapValue: { fields } };
  }
  throw new Error(`toFirestoreValue: unsupported type for ${JSON.stringify(value)}`);
}

async function main() {
  const project = projectId();
  const token = accessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/households/demo?updateMask.fieldPaths=allowlist`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: { allowlist: toFirestoreValue(ALLOWLIST) } }),
  });

  const body = await res.json();
  if (!res.ok) {
    console.error('[seed-allowlist] Firestore PATCH failed:', JSON.stringify(body));
    process.exit(1);
  }

  console.log('[seed-allowlist] households/demo.allowlist seeded:', JSON.stringify(ALLOWLIST));
}

main().catch((err) => {
  console.error('[seed-allowlist] unexpected error:', err);
  process.exit(1);
});
