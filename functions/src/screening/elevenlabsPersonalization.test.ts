import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets the vi.mock factory below (hoisted above all imports by Vitest)
// reference this -- mirrors resetDemo.test.ts's own generic path-keyed fakeDb pattern.
const { fakeDb, resetFakeDb } = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
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
    };
  }

  function collectionRef(name: string) {
    return {
      async add(data: Record<string, unknown>) {
        autoId += 1;
        const id = `auto-${autoId}`;
        docs.set(`${name}/${id}`, data);
        return docRef(`${name}/${id}`);
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

  return {
    fakeDb,
    resetFakeDb: () => {
      docs.clear();
      autoId = 0;
    },
  };
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => fakeDb,
}));

import { elevenlabsPersonalization } from './elevenlabsPersonalization.js';

function makeReq(body: unknown) {
  return { body };
}

function makeRes() {
  let payload: unknown;
  return {
    res: {
      json(body: unknown) {
        payload = body;
      },
    },
    get payload() {
      return payload;
    },
  };
}

const DEMO_HOUSEHOLD = {
  name: 'Demo household',
  seniorName: 'Margaret',
  members: [{ id: 'brenden', name: 'Brenden', relation: 'grandson', aliases: ['Brenden'], passkeyCredentialIds: [] }],
  allowlist: [{ number: '+14014979735', name: 'Brenden Smerbeck', relation: 'grandson' }],
};

beforeEach(() => {
  resetFakeDb();
});

describe('elevenlabsPersonalization', () => {
  it('creates a normal state:screening call doc for an unrecognized caller_id, with no allowlist pass-through fields', async () => {
    fakeDb.__docs.set('households/demo', DEMO_HOUSEHOLD);
    const req = makeReq({ caller_id: '+19995551234', call_sid: 'CAregular' });
    const helper = makeRes();

    await elevenlabsPersonalization(req as never, helper.res as never);

    const callId = (helper.payload as { dynamic_variables: { call_doc_id: string } }).dynamic_variables.call_doc_id;
    const doc = fakeDb.__docs.get(`calls/${callId}`) as { state: string; outcome?: string; verification?: unknown };
    expect(doc.state).toBe('screening');
    expect(doc.outcome).toBeUndefined();
    expect(doc.verification).toBeUndefined();
    expect((helper.payload as { dynamic_variables: Record<string, unknown> }).dynamic_variables.known_caller).toBeUndefined();
  });

  it('creates an already-verified/outcome:known call doc for an allowlisted caller_id, with verification.method:allowlist and a slugified memberId', async () => {
    fakeDb.__docs.set('households/demo', DEMO_HOUSEHOLD);
    const req = makeReq({ caller_id: '+14014979735', call_sid: 'CAknown' });
    const helper = makeRes();

    await elevenlabsPersonalization(req as never, helper.res as never);

    const payload = helper.payload as { dynamic_variables: { call_doc_id: string; caller_name?: string; known_caller?: boolean } };
    expect(payload.dynamic_variables.caller_name).toBe('Brenden');
    expect(payload.dynamic_variables.known_caller).toBe(true);

    const doc = fakeDb.__docs.get(`calls/${payload.dynamic_variables.call_doc_id}`) as {
      state: string;
      outcome?: string;
      providerCallId?: string;
      verification?: { memberId: string; method: string; name: string; answeredAt: number };
    };
    expect(doc.state).toBe('verified');
    expect(doc.outcome).toBe('known');
    expect(doc.providerCallId).toBe('CAknown');
    expect(doc.verification?.method).toBe('allowlist');
    expect(doc.verification?.memberId).toBe('brenden-smerbeck');
    expect(doc.verification?.name).toBe('Brenden Smerbeck');
    expect(typeof doc.verification?.answeredAt).toBe('number');
  });

  it('never confuses an allowlist match with a real household member id (distinct slug, no collision)', async () => {
    fakeDb.__docs.set('households/demo', DEMO_HOUSEHOLD);
    const req = makeReq({ caller_id: '+14014979735' });
    const helper = makeRes();

    await elevenlabsPersonalization(req as never, helper.res as never);

    const payload = helper.payload as { dynamic_variables: { call_doc_id: string } };
    const doc = fakeDb.__docs.get(`calls/${payload.dynamic_variables.call_doc_id}`) as {
      verification?: { memberId: string };
    };
    expect(doc.verification?.memberId).not.toBe('brenden');
  });

  it('treats the allowlist match as case-sensitive/exact E.164 -- a near-miss number gets the normal screening flow', async () => {
    fakeDb.__docs.set('households/demo', DEMO_HOUSEHOLD);
    const req = makeReq({ caller_id: '+14014979736' }); // one digit off
    const helper = makeRes();

    await elevenlabsPersonalization(req as never, helper.res as never);

    const payload = helper.payload as { dynamic_variables: { call_doc_id: string } };
    const doc = fakeDb.__docs.get(`calls/${payload.dynamic_variables.call_doc_id}`) as { state: string; outcome?: string };
    expect(doc.state).toBe('screening');
    expect(doc.outcome).toBeUndefined();
  });

  it('falls back to the normal screening flow when the household has no allowlist at all', async () => {
    fakeDb.__docs.set('households/demo', {
      name: 'Demo household',
      seniorName: 'Margaret',
      members: [],
    });
    const req = makeReq({ caller_id: '+14014979735' });
    const helper = makeRes();

    await elevenlabsPersonalization(req as never, helper.res as never);

    const payload = helper.payload as { dynamic_variables: { call_doc_id: string } };
    const doc = fakeDb.__docs.get(`calls/${payload.dynamic_variables.call_doc_id}`) as { state: string };
    expect(doc.state).toBe('screening');
  });
});
