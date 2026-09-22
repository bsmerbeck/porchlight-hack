import { describe, expect, it } from 'vitest';
import {
  RESULT_HOLD_MS,
  STALE_LIVE_MS,
  deriveFreshStageState,
  deriveStageState,
  isAbandonedLive,
  isSupersededLive,
  lastActivity,
  isTerminalCall,
  stateVisual,
  terminalAt,
  type StageCallLike,
} from './stageState';

const NOW = 1_000_000;
type T = StageCallLike & { id?: string };
const c = (o: Partial<T>): T => ({ state: 'ended', startedAt: NOW - 60_000, ...o });

describe('deriveStageState', () => {
  it('ready when feed empty', () => {
    expect(deriveStageState([], NOW)).toEqual({ mode: 'ready' });
  });

  it('ready when only old terminal calls', () => {
    const r = deriveStageState([c({ state: 'scam', endedAt: NOW - RESULT_HOLD_MS - 1 })], NOW);
    expect(r.mode).toBe('ready');
  });

  it('live for screening and verifying; picks newest by startedAt', () => {
    const a = c({ id: 'a', state: 'screening', startedAt: NOW - 5000 });
    const b = c({ id: 'b', state: 'verifying', startedAt: NOW - 1000 });
    expect(deriveStageState([a, b], NOW)).toEqual({ mode: 'live', call: b });
    expect(deriveStageState([b, a], NOW)).toEqual({ mode: 'live', call: b });
    expect(deriveStageState([a], NOW)).toEqual({ mode: 'live', call: a });
  });

  it('live wins over a fresh result', () => {
    const live = c({ id: 'l', state: 'screening', startedAt: NOW - 100 });
    const done = c({ id: 'd', state: 'scam', endedAt: NOW - 50 });
    expect(deriveStageState([done, live], NOW).call).toBe(live);
  });

  it('result for verified / scam / ended within hold (inclusive boundary)', () => {
    for (const state of ['verified', 'scam', 'ended'] as const) {
      const call = c({ state, endedAt: NOW - RESULT_HOLD_MS });
      expect(deriveStageState([call], NOW)).toEqual({ mode: 'result', call });
    }
  });

  it('result for known / message outcomes', () => {
    const known = c({ state: 'verified', outcome: 'known', verification: { memberId: 'm', answeredAt: NOW - 1000 } });
    expect(deriveStageState([known], NOW)).toEqual({ mode: 'result', call: known });
    const msg = c({ state: 'ended', outcome: 'message', endedAt: NOW - 1000 });
    expect(deriveStageState([msg], NOW)).toEqual({ mode: 'result', call: msg });
  });

  it('result picks newest terminal by terminal time', () => {
    const older = c({ id: 'o', state: 'scam', startedAt: NOW - 1000, endedAt: NOW - 10_000 });
    const newer = c({ id: 'n', state: 'verified', startedAt: NOW - 30_000, endedAt: NOW - 2000 });
    expect(deriveStageState([older, newer], NOW).call).toBe(newer);
    expect(deriveStageState([newer, older], NOW).call).toBe(newer);
  });

  it('respects custom holdMs', () => {
    const call = c({ state: 'scam', endedAt: NOW - 5000 });
    expect(deriveStageState([call], NOW, 4000).mode).toBe('ready');
    expect(deriveStageState([call], NOW, 6000).mode).toBe('result');
  });

  it('ignores idle calls', () => {
    expect(deriveStageState([c({ state: 'idle', startedAt: NOW })], NOW).mode).toBe('ready');
  });
});

describe('terminal helpers', () => {
  it('terminal via known/message outcome even if state not terminal', () => {
    expect(isTerminalCall(c({ state: 'idle', outcome: 'known' }))).toBe(true);
    expect(isTerminalCall(c({ state: 'idle', outcome: 'message' }))).toBe(true);
    expect(isTerminalCall(c({ state: 'idle' }))).toBe(false);
    expect(isTerminalCall(c({ state: 'screening' }))).toBe(false);
  });

  it('terminalAt fallback chain: endedAt -> answeredAt -> updatedAt -> startedAt', () => {
    const v = { memberId: 'm', answeredAt: 30 };
    expect(terminalAt(c({ startedAt: 10, updatedAt: 20, verification: v, endedAt: 40 }))).toBe(40);
    expect(terminalAt(c({ startedAt: 10, updatedAt: 20, verification: v }))).toBe(30);
    expect(terminalAt(c({ startedAt: 10, updatedAt: 20 }))).toBe(20);
    expect(terminalAt(c({ startedAt: 10 }))).toBe(10);
  });
});

describe('stateVisual', () => {
  const cases: Array<[Partial<T> | undefined, string, string]> = [
    [undefined, 'idle', 'WATCHING'],
    [{ state: 'screening' }, 'screening', 'SCREENING'],
    [{ state: 'verifying' }, 'verifying', 'VERIFYING…'],
    [{ state: 'verified' }, 'verified', 'VERIFIED'],
    [{ state: 'ended', outcome: 'verified' }, 'verified', 'VERIFIED'],
    [{ state: 'scam' }, 'scam', 'SCAM BLOCKED'],
    [{ state: 'ended', outcome: 'scam' }, 'scam', 'SCAM BLOCKED'],
    [{ state: 'verified', outcome: 'known' }, 'known', 'KNOWN CALLER'],
    [{ state: 'ended', outcome: 'message' }, 'message', 'MESSAGE TAKEN'],
    [{ state: 'ended', outcome: 'screened' }, 'ended', 'CALL ENDED'],
    [{ state: 'ended' }, 'ended', 'CALL ENDED'],
    [{ state: 'idle' }, 'idle', 'WATCHING'],
  ];
  it.each(cases)('%j -> %s', (call, key, label) => {
    const v = stateVisual(call ? c(call) : undefined);
    expect(v.key).toBe(key);
    expect(v.label).toBe(label);
    expect(v.colorVar).toMatch(/^var\(--state-/);
  });

  it('known is green, message indigo, scam red', () => {
    expect(stateVisual(c({ outcome: 'known' })).colorVar).toBe('var(--state-known)');
    expect(stateVisual(c({ outcome: 'message' })).colorVar).toBe('var(--state-message)');
    expect(stateVisual(c({ state: 'scam' })).colorVar).toBe('var(--state-scam)');
    expect(stateVisual(null).key).toBe('idle');
  });
});

describe('deriveFreshStageState (06-H stale live filter)', () => {
  const T0 = 10_000_000;
  it('ignores a verifying call with no activity for > STALE_LIVE_MS (ready, not live)', () => {
    const stale = { state: 'verifying' as const, startedAt: T0 - STALE_LIVE_MS - 1 };
    expect(deriveFreshStageState([stale], T0).mode).toBe('ready');
    // the raw derivation would still pin it live
    expect(deriveStageState([stale], T0).mode).toBe('live');
  });
  it('keeps an old call live if it had recent activity (a turn)', () => {
    const active = { state: 'screening' as const, startedAt: T0 - STALE_LIVE_MS - 60_000, turns: [{ at: T0 - 5_000 }] };
    expect(deriveFreshStageState([active], T0).mode).toBe('live');
    expect(lastActivity(active)).toBe(T0 - 5_000);
  });
  it('prefers a fresh live call over a stale one and still shows recent results', () => {
    const stale = { state: 'verifying' as const, startedAt: T0 - STALE_LIVE_MS * 2 };
    const fresh = { state: 'screening' as const, startedAt: T0 - 1_000 };
    expect(deriveFreshStageState([stale, fresh], T0).call).toBe(fresh);
    const result = { state: 'scam' as const, startedAt: T0 - 30_000, endedAt: T0 - 1_000 };
    expect(deriveFreshStageState([stale, result], T0).mode).toBe('result');
  });
});

describe('06-I: a newer call supersedes an older abandoned live call', () => {
  // Live repro: sYlM (simulator, screening, started 18:14Z, operator left /sim mid-script)
  // and kx24 (started ~18:15Z, ended scam at 18:16:49Z). /stage showed SCREENING for sYlM.
  const T0 = Date.UTC(2026, 8, 22, 18, 14, 0);
  const old = c({ id: 'sYlM', state: 'screening', startedAt: T0, turns: [{ at: T0 + 20_000 }] } as Partial<T>);
  const newer = c({ id: 'kx24', state: 'scam', outcome: 'scam', startedAt: T0 + 60_000, endedAt: T0 + 169_000 });

  it('shows the newer SCAM result, not the older screening call', () => {
    const now = T0 + 175_000; // 6s after kx24 ended, well within the 10-min stale window
    expect(deriveStageState([old, newer], now)).toEqual({ mode: 'result', call: newer });
    expect(deriveStageState([newer, old], now)).toEqual({ mode: 'result', call: newer });
    expect(deriveFreshStageState([newer, old], now)).toEqual({ mode: 'result', call: newer });
  });

  it('goes to ready once the newer result hold expires (old call never resurfaces)', () => {
    const now = T0 + 169_000 + RESULT_HOLD_MS + 1;
    expect(deriveFreshStageState([old, newer], now)).toEqual({ mode: 'ready' });
  });

  it('a newer live call supersedes an older live call', () => {
    const newerLive = c({ id: 'n', state: 'screening', startedAt: T0 + 60_000 });
    expect(deriveStageState([old, newerLive], T0 + 70_000).call).toBe(newerLive);
  });

  it('isSupersededLive / isAbandonedLive flag the older call as ended for history rows', () => {
    const now = T0 + 175_000;
    expect(isSupersededLive(old, [old, newer])).toBe(true);
    expect(isSupersededLive(newer, [old, newer])).toBe(false); // terminal, never "superseded"
    expect(isSupersededLive(old, [old])).toBe(false);
    expect(isAbandonedLive(old, [old, newer], now)).toBe(true);
    expect(isAbandonedLive(old, [old], now)).toBe(false);
    // stale cutoff still applies on its own
    expect(isAbandonedLive(old, [old], T0 + 20_000 + STALE_LIVE_MS)).toBe(true);
  });
});
