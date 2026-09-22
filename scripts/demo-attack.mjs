#!/usr/bin/env node
// scripts/demo-attack.mjs — run via `pnpm demo:attack`.
//
// ATK-01/ATK-02: one-command launch of the consented cloned-voice attacker call. POSTs to
// the deployed `attackCall` onCall Function using the same callable-protocol POST shape
// already proven live for resetDemo (`{"data": {...}}` in, `{"result": {...}}` or
// `{"error": {...}}` out) -- no Firebase Admin SDK / service-account credential needed on
// this machine. Never accepts a destination number as input; the callable itself hardcodes
// the Porchlight number (see functions/src/attack/attackCall.ts).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(new URL('.', import.meta.url).pathname, '..');

// DEMO_TOKEN is gitignored (scripts/.demo.env) -- never committed, never printed. Loaded
// only if the shell doesn't already have DEMO_TOKEN set, mirroring demo-reset.mjs's own
// plain-string .env parser (no new dotenv-style dependency).
function loadDemoEnvIfNeeded() {
  if (process.env.DEMO_TOKEN) return;
  const envPath = resolve(REPO_ROOT, 'scripts/.demo.env');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === 'DEMO_TOKEN' && !process.env.DEMO_TOKEN) {
      process.env.DEMO_TOKEN = value;
    }
  }
}

function projectId() {
  const firebasercPath = resolve(REPO_ROOT, '.firebaserc');
  const firebaserc = JSON.parse(readFileSync(firebasercPath, 'utf8'));
  return process.env.FIREBASE_PROJECT ?? firebaserc.projects.default;
}

async function main() {
  loadDemoEnvIfNeeded();

  const token = process.env.DEMO_TOKEN;
  if (!token) {
    console.error(
      '[demo:attack] DEMO_TOKEN is not set. Export it or write it to scripts/.demo.env (gitignored) as DEMO_TOKEN=<value>.',
    );
    process.exit(1);
  }

  const project = projectId();
  const url = `https://us-central1-${project}.cloudfunctions.net/attackCall`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: { token } }),
  });
  const body = await res.json();

  if (body.error) {
    console.error(`[demo:attack] attackCall failed: ${JSON.stringify(body.error)}`);
    process.exit(1);
  }

  console.log(JSON.stringify(body.result ?? body));
}

main().catch((err) => {
  console.error('[demo:attack] unexpected error:', err);
  process.exit(1);
});
