// Run: node --test bridge/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settleDelayMs, effectiveState, toMillis, SETTLE_HOLD_MS } from './settle.mjs';

test('non-terminal states never settle', () => {
  for (const state of ['idle', 'screening', 'verifying']) {
    assert.equal(settleDelayMs({ state, updatedAt: 0 }, 1e9), null);
  }
  assert.equal(settleDelayMs(null, 0), null);
});

test('terminal state waits the remainder of the hold from updatedAt', () => {
  const t = 1_000_000;
  assert.equal(settleDelayMs({ state: 'scam', updatedAt: t }, t + 5_000), SETTLE_HOLD_MS - 5_000);
  assert.equal(settleDelayMs({ state: 'verified', updatedAt: { toMillis: () => t } }, t), SETTLE_HOLD_MS);
  assert.equal(settleDelayMs({ state: 'ended', updatedAt: { seconds: t / 1000, nanoseconds: 0 } }, t + 1), SETTLE_HOLD_MS - 1);
});

test('stale terminal state (bridge restarted later) settles immediately', () => {
  assert.equal(settleDelayMs({ state: 'scam', updatedAt: 0 }, 60_000), 0);
});

test('future updatedAt (clock skew) is clamped to the hold', () => {
  assert.equal(settleDelayMs({ state: 'scam', updatedAt: 100_000 }, 0), SETTLE_HOLD_MS);
});

test('missing updatedAt falls back to receive time', () => {
  assert.equal(settleDelayMs({ state: 'scam' }, 2_000, 1_000), SETTLE_HOLD_MS - 1_000);
});

test('effectiveState maps settled terminal to idle only', () => {
  assert.equal(effectiveState({ state: 'scam' }, true), 'idle');
  assert.equal(effectiveState({ state: 'scam' }, false), 'scam');
  assert.equal(effectiveState({ state: 'screening' }, true), 'screening');
  assert.equal(effectiveState(null, true), null);
  assert.equal(toMillis(undefined), null);
});
