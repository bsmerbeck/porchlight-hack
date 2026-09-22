import { beforeEach, describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { checkLineStatus } from './lineStatus.js';

const NOW = 1_800_000_000_000;

let docs: Array<{ id: string; data: Record<string, unknown> }> = [];
let updates: Array<{ id: string; data: Record<string, unknown> }> = [];

const fakeDb = {
  collection: () => ({
    orderBy: () => ({
      limit: () => ({
        async get() {
          return {
            docs: docs.map((d) => ({
              id: d.id,
              data: () => d.data,
              ref: {
                async update(data: Record<string, unknown>) {
                  updates.push({ id: d.id, data });
                },
              },
            })),
          };
        },
      }),
    }),
  }),
} as unknown as Firestore;

const free = async () => [];

beforeEach(() => {
  docs = [];
  updates = [];
});

describe('checkLineStatus', () => {
  it('busy -> reports since, no writes', async () => {
    docs = [{ id: 'a', data: { state: 'screening', provider: 'elevenlabs', startedAt: NOW - 60_000 } }];
    const res = await checkLineStatus(async () => [{ startTime: new Date(NOW - 30_000) }], fakeDb, NOW);
    expect(res).toEqual({ busy: true, since: NOW - 30_000, checkedAt: NOW });
    expect(updates).toHaveLength(0);
  });

  it('not busy + stale live doc -> ended (outcome kept or screened)', async () => {
    docs = [
      { id: 'a', data: { state: 'screening', provider: 'elevenlabs', startedAt: NOW - 60_000, turns: [{ at: NOW - 25_000 }] } },
      { id: 'b', data: { state: 'verifying', provider: 'elevenlabs', startedAt: NOW - 90_000, outcome: 'scam' } },
    ];
    const res = await checkLineStatus(free, fakeDb, NOW);
    expect(res).toEqual({ busy: false, checkedAt: NOW, healed: 2 });
    expect(updates).toEqual([
      { id: 'a', data: { state: 'ended', outcome: 'screened', endedAt: NOW } },
      { id: 'b', data: { state: 'ended', outcome: 'scam', endedAt: NOW } },
    ]);
  });

  it('not busy + fresh (<20s) doc -> untouched', async () => {
    docs = [
      { id: 'a', data: { state: 'screening', provider: 'elevenlabs', startedAt: NOW - 60_000, turns: [{ at: NOW - 5_000 }] } },
      { id: 'b', data: { state: 'screening', provider: 'elevenlabs', startedAt: NOW - 10_000 } },
    ];
    await checkLineStatus(free, fakeDb, NOW);
    expect(updates).toHaveLength(0);
  });

  it('simulator and already-ended/terminal docs untouched', async () => {
    docs = [
      { id: 'sim', data: { state: 'screening', provider: 'simulator', startedAt: NOW - 60_000 } },
      { id: 'done', data: { state: 'screening', provider: 'elevenlabs', startedAt: NOW - 60_000, endedAt: NOW - 50_000 } },
      { id: 'scam', data: { state: 'scam', provider: 'elevenlabs', startedAt: NOW - 60_000 } },
    ];
    await checkLineStatus(free, fakeDb, NOW);
    expect(updates).toHaveLength(0);
  });

  it('Twilio error -> busy:null, no writes, never throws', async () => {
    docs = [{ id: 'a', data: { state: 'screening', provider: 'elevenlabs', startedAt: NOW - 60_000 } }];
    const res = await checkLineStatus(
      async () => {
        throw new Error('401');
      },
      fakeDb,
      NOW,
    );
    expect(res).toEqual({ busy: null, error: 'twilio', checkedAt: NOW });
    expect(updates).toHaveLength(0);
  });
});
