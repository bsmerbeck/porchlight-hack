#!/usr/bin/env node
// bridge/write-config.mjs — run via `pnpm run lamp:bridge:config`.
//
// Fetches the public Firebase web SDK config (apiKey/authDomain/projectId/appId — none of this
// is secret; it ships in every visitor's browser bundle) via `firebase apps:sdkconfig WEB` and
// writes it to bridge/.env.local (gitignored, same VITE_FIREBASE_* shape as apps/web/.env.local)
// as a fallback config source for bridge/index.mjs, for a checkout that doesn't already have
// apps/web/.env.local populated. Never prints the values to the console.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const project = process.env.FIREBASE_PROJECT ?? 'porchlight-hack';

let raw;
try {
  raw = execFileSync('firebase', ['apps:sdkconfig', 'WEB', '--project', project], { encoding: 'utf8' });
} catch (err) {
  console.error(`[lamp:bridge:config] \`firebase apps:sdkconfig WEB --project ${project}\` failed:`, err.message);
  process.exit(1);
}

// The CLI prints a status line before the JSON payload; take everything from the first '{'.
const jsonStart = raw.indexOf('{');
if (jsonStart === -1) {
  console.error('[lamp:bridge:config] Unexpected CLI output (no JSON payload found).');
  process.exit(1);
}
const cfg = JSON.parse(raw.slice(jsonStart));

const missing = ['apiKey', 'authDomain', 'projectId', 'appId'].filter((k) => !cfg[k]);
if (missing.length > 0) {
  console.error(`[lamp:bridge:config] CLI output is missing: ${missing.join(', ')}`);
  process.exit(1);
}

const lines = [
  `VITE_FIREBASE_API_KEY=${cfg.apiKey}`,
  `VITE_FIREBASE_AUTH_DOMAIN=${cfg.authDomain}`,
  `VITE_FIREBASE_PROJECT_ID=${cfg.projectId}`,
  `VITE_FIREBASE_APP_ID=${cfg.appId}`,
  '',
].join('\n');

const outPath = resolve(process.cwd(), 'bridge/.env.local');
writeFileSync(outPath, lines);
console.log(`[lamp:bridge:config] wrote ${outPath} (values not printed)`);
