import { beforeEach, describe, expect, it, vi } from 'vitest';

const { writes, store } = vi.hoisted(() => ({
  writes: [] as Array<Record<string, unknown>>,
  store: new Map<string, Record<string, unknown>>(),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'SERVER_TS' },
  getFirestore: () => ({
    doc: (path: string) => ({
      async get() {
        return { data: () => store.get(path) };
      },
      async set(data: Record<string, unknown>) {
        writes.push(data);
        store.set(path, data);
      },
    }),
  }),
}));

import { HttpsError } from 'firebase-functions/https';
import { lampTest, LAMP_TEST_SEQUENCE } from './lampTest.js';

const REAL_TOKEN = 'a'.repeat(48);

beforeEach(() => {
  writes.length = 0;
  store.clear();
  process.env.DEMO_TOKEN = REAL_TOKEN;
  vi.useFakeTimers();
});

async function runWithTimers(p: Promise<unknown>) {
  await vi.runAllTimersAsync();
  return p;
}

describe('lampTest', () => {
  it('rejects a wrong or missing token with zero writes', async () => {
    await expect(lampTest.run({ data: { token: 'nope' } } as never)).rejects.toThrow(HttpsError);
    await expect(lampTest.run({ data: {} } as never)).rejects.toThrow(HttpsError);
    expect(writes).toHaveLength(0);
  });

  it('cycles lamp/current through the sweep and ends idle', async () => {
    store.set('lamp/current', { state: 'idle' });
    const res = await runWithTimers(lampTest.run({ data: { token: REAL_TOKEN } } as never));
    expect(res).toEqual({ steps: LAMP_TEST_SEQUENCE.length });
    expect(writes.map((w) => w.state)).toEqual([...LAMP_TEST_SEQUENCE]);
    expect(writes.at(-1)?.state).toBe('idle');
    expect(writes.every((w) => w.callId === null && w.lampTest === true)).toBe(true);
  });

  it('refuses while a live call owns the lamp', async () => {
    store.set('lamp/current', { state: 'screening', callId: 'live' });
    await expect(lampTest.run({ data: { token: REAL_TOKEN } } as never)).rejects.toThrow(/live call/);
    expect(writes).toHaveLength(0);
  });
});
