import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets the vi.mock factories below (hoisted above all imports by Vitest)
// reference these -- mirrors runTurn.test.ts's own fakeDb + Anthropic mock pattern.
const { fakeDb, resetFakeDb, mockCreate } = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const updateCalls: Array<{ path: string; data: Record<string, unknown> }> = [];

  const fakeDb = {
    doc(path: string) {
      return {
        async update(data: Record<string, unknown>) {
          updateCalls.push({ path, data });
          const existing = docs.get(path) ?? {};
          docs.set(path, { ...existing, ...data });
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
    },
    mockCreate: vi.fn(),
  };
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => fakeDb,
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

import { writeFamilyReport } from './writeFamilyReport.js';

function snapshot(data: Record<string, unknown> | undefined) {
  return { data: () => data };
}

function event(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined, callId = 'call-1') {
  return { data: { before: snapshot(before), after: snapshot(after) }, params: { callId } } as never;
}

beforeEach(() => {
  resetFakeDb();
  mockCreate.mockReset();
});

describe('writeFamilyReport', () => {
  it('a write transitioning into endedAt triggers exactly one claude-sonnet-5 call and exactly one calls/{id}.report update', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'The caller claimed to be a grandson asking for gift cards. Porchlight flagged the urgency and payment-method tactics and ended the call.' }],
    });

    await writeFamilyReport.run(
      event(
        { state: 'scam', turns: [] },
        { state: 'scam', outcome: 'scam', endedAt: 123, turns: [], risk: { score: 90, tactics: ['urgency'] } },
      ),
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ model: 'claude-sonnet-5' });
    expect(fakeDb.__updateCalls).toHaveLength(1);
    expect(fakeDb.__updateCalls[0].path).toBe('calls/call-1');
    const report = fakeDb.__updateCalls[0].data.report;
    expect(typeof report).toBe('string');
    expect((report as string).length).toBeGreaterThan(0);
  });

  it('a write where before.endedAt was already truthy makes zero Anthropic calls and zero Firestore writes (prevents this trigger re-triggering itself)', async () => {
    await writeFamilyReport.run(
      event(
        { state: 'scam', endedAt: 100, report: 'already generated' },
        { state: 'scam', endedAt: 100, report: 'already generated' },
      ),
    );

    expect(mockCreate).not.toHaveBeenCalled();
    expect(fakeDb.__updateCalls).toHaveLength(0);
  });

  it('a write where after.endedAt is still unset (call still in progress) makes zero Anthropic calls', async () => {
    await writeFamilyReport.run(event({ state: 'screening' }, { state: 'verifying' }));

    expect(mockCreate).not.toHaveBeenCalled();
    expect(fakeDb.__updateCalls).toHaveLength(0);
  });

  it('writes a fallback report string when the Anthropic call throws, rather than leaving report missing or throwing unhandled', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Claude API unreachable'));

    await expect(
      writeFamilyReport.run(event({ state: 'screening' }, { state: 'ended', endedAt: 999, turns: [], risk: { score: 10, tactics: [] } })),
    ).resolves.not.toThrow();

    expect(fakeDb.__updateCalls).toHaveLength(1);
    expect(fakeDb.__updateCalls[0].data.report).toBe('Report unavailable -- see call transcript.');
  });
});
