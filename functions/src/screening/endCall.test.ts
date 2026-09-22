import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets us reference these from inside the vi.mock factories below, which are
// themselves hoisted above all imports by Vitest (mirrors runTurn.test.ts/simulateTurn.test.ts).
const { fakeDb, resetFakeDb, mockCallsUpdate, mockTwilioFactory } = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const updateCalls: Array<{ path: string; data: Record<string, unknown> }> = [];
  let autoId = 0;

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
      async update(data: Record<string, unknown>) {
        updateCalls.push({ path, data });
        const existing = docs.get(path) ?? {};
        docs.set(path, { ...existing, ...data });
      },
    };
  }

  const fakeDb = {
    doc(path: string) {
      return docRef(path);
    },
    collection(name: string) {
      return {
        async add(data: Record<string, unknown>) {
          const id = `auto-${++autoId}`;
          const path = `${name}/${id}`;
          docs.set(path, data);
          return docRef(path);
        },
      };
    },
    __docs: docs,
    __updateCalls: updateCalls,
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
      updateCalls.length = 0;
      autoId = 0;
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

import { forceVerdict } from './endCall.js';
import { elevenlabsPersonalization } from './elevenlabsPersonalization.js';

function seedCall(id: string, data: Record<string, unknown>) {
  fakeDb.__docs.set(`calls/${id}`, data);
}

beforeEach(() => {
  resetFakeDb();
  process.env.TWILIO_ACCOUNT_SID = 'ACtest';
  process.env.TWILIO_AUTH_TOKEN = 'authtest';
});

describe('forceVerdict', () => {
  it('scam verdict on a real call (providerCallId present) hangs up via Twilio REST and writes state/outcome/endedAt', async () => {
    seedCall('call-1', { providerCallId: 'CAtest1', state: 'screening' });

    await forceVerdict.run({ data: { callId: 'call-1', verdict: 'scam' } } as never);

    expect(mockCallsUpdate).toHaveBeenCalledTimes(1);
    const [sid, opts] = mockCallsUpdate.mock.calls[0];
    expect(sid).toBe('CAtest1');
    expect((opts as { twiml: string }).twiml).toContain('<Hangup/>');

    const doc = fakeDb.__docs.get('calls/call-1') as Record<string, unknown>;
    expect(doc.state).toBe('scam');
    expect(doc.outcome).toBe('scam');
    expect(doc.endedAt).toBeTypeOf('number');
  });

  it('verified verdict releases the call with a non-hangup "put you through" line, writes state/outcome:verified', async () => {
    seedCall('call-2', { providerCallId: 'CAtest2', state: 'verifying' });

    await forceVerdict.run({ data: { callId: 'call-2', verdict: 'verified' } } as never);

    expect(mockCallsUpdate).toHaveBeenCalledTimes(1);
    const [sid, opts] = mockCallsUpdate.mock.calls[0];
    expect(sid).toBe('CAtest2');
    const twiml = (opts as { twiml: string }).twiml;
    expect(twiml).not.toContain('<Hangup/>');
    expect(twiml).toContain('put you through');

    const doc = fakeDb.__docs.get('calls/call-2') as Record<string, unknown>;
    expect(doc.state).toBe('verified');
    expect(doc.outcome).toBe('verified');
  });

  it('never invokes the Twilio client for a simulator-provenance doc (no providerCallId) -- Firestore-only update, no crash', async () => {
    seedCall('call-3', { state: 'screening' });

    await expect(forceVerdict.run({ data: { callId: 'call-3', verdict: 'scam' } } as never)).resolves.not.toThrow();

    expect(mockCallsUpdate).not.toHaveBeenCalled();
    const doc = fakeDb.__docs.get('calls/call-3') as Record<string, unknown>;
    expect(doc.state).toBe('scam');
    expect(doc.outcome).toBe('scam');
    expect(doc.endedAt).toBeTypeOf('number');
  });
});

describe('elevenlabsPersonalization', () => {
  it('given {caller_id, call_sid} creates a calls/{id} doc (provider:elevenlabs, state:screening) and responds dynamic_variables.call_doc_id', async () => {
    let jsonBody: unknown;
    const req = { body: { caller_id: '+14015551234', call_sid: 'CAlive1' } };
    const res = {
      json(body: unknown) {
        jsonBody = body;
      },
    };

    await elevenlabsPersonalization(req as never, res as never);

    const callId = (jsonBody as { dynamic_variables: { call_doc_id: string } }).dynamic_variables.call_doc_id;
    expect(callId).toBeTruthy();

    const doc = fakeDb.__docs.get(`calls/${callId}`) as Record<string, unknown>;
    expect(doc.provider).toBe('elevenlabs');
    expect(doc.providerCallId).toBe('CAlive1');
    expect(doc.state).toBe('screening');
    expect(doc.from).toBe('+14015551234');
  });
});
