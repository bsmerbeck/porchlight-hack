import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets us reference these from inside the vi.mock factories below, which are
// themselves hoisted above all imports by Vitest (mirrors runTurn.test.ts/endCall.test.ts).
const { fakeDb, resetFakeDb, mockForceEndCall, mockReleaseCall, mockCheckVerifyToken, mockVerifyAuthenticationResponse, mockGenerateAuthenticationOptions } =
  vi.hoisted(() => {
    const docs = new Map<string, Record<string, unknown>>();

    function docRef(path: string) {
      return {
        async get() {
          const data = docs.get(path);
          return { exists: data !== undefined, data: () => data };
        },
        async set(data: Record<string, unknown>) {
          docs.set(path, data);
        },
        async update(data: Record<string, unknown>) {
          const existing = docs.get(path) ?? {};
          docs.set(path, { ...existing, ...data });
        },
        async delete() {
          docs.delete(path);
        },
      };
    }

    const fakeDb = {
      doc(path: string) {
        return docRef(path);
      },
      __docs: docs,
    };

    return {
      fakeDb,
      resetFakeDb: () => docs.clear(),
      mockForceEndCall: vi.fn(),
      mockReleaseCall: vi.fn(),
      mockCheckVerifyToken: vi.fn(),
      mockVerifyAuthenticationResponse: vi.fn(),
      mockGenerateAuthenticationOptions: vi.fn(),
    };
  });

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => fakeDb,
}));

vi.mock('../screening/endCall.js', () => ({
  forceEndCall: mockForceEndCall,
  releaseCall: mockReleaseCall,
}));

vi.mock('./verifyLink.js', () => ({
  checkVerifyToken: mockCheckVerifyToken,
  mintVerifyToken: vi.fn(),
}));

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: mockGenerateAuthenticationOptions,
  verifyAuthenticationResponse: mockVerifyAuthenticationResponse,
}));

vi.mock('@simplewebauthn/server/helpers', () => ({
  isoBase64URL: {
    fromBuffer: (buf: Uint8Array) => Buffer.from(buf).toString('base64url'),
    toBuffer: (str: string) => new Uint8Array(Buffer.from(str, 'base64url')),
  },
}));

import { startPasskeyAuthentication, answerVerification, expireVerification } from './passkeyAuthentication.js';

// HttpsError's `.message` is just the human-readable text (e.g. "Bad or expired link"); the
// `.code` property (e.g. 'permission-denied') is what callers actually branch on. Assert both.
async function expectHttpsErrorCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

function seedHousehold(members: Array<Record<string, unknown>>) {
  fakeDb.__docs.set('households/demo', { name: 'Demo household', seniorName: 'Margaret', members });
}

function seedCall(id: string, data: Record<string, unknown>) {
  fakeDb.__docs.set(`calls/${id}`, data);
}

beforeEach(() => {
  resetFakeDb();
  mockForceEndCall.mockReset();
  mockReleaseCall.mockReset();
  mockCheckVerifyToken.mockReset();
  mockVerifyAuthenticationResponse.mockReset();
  mockGenerateAuthenticationOptions.mockReset();
});

describe('startPasskeyAuthentication', () => {
  it('scopes allowCredentials to the specific member\'s stored passkeys and writes a 60s challenge', async () => {
    seedHousehold([
      {
        id: 'brenden',
        name: 'Brenden',
        relation: 'grandson',
        aliases: [],
        passkeyCredentialIds: [],
        passkeys: [{ id: 'cred-1', publicKey: 'abc', counter: 0, transports: ['internal'], deviceType: 'singleDevice', backedUp: false }],
      },
    ]);
    mockGenerateAuthenticationOptions.mockResolvedValueOnce({ challenge: 'auth-chal-1' });

    const before = Date.now();
    await startPasskeyAuthentication.run({ data: { memberId: 'brenden' } } as never);
    const after = Date.now();

    const [[opts]] = mockGenerateAuthenticationOptions.mock.calls;
    expect(opts.allowCredentials).toEqual([{ id: 'cred-1', transports: ['internal'] }]);

    const challenge = fakeDb.__docs.get('webauthnChallenges/brenden') as { expiresAt: number };
    expect(challenge.expiresAt).toBeGreaterThanOrEqual(before + 60_000 - 1000);
    expect(challenge.expiresAt).toBeLessThanOrEqual(after + 60_000 + 1000);
  });
});

describe('answerVerification', () => {
  it('answer:no calls forceEndCall with a scam line and writes verification/state/outcome/endedAt', async () => {
    seedCall('call-no', {
      householdId: 'demo',
      providerCallId: 'CAtest1',
      state: 'verifying',
      verification: { memberId: 'brenden', promptedAt: 1000 },
    });

    const result = await answerVerification.run({ data: { callId: 'call-no', memberId: 'brenden', answer: 'no' } } as never);

    expect(result).toEqual({ verified: false });
    expect(mockForceEndCall).toHaveBeenCalledWith('CAtest1', expect.any(String));
    expect(mockReleaseCall).not.toHaveBeenCalled();

    const doc = fakeDb.__docs.get('calls/call-no') as Record<string, unknown>;
    expect(doc.state).toBe('scam');
    expect(doc.outcome).toBe('scam');
    expect(doc.endedAt).toBeTypeOf('number');
    expect((doc.verification as { answer: string }).answer).toBe('no');
    expect((doc.verification as { answeredAt: number }).answeredAt).toBeTypeOf('number');
    // memberId/promptedAt from the original verification map must survive the merge.
    expect((doc.verification as { memberId: string }).memberId).toBe('brenden');
  });

  // 04-FIX ("'No' must hang up"): when a call doc has no providerCallId (a simulated call,
  // or a real call whose provenance was never adopted), forceEndCall has no real Twilio
  // call leg to hang up -- confirm this degrades to a clear warning log instead of throwing
  // or silently doing nothing, and the verdict is still recorded correctly.
  it('answer:no with no providerCallId on the call doc logs a warning instead of calling forceEndCall, but still records the verdict', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    seedCall('call-no-provider', {
      householdId: 'demo',
      state: 'verifying',
      verification: { memberId: 'brenden', promptedAt: 1000 },
    });

    const result = await answerVerification.run({
      data: { callId: 'call-no-provider', memberId: 'brenden', answer: 'no' },
    } as never);

    expect(result).toEqual({ verified: false });
    expect(mockForceEndCall).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no providerCallId'),
      expect.objectContaining({ callId: 'call-no-provider', memberId: 'brenden' }),
    );

    const doc = fakeDb.__docs.get('calls/call-no-provider') as Record<string, unknown>;
    expect(doc.state).toBe('scam');
    expect(doc.outcome).toBe('scam');

    warnSpy.mockRestore();
  });

  it('answer:timeout behaves identically to no', async () => {
    seedCall('call-timeout', {
      householdId: 'demo',
      providerCallId: 'CAtest2',
      state: 'verifying',
      verification: { memberId: 'brenden', promptedAt: 1000 },
    });

    const result = await answerVerification.run({ data: { callId: 'call-timeout', memberId: 'brenden', answer: 'timeout' } } as never);

    expect(result).toEqual({ verified: false });
    expect(mockForceEndCall).toHaveBeenCalledWith('CAtest2', expect.any(String));
    const doc = fakeDb.__docs.get('calls/call-timeout') as Record<string, unknown>;
    expect(doc.state).toBe('scam');
    expect(doc.outcome).toBe('scam');
    expect((doc.verification as { answer: string }).answer).toBe('timeout');
  });

  it('answer:yes with a mocked successful verifyAuthenticationResponse calls releaseCall, sets state:verified, and persists the new counter', async () => {
    seedHousehold([
      {
        id: 'brenden',
        name: 'Brenden',
        relation: 'grandson',
        aliases: [],
        passkeyCredentialIds: [],
        passkeys: [{ id: 'cred-1', publicKey: 'YWJj', counter: 5, transports: ['internal'], deviceType: 'singleDevice', backedUp: false }],
      },
    ]);
    fakeDb.__docs.set('webauthnChallenges/brenden', { challenge: 'auth-chal-2', expiresAt: Date.now() + 60_000 });
    seedCall('call-yes', {
      householdId: 'demo',
      state: 'verifying',
      verification: { memberId: 'brenden', promptedAt: 1000 },
    });
    mockVerifyAuthenticationResponse.mockResolvedValueOnce({
      verified: true,
      authenticationInfo: { newCounter: 6 },
    });
    mockReleaseCall.mockImplementation(async (callId: string) => {
      const existing = fakeDb.__docs.get(`calls/${callId}`) ?? {};
      fakeDb.__docs.set(`calls/${callId}`, { ...existing, state: 'verified', outcome: 'verified' });
    });

    const result = await answerVerification.run({
      data: { callId: 'call-yes', memberId: 'brenden', answer: 'yes', response: { id: 'cred-1' } },
    } as never);

    expect(result).toEqual({ verified: true });
    expect(mockReleaseCall).toHaveBeenCalledWith('call-yes');

    const doc = fakeDb.__docs.get('calls/call-yes') as Record<string, unknown>;
    expect(doc.state).toBe('verified');
    expect((doc.verification as { answer: string }).answer).toBe('yes');
    expect((doc.verification as { method: string }).method).toBe('passkey');

    const household = fakeDb.__docs.get('households/demo') as { members: Array<Record<string, unknown>> };
    const passkeys = household.members[0].passkeys as Array<Record<string, unknown>>;
    expect(passkeys[0].counter).toBe(6);

    expect(fakeDb.__docs.has('webauthnChallenges/brenden')).toBe(false);
  });

  it('answer:yes with a valid token (no response) also calls releaseCall -- the VER-05 fallback path, no WebAuthn call at all', async () => {
    seedCall('call-token', {
      householdId: 'demo',
      state: 'verifying',
      verification: { memberId: 'brenden', promptedAt: 1000 },
    });
    mockCheckVerifyToken.mockReturnValueOnce(true);
    mockReleaseCall.mockImplementation(async (callId: string) => {
      const existing = fakeDb.__docs.get(`calls/${callId}`) ?? {};
      fakeDb.__docs.set(`calls/${callId}`, { ...existing, state: 'verified', outcome: 'verified' });
    });

    const result = await answerVerification.run({
      data: { callId: 'call-token', memberId: 'brenden', answer: 'yes', token: 'good-token' },
    } as never);

    expect(result).toEqual({ verified: true });
    expect(mockVerifyAuthenticationResponse).not.toHaveBeenCalled();
    expect(mockReleaseCall).toHaveBeenCalledWith('call-token');
    const doc = fakeDb.__docs.get('calls/call-token') as Record<string, unknown>;
    expect((doc.verification as { method: string }).method).toBe('link');
  });

  it('answer:yes with NEITHER response NOR token throws invalid-argument and never calls releaseCall', async () => {
    seedCall('call-bare-yes', {
      householdId: 'demo',
      state: 'verifying',
      verification: { memberId: 'brenden', promptedAt: 1000 },
    });

    await expectHttpsErrorCode(
      answerVerification.run({ data: { callId: 'call-bare-yes', memberId: 'brenden', answer: 'yes' } } as never),
      'invalid-argument',
    );

    expect(mockReleaseCall).not.toHaveBeenCalled();
  });

  it('a second answerVerification for an already-answered call throws failed-precondition and never calls releaseCall/forceEndCall again', async () => {
    seedCall('call-done', {
      householdId: 'demo',
      state: 'verified',
      outcome: 'verified',
      verification: { memberId: 'brenden', promptedAt: 1000, answer: 'yes', answeredAt: 2000, method: 'passkey' },
    });

    await expectHttpsErrorCode(
      answerVerification.run({ data: { callId: 'call-done', memberId: 'brenden', answer: 'yes', token: 'x' } } as never),
      'failed-precondition',
    );

    expect(mockReleaseCall).not.toHaveBeenCalled();
    expect(mockForceEndCall).not.toHaveBeenCalled();
  });

  it('an invalid checkVerifyToken result throws permission-denied', async () => {
    seedCall('call-bad-token', {
      householdId: 'demo',
      state: 'verifying',
      verification: { memberId: 'brenden', promptedAt: 1000 },
    });
    mockCheckVerifyToken.mockReturnValueOnce(false);

    await expectHttpsErrorCode(
      answerVerification.run({ data: { callId: 'call-bad-token', memberId: 'brenden', answer: 'yes', token: 'bad' } } as never),
      'permission-denied',
    );
    expect(mockReleaseCall).not.toHaveBeenCalled();
  });

  it('an invalid/expired verifyAuthenticationResponse throws permission-denied', async () => {
    seedHousehold([
      {
        id: 'brenden',
        name: 'Brenden',
        relation: 'grandson',
        aliases: [],
        passkeyCredentialIds: [],
        passkeys: [{ id: 'cred-1', publicKey: 'YWJj', counter: 5, transports: ['internal'], deviceType: 'singleDevice', backedUp: false }],
      },
    ]);
    fakeDb.__docs.set('webauthnChallenges/brenden', { challenge: 'auth-chal-3', expiresAt: Date.now() + 60_000 });
    seedCall('call-bad-assertion', {
      householdId: 'demo',
      state: 'verifying',
      verification: { memberId: 'brenden', promptedAt: 1000 },
    });
    mockVerifyAuthenticationResponse.mockResolvedValueOnce({ verified: false });

    await expectHttpsErrorCode(
      answerVerification.run({
        data: { callId: 'call-bad-assertion', memberId: 'brenden', answer: 'yes', response: { id: 'cred-1' } },
      } as never),
      'permission-denied',
    );
    expect(mockReleaseCall).not.toHaveBeenCalled();
  });
});

describe('expireVerification (06-I server-side timeout backstop)', () => {
  it('applies the timeout verdict (same effects as the phone answering timeout) once promptedAt + 25s has passed', async () => {
    seedCall('call-due', {
      householdId: 'demo',
      providerCallId: 'CAdue',
      state: 'verifying',
      verification: { memberId: 'brenden', promptedAt: Date.now() - 30_000, name: 'Brenden' },
    });

    const result = await expireVerification.run({ data: { callId: 'call-due' } } as never);

    expect(result).toEqual({ expired: true });
    expect(mockForceEndCall).toHaveBeenCalledWith('CAdue', expect.any(String));
    const doc = fakeDb.__docs.get('calls/call-due') as Record<string, unknown>;
    expect(doc.state).toBe('scam');
    expect(doc.outcome).toBe('scam');
    expect(typeof doc.endedAt).toBe('number');
    const v = doc.verification as { answer: string; answeredAt: number; memberId: string; name: string };
    expect(v).toMatchObject({ answer: 'timeout', memberId: 'brenden', name: 'Brenden' });
    expect(typeof v.answeredAt).toBe('number');

    // Idempotent: a second call (e.g. /sim and /stage both firing) is a no-op.
    mockForceEndCall.mockReset();
    expect(await expireVerification.run({ data: { callId: 'call-due' } } as never)).toMatchObject({ expired: false });
    expect(mockForceEndCall).not.toHaveBeenCalled();
    // And the phone answering late is still rejected by verdict finality.
    await expectHttpsErrorCode(
      answerVerification.run({ data: { callId: 'call-due', memberId: 'brenden', answer: 'timeout' } } as never),
      'failed-precondition',
    );
  });

  it('is a no-op if the call was already answered (verdict finality)', async () => {
    const answered = {
      householdId: 'demo',
      providerCallId: 'CAans',
      state: 'verifying',
      verification: { memberId: 'brenden', promptedAt: Date.now() - 60_000, answer: 'yes', answeredAt: Date.now() - 50_000 },
    };
    seedCall('call-answered', answered);

    const result = await expireVerification.run({ data: { callId: 'call-answered' } } as never);

    expect(result).toEqual({ expired: false, reason: 'already-answered' });
    expect(mockForceEndCall).not.toHaveBeenCalled();
    expect(fakeDb.__docs.get('calls/call-answered')).toEqual(answered);
  });

  it('is a no-op if the call already left verifying (e.g. verified/scam/ended)', async () => {
    seedCall('call-verified', {
      householdId: 'demo',
      state: 'verified',
      verification: { memberId: 'brenden', promptedAt: Date.now() - 60_000 },
    });
    expect(await expireVerification.run({ data: { callId: 'call-verified' } } as never)).toEqual({
      expired: false,
      reason: 'not-verifying',
    });
    expect((fakeDb.__docs.get('calls/call-verified') as { state: string }).state).toBe('verified');
  });

  it('is a no-op if it is too early (server clock, not the client, decides)', async () => {
    seedCall('call-early', {
      householdId: 'demo',
      providerCallId: 'CAearly',
      state: 'verifying',
      verification: { memberId: 'brenden', promptedAt: Date.now() - 10_000 },
    });

    const result = await expireVerification.run({ data: { callId: 'call-early' } } as never);

    expect(result).toEqual({ expired: false, reason: 'too-early' });
    expect(mockForceEndCall).not.toHaveBeenCalled();
    expect((fakeDb.__docs.get('calls/call-early') as { state: string }).state).toBe('verifying');
  });

  it('unknown call id is a no-op, not a throw', async () => {
    expect(await expireVerification.run({ data: { callId: 'nope' } } as never)).toEqual({ expired: false, reason: 'not-found' });
  });
});
