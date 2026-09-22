import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets us reference these from inside the vi.mock factories below, which are
// themselves hoisted above all imports by Vitest.
const { fakeDb, resetFakeDb, fieldValueMock, mockParse } = vi.hoisted(() => {
  function makeArrayUnion(...items: unknown[]) {
    return { __arrayUnion: items };
  }

  const docs = new Map<string, Record<string, unknown>>();
  const updateCalls: Array<{ path: string; data: Record<string, unknown> }> = [];
  let autoId = 0;

  function applyUpdate(path: string, data: Record<string, unknown>) {
    const existing = docs.get(path) ?? {};
    const merged: Record<string, unknown> = { ...existing };
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && '__arrayUnion' in (value as object)) {
        const prev = (existing[key] as unknown[] | undefined) ?? [];
        merged[key] = [...prev, ...(value as { __arrayUnion: unknown[] }).__arrayUnion];
      } else {
        merged[key] = value;
      }
    }
    docs.set(path, merged);
  }

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
        applyUpdate(path, data);
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

  return {
    fakeDb,
    resetFakeDb: () => {
      docs.clear();
      updateCalls.length = 0;
      autoId = 0;
    },
    fieldValueMock: {
      arrayUnion: makeArrayUnion,
      serverTimestamp: () => '__SERVER_TIMESTAMP__',
    },
    mockParse: vi.fn(),
  };
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => fakeDb,
  FieldValue: fieldValueMock,
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { parse: mockParse };
  },
}));

vi.mock('@anthropic-ai/sdk/helpers/zod', () => ({
  zodOutputFormat: (schema: unknown) => schema,
}));

import { startSimulatedCall, simulateTurn, SimulateTurnInput } from './simulateTurn.js';
import { JAIL_SCRIPT } from '@porchlight/shared';

function mockClaudeTurn(turn: {
  reply: string;
  risk: number;
  tactics?: string[];
  claimedIdentity?: string | null;
  recommendedAction: 'continue' | 'verify' | 'end';
}) {
  mockParse.mockResolvedValueOnce({
    parsed_output: {
      reply: turn.reply,
      risk: turn.risk,
      tactics: turn.tactics ?? [],
      claimedIdentity: turn.claimedIdentity ?? null,
      recommendedAction: turn.recommendedAction,
    },
  });
}

beforeEach(() => {
  resetFakeDb();
  mockParse.mockReset();
});

describe('startSimulatedCall', () => {
  it('creates a calls/{id} doc with provider:simulator, householdId:demo, state:screening', async () => {
    const result = await startSimulatedCall.run({ data: {} } as never);

    expect(result.callId).toBeTruthy();
    const doc = fakeDb.__docs.get(`calls/${result.callId}`) as Record<string, unknown>;
    expect(doc.provider).toBe('simulator');
    expect(doc.householdId).toBe('demo');
    expect(doc.state).toBe('screening');
  });
});

describe('simulateTurn', () => {
  it('steps through all 5 JAIL_SCRIPT lines producing a non-decreasing risk score, via the same runTurn path', async () => {
    expect(JAIL_SCRIPT).toHaveLength(5);

    const { callId } = await startSimulatedCall.run({ data: {} } as never);

    const risks = [20, 35, 50, 80, 95];
    const tactics = [
      ['impersonation'],
      ['authority_bail'],
      ['secrecy'],
      ['payment_method'],
      ['urgency'],
    ];

    let previousRisk = -1;
    for (let i = 0; i < JAIL_SCRIPT.length; i++) {
      mockClaudeTurn({
        reply: 'ok',
        risk: risks[i],
        tactics: tactics[i],
        recommendedAction: 'continue',
      });

      await simulateTurn.run({ data: { callId, callerText: JAIL_SCRIPT[i] } } as never);

      const lastUpdate = fakeDb.__updateCalls.at(-1)!;
      const score = (lastUpdate.data.risk as { score: number }).score;
      expect(score).toBeGreaterThanOrEqual(previousRisk);
      previousRisk = score;
    }
  });

  it('the "it\'s me, Brenden" line triggers state:verifying + verification.memberId===brenden via runTurn', async () => {
    const { callId } = await startSimulatedCall.run({ data: {} } as never);

    mockClaudeTurn({
      reply: "Let me check with your grandma.",
      risk: 45,
      tactics: ['impersonation'],
      claimedIdentity: 'Brenden',
      recommendedAction: 'verify',
    });

    await simulateTurn.run({ data: { callId, callerText: JAIL_SCRIPT[0] } } as never);

    const lastUpdate = fakeDb.__updateCalls.at(-1)!;
    expect(lastUpdate.data.state).toBe('verifying');
    expect((lastUpdate.data.verification as { memberId: string }).memberId).toBe('brenden');
  });

  it("SimulateTurnInput has no householdId field — a supplied householdId can never reach runTurn", async () => {
    expect('householdId' in SimulateTurnInput.shape).toBe(false);

    const parsed = SimulateTurnInput.parse({
      callId: 'x',
      callerText: 'hi',
      householdId: 'not-demo',
    } as never);

    expect(parsed).not.toHaveProperty('householdId');

    const { callId } = await startSimulatedCall.run({ data: {} } as never);
    mockClaudeTurn({ reply: 'ok', risk: 10, recommendedAction: 'continue' });

    await simulateTurn.run({
      data: { callId, callerText: 'hi', householdId: 'not-demo' },
    } as never);

    const lastUpdate = fakeDb.__updateCalls.at(-1)!;
    // Household lookup only ever happened against the demo household — confirmed indirectly
    // by the update succeeding without error against the calls/{id} doc created for 'demo'.
    expect(lastUpdate.path).toBe(`calls/${callId}`);
    const householdDoc = fakeDb.__docs.get('households/demo');
    expect(householdDoc).toBeDefined();
    expect(fakeDb.__docs.get('households/not-demo')).toBeUndefined();
  });
});
