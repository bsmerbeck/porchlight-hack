import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets the vi.mock factories below (hoisted above all imports by Vitest)
// reference these -- mirrors endCall.test.ts / runTurn.test.ts's own fakeDb pattern.
const { fakeDb, resetFakeDb, mockCallsUpdate, mockTwilioFactory } = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();

  function docRef(path: string) {
    return {
      id: path.split('/').at(-1)!,
      async get() {
        const data = docs.get(path);
        return { exists: data !== undefined, data: () => data };
      },
      async set(data: Record<string, unknown>) {
        docs.set(path, data);
      },
      async delete() {
        docs.delete(path);
      },
    };
  }

  function collectionRef(name: string) {
    return {
      async get() {
        const prefix = `${name}/`;
        const matched = [...docs.entries()].filter(([path]) => path.startsWith(prefix));
        return {
          docs: matched.map(([path, data]) => ({
            id: path.slice(prefix.length),
            data: () => data,
            ref: docRef(path),
          })),
        };
      },
    };
  }

  const fakeDb = {
    doc(path: string) {
      return docRef(path);
    },
    collection(name: string) {
      return collectionRef(name);
    },
    __docs: docs,
  };

  const mockCallsUpdate = vi.fn();
  const mockTwilioFactory = vi.fn((_accountSid: string, _authToken: string) => ({
    calls: (sid: string) => ({
      update: (opts: unknown) => mockCallsUpdate(sid, opts),
    }),
  }));

  return {
    fakeDb,
    resetFakeDb: () => {
      docs.clear();
      mockCallsUpdate.mockReset();
    },
    mockCallsUpdate,
    mockTwilioFactory,
  };
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => fakeDb,
}));

vi.mock('twilio', () => ({
  default: (accountSid: string, authToken: string) => mockTwilioFactory(accountSid, authToken),
}));

import { HttpsError } from 'firebase-functions/https';
import { resetDemo } from './resetDemo.js';

function seed(path: string, data: Record<string, unknown>) {
  fakeDb.__docs.set(path, data);
}

const REAL_TOKEN = 'a'.repeat(48); // matches DEMO_TOKEN's real openssl-rand-hex-24 length

beforeEach(() => {
  resetFakeDb();
  process.env.DEMO_TOKEN = REAL_TOKEN;
  process.env.TWILIO_ACCOUNT_SID = 'ACtest';
  process.env.TWILIO_AUTH_TOKEN = 'authtest';
});

describe('resetDemo', () => {
  it('rejects a wrong token with permission-denied and performs zero Firestore reads/writes and zero Twilio calls', async () => {
    seed('calls/junk', { state: 'screening' });
    const getSpy = vi.spyOn(fakeDb, 'collection');

    await expect(resetDemo.run({ data: { token: 'wrong-token' } } as never)).rejects.toThrow(HttpsError);

    expect(getSpy).not.toHaveBeenCalled();
    expect(mockCallsUpdate).not.toHaveBeenCalled();
    // Untouched -- the junk doc is still there because the gate ran before any Firestore op.
    expect(fakeDb.__docs.has('calls/junk')).toBe(true);
  });

  it('rejects a missing token with permission-denied and zero side effects', async () => {
    await expect(resetDemo.run({ data: {} } as never)).rejects.toThrow();
    expect(mockCallsUpdate).not.toHaveBeenCalled();
  });

  it('deletes non-kept calls, force-ends any still-live Twilio leg first, clears prompts, sets lamp idle, and preserves an existing member passkey', async () => {
    seed('calls/live-call', { providerCallId: 'CAlive', state: 'screening' });
    seed('calls/ended-call', { state: 'scam', endedAt: 123 });
    seed('calls/kept-call', { state: 'screening' });
    seed('prompts/brenden', { state: 'verifying' });
    seed('lamp/current', { state: 'screening', callId: 'live-call' });
    seed('households/demo', {
      name: 'Demo household',
      seniorName: 'Margaret',
      members: [
        {
          id: 'brenden',
          name: 'Brenden',
          relation: 'grandson',
          aliases: ['Brenden', 'Brendan', 'your grandson'],
          passkeyCredentialIds: [],
          passkeys: [{ id: 'cred-1', publicKey: 'pk', counter: 3, transports: [], deviceType: 'singleDevice', backedUp: false }],
        },
      ],
    });

    const result = await resetDemo.run({ data: { token: REAL_TOKEN, keepCallIds: ['kept-call'] } } as never);

    // Still-live call was actually hung up via Twilio, not just abandoned client-side.
    expect(mockCallsUpdate).toHaveBeenCalledTimes(1);
    const [sid, opts] = mockCallsUpdate.mock.calls[0];
    expect(sid).toBe('CAlive');
    expect((opts as { twiml: string }).twiml).toContain('<Hangup/>');

    expect(fakeDb.__docs.has('calls/live-call')).toBe(false);
    expect(fakeDb.__docs.has('calls/ended-call')).toBe(false);
    expect(fakeDb.__docs.has('calls/kept-call')).toBe(true);
    expect(fakeDb.__docs.has('prompts/brenden')).toBe(false);

    const lamp = fakeDb.__docs.get('lamp/current');
    expect(lamp).toEqual({ state: 'idle' });

    const household = fakeDb.__docs.get('households/demo') as { members: Array<{ id: string; passkeys?: unknown[] }> };
    const brenden = household.members.find((m) => m.id === 'brenden')!;
    expect(brenden.passkeys).toEqual([
      { id: 'cred-1', publicKey: 'pk', counter: 3, transports: [], deviceType: 'singleDevice', backedUp: false },
    ]);

    expect(result).toEqual({ callsDeleted: 2, promptsCleared: 1 });
  });

  it('never crashes when forceEndCall throws (stale/already-ended Twilio call) -- still deletes the doc', async () => {
    mockCallsUpdate.mockImplementationOnce(() => {
      throw new Error('Twilio: call already completed');
    });
    seed('calls/stale-call', { providerCallId: 'CAstale', state: 'screening' });

    await expect(resetDemo.run({ data: { token: REAL_TOKEN } } as never)).resolves.not.toThrow();
    expect(fakeDb.__docs.has('calls/stale-call')).toBe(false);
  });

  it('leaves households/demo untouched by member-name overrides -- an unseeded household is created at baseline with no passkeys', async () => {
    const result = await resetDemo.run({ data: { token: REAL_TOKEN } } as never);
    const household = fakeDb.__docs.get('households/demo') as { members: Array<{ id: string; passkeys?: unknown[] }> };
    expect(household.members[0].id).toBe('brenden');
    expect(household.members[0].passkeys).toBeUndefined();
    expect(result).toEqual({ callsDeleted: 0, promptsCleared: 0 });
  });
});
