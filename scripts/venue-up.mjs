#!/usr/bin/env node
// scripts/venue-up.mjs — one-command venue bring-up (Phase 6, D-11).
//
//   pnpm venue:up        find ethernet link, Pi, Hue Bridge + every bulb; colour sweep; GO/NO-GO
//   pnpm venue:search    same, but first ask the Hue Bridge to search for NEW bulbs (~40s)
//
// Node 24 stdlib only. Everything is link-local over the USB-ethernet switch (no internet
// needed) except the last-resort Hue cloud discovery. bridge/hue-local.json holds the paired
// Hue app key: it is read and (if the bridge IP moved) rewritten, but never printed.
// Exits 1 if the Pi or the Hue Bridge could not be found.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HUE_LOCAL = resolve(ROOT, 'bridge/hue-local.json');
const PI_CANDIDATES = [process.env.PI_URL, 'http://169.254.10.2:8080', 'http://smerbs.local:8080'].filter(Boolean);
const SEARCH = process.argv.includes('--search');
const SEARCH_WAIT_S = 40;

const rows = []; // [device, address, status, details]
const ok = (b) => (b ? 'OK' : 'MISSING');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, opts = {}, timeoutMs = 2000) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Run a command for at most `ms`, returning whatever it printed (dns-sd never exits on its own).
function runFor(cmd, args, ms) {
  return new Promise((resolveOut) => {
    let out = '';
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return resolveOut('');
    }
    child.stdout.on('data', (d) => (out += d));
    child.on('error', () => resolveOut(out));
    const t = setTimeout(() => child.kill('SIGTERM'), ms);
    child.on('close', () => {
      clearTimeout(t);
      resolveOut(out);
    });
  });
}

// --- 1. Ethernet link ------------------------------------------------------------------------
function findEthernet() {
  let text = '';
  try {
    text = execFileSync('ifconfig', { encoding: 'utf8' });
  } catch {
    return null;
  }
  const blocks = text.split(/\n(?=\S)/);
  const found = [];
  for (const b of blocks) {
    const name = b.split(':')[0];
    if (!/^en\d+$/.test(name)) continue;
    if (!/status: active/.test(b)) continue;
    const ll = b.match(/inet (169\.254\.\d+\.\d+)/);
    const any = b.match(/inet (\d+\.\d+\.\d+\.\d+)/);
    found.push({ name, ip: ll?.[1] ?? any?.[1] ?? null, linkLocal: Boolean(ll) });
  }
  // Prefer an interface that already has a 169.254 address (that's the Pi/Hue switch).
  return found.find((f) => f.linkLocal) ?? null;
}

// --- 2. Pi -------------------------------------------------------------------------------------
async function findPi() {
  // Two rounds: the Pi's single-threaded HTTP server can miss one request while it is busy
  // serving the running bridge's 500ms joystick poll.
  for (let round = 0; round < 2; round++) {
    for (const base of PI_CANDIDATES) {
      try {
        const h = await getJson(`${base}/health`, {}, 2500);
        if (h?.ok === true) return { base, health: h };
      } catch {
        /* next candidate */
      }
    }
  }
  return null;
}

// --- 3. Hue Bridge -------------------------------------------------------------------------------
async function isHueBridge(ip) {
  try {
    const cfg = await getJson(`http://${ip}/api/config`, {}, 2000);
    return cfg?.bridgeid ? cfg : null;
  } catch {
    return null;
  }
}

async function mdnsHueIps() {
  const browse = await runFor('dns-sd', ['-B', '_hue._tcp', 'local.'], 4000);
  const names = [...browse.matchAll(/\s_hue\._tcp\.\s+(.+)$/gm)].map((m) => m[1].trim());
  const ips = [];
  for (const name of [...new Set(names)]) {
    const lookup = await runFor('dns-sd', ['-L', name, '_hue._tcp', 'local.'], 2500);
    const host = lookup.match(/can be reached at (\S+?)\.?:\d+/)?.[1];
    if (!host) continue;
    const addr = await runFor('dns-sd', ['-G', 'v4', host], 2500);
    for (const m of addr.matchAll(/\s(\d+\.\d+\.\d+\.\d+)\s/g)) ips.push(m[1]);
  }
  return [...new Set(ips)];
}

async function cloudHueIps() {
  try {
    const list = await getJson('https://discovery.meethue.com', {}, 4000);
    return (Array.isArray(list) ? list : []).map((b) => b.internalipaddress).filter(Boolean);
  } catch {
    return [];
  }
}

async function findHue(known) {
  if (known?.ip) {
    const cfg = await isHueBridge(known.ip);
    if (cfg) return { ip: known.ip, cfg, via: 'known IP' };
  }
  for (const [via, fn] of [
    ['mDNS _hue._tcp', mdnsHueIps],
    ['discovery.meethue.com', cloudHueIps],
  ]) {
    for (const ip of await fn()) {
      const cfg = await isHueBridge(ip);
      if (cfg) return { ip, cfg, via };
    }
  }
  return null;
}

// --- main ------------------------------------------------------------------------------------
console.log('Porchlight venue bring-up' + (SEARCH ? ' (with new-bulb search)' : '') + '\n');

const eth = findEthernet();
rows.push([
  'Ethernet link',
  eth ? `${eth.name} ${eth.ip}` : '-',
  eth ? 'OK' : 'WARN',
  eth ? 'active, link-local address' : 'no active en* with a 169.254 address (check USB-ethernet dongle + switch)',
]);

const pi = await findPi();
rows.push([
  'Raspberry Pi lamp',
  pi ? pi.base.replace('http://', '') : PI_CANDIDATES.join(' | ').replaceAll('http://', ''),
  ok(pi),
  pi ? `state=${pi.health.state} rotation=${pi.health.rotation ?? '?'}` : 'GET /health failed on every candidate',
]);

let hueLocal = null;
if (existsSync(HUE_LOCAL)) {
  try {
    hueLocal = JSON.parse(readFileSync(HUE_LOCAL, 'utf8'));
  } catch {
    hueLocal = null;
  }
}

const hue = await findHue(hueLocal);
let lights = null;
let hueDetail = '';
if (hue) {
  hueDetail = `${hue.cfg.name ?? 'Hue'} ${hue.cfg.modelid ?? ''} api ${hue.cfg.apiversion ?? '?'} via ${hue.via}`.trim();
  if (hueLocal?.username && hueLocal.ip !== hue.ip) {
    writeFileSync(HUE_LOCAL, JSON.stringify({ ...hueLocal, ip: hue.ip }, null, 2) + '\n');
    hueDetail += ` (bridge moved ${hueLocal.ip} -> ${hue.ip}; hue-local.json updated, restart the bridge)`;
    hueLocal = { ...hueLocal, ip: hue.ip };
  }
}
if (!hueLocal?.username) hueDetail += ' | no bridge/hue-local.json app key -- bulbs cannot be driven';
rows.push(['Hue Bridge', hue ? hue.ip : '-', ok(hue), hue ? hueDetail : 'not at known IP, not on mDNS, not in cloud discovery']);

const api = hue && hueLocal?.username ? `http://${hue.ip}/api/${hueLocal.username}` : null;

if (api && SEARCH) {
  try {
    await getJson(`${api}/lights`, { method: 'POST' });
    for (let s = SEARCH_WAIT_S; s > 0; s--) {
      process.stdout.write(`\rSearching for new Hue bulbs... ${String(s).padStart(2)}s left (power them on now) `);
      await sleep(1000);
    }
    process.stdout.write('\n');
    const found = await getJson(`${api}/lights/new`);
    const fresh = Object.entries(found)
      .filter(([k]) => k !== 'lastscan')
      .map(([id, v]) => `${v.name} (#${id})`);
    console.log(fresh.length ? `New bulbs found: ${fresh.join(', ')}` : 'No new bulbs found.');
  } catch (err) {
    console.log(`New-bulb search failed: ${err.message}`);
  }
}

if (api) {
  try {
    lights = await getJson(`${api}/lights`);
    if (!lights || Array.isArray(lights)) throw new Error('unauthorized (app key rejected?)');
  } catch (err) {
    lights = null;
    rows.push(['Hue bulbs', hue.ip, 'MISSING', `GET /lights failed: ${err.message}`]);
  }
}

const reachable = lights ? Object.entries(lights).filter(([, l]) => l?.state?.reachable) : [];
if (lights) {
  for (const [id, l] of Object.entries(lights)) {
    rows.push([`  bulb #${id}`, l.name, l.state?.reachable ? 'OK' : 'OFF', `${l.productname ?? l.type ?? ''}`.trim()]);
  }
  rows.push(['Hue bulbs reachable', hue.ip, reachable.length > 0 ? 'OK' : 'WARN', `${reachable.length}/${Object.keys(lights).length}`]);
}

// --- colour sweep: every device visibly responds ---------------------------------------------
const SWEEP = [
  { pi: 'screening', hue: { hue: 46000, sat: 254, bri: 220 }, label: 'blue' },
  { pi: 'verified', hue: { hue: 25500, sat: 254, bri: 254 }, label: 'green' },
  { pi: 'scam', hue: { hue: 0, sat: 254, bri: 254 }, label: 'red' },
  { pi: 'idle', hue: { hue: 8000, sat: 200, bri: 120 }, label: 'idle' },
];
if (pi || (api && reachable.length)) {
  process.stdout.write('Colour sweep:');
  for (const step of SWEEP) {
    process.stdout.write(` ${step.label}`);
    await Promise.allSettled([
      pi &&
        fetch(`${pi.base}/state`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ state: step.pi }),
          signal: AbortSignal.timeout(2000),
        }),
      api &&
        reachable.length &&
        fetch(`${api}/groups/0/action`, {
          method: 'PUT',
          body: JSON.stringify({ on: true, ...step.hue, alert: 'none', transitiontime: 3 }),
          signal: AbortSignal.timeout(2000),
        }),
    ]);
    await sleep(1250);
  }
  process.stdout.write(' -- done (all devices left on idle)\n');
}

// --- table ---------------------------------------------------------------------------------------
const W = [22, 26, 8];
const line = (r) => r.map((c, i) => (i < W.length ? String(c).padEnd(W[i]) : c)).join(' ');
console.log('\n' + line(['DEVICE', 'ADDRESS', 'STATUS', 'DETAILS']));
console.log(line(['-'.repeat(21), '-'.repeat(25), '-'.repeat(7), '-'.repeat(40)]));
for (const r of rows) console.log(line(r));

const go = Boolean(pi && hue);
console.log(
  '\n' +
    (go
      ? `GO -- Pi + Hue Bridge up, ${reachable.length} bulb(s) reachable. Start the bridge: pnpm lamp:bridge`
      : `NO-GO -- ${[!pi && 'Pi', !hue && 'Hue Bridge'].filter(Boolean).join(' + ')} not found. Check power + ethernet switch.`),
);
process.exit(go ? 0 : 1);
