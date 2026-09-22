import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets us reference these from inside the vi.mock factories below, which are
// themselves hoisted above all imports by Vitest (mirrors runTurn.test.ts/endCall.test.ts).
const { fakeDb, resetFakeDb, mockGenerateRegistrationOptions, mockVerifyRegistrationResponse } = vi.hoisted(() => {
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
    mockGenerateRegistrationOptions: vi.fn(),
    mockVerifyRegistrationResponse: vi.fn(),
  };
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => fakeDb,
}));

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: mockGenerateRegistrationOptions,
  verifyRegistrationResponse: mockVerifyRegistrationResponse,
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

vi.mock('@simplewebauthn/server/helpers', () => ({
  isoBase64URL: {
    // Real (not vendor-crypto) round-trip encoding is sufficient here -- these tests only
    // need to confirm this codebase never persists a raw Uint8Array, not re-verify
    // SimpleWebAuthn's own base64url implementation.
    fromBuffer: (buf: Uint8Array) => Buffer.from(buf).toString('base64url'),
    toBuffer: (str: string) => new Uint8Array(Buffer.from(str, 'base64url')),
  },
}));

import { startPasskeyRegistration, finishPasskeyRegistration } from './passkeyRegistration.js';

function seedHousehold(members: Array<Record<string, unknown>>) {
  fakeDb.__docs.set('households/demo', { name: 'Demo household', seniorName: 'Margaret', members });
}

beforeEach(() => {
  resetFakeDb();
  mockGenerateRegistrationOptions.mockReset();
  mockVerifyRegistrationResponse.mockReset();
});

describe('startPasskeyRegistration', () => {
  it('returns options scoped to the correct rpID and writes a challenge doc with a ~5min expiresAt', async () => {
    seedHousehold([{ id: 'brenden', name: 'Brenden', relation: 'grandson', aliases: [], passkeyCredentialIds: [] }]);
    mockGenerateRegistrationOptions.mockResolvedValueOnce({ challenge: 'chal-1', rp: { id: 'porchlight-hack.web.app' } });

    const before = Date.now();
    const result = await startPasskeyRegistration.run({ data: { memberId: 'brenden' } } as never);
    const after = Date.now();

    expect((result as { rp: { id: string } }).rp.id).toBe('porchlight-hack.web.app');

    const [[opts]] = mockGenerateRegistrationOptions.mock.calls;
    expect(opts.rpID).toBe('porchlight-hack.web.app');

    const challenge = fakeDb.__docs.get('webauthnChallenges/brenden') as { challenge: string; expiresAt: number };
    expect(challenge.challenge).toBe('chal-1');
    expect(challenge.expiresAt).toBeGreaterThanOrEqual(before + 5 * 60_000 - 1000);
    expect(challenge.expiresAt).toBeLessThanOrEqual(after + 5 * 60_000 + 1000);
  });

  it('populates excludeCredentials from a member with existing passkeys', async () => {
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
    mockGenerateRegistrationOptions.mockResolvedValueOnce({ challenge: 'chal-2' });

    await startPasskeyRegistration.run({ data: { memberId: 'brenden' } } as never);

    const [[opts]] = mockGenerateRegistrationOptions.mock.calls;
    expect(opts.excludeCredentials).toEqual([{ id: 'cred-1', transports: ['internal'] }]);
  });
});

describe('finishPasskeyRegistration', () => {
  it('throws deadline-exceeded on an expired challenge and does not touch the household doc', async () => {
    seedHousehold([{ id: 'brenden', name: 'Brenden', relation: 'grandson', aliases: [], passkeyCredentialIds: [] }]);
    fakeDb.__docs.set('webauthnChallenges/brenden', { challenge: 'chal-3', expiresAt: Date.now() - 1000 });
    const before = fakeDb.__docs.get('households/demo');

    await expect(finishPasskeyRegistration.run({ data: { memberId: 'brenden', response: {} } } as never)).rejects.toThrow(
      /deadline-exceeded|expired/i,
    );

    expect(mockVerifyRegistrationResponse).not.toHaveBeenCalled();
    expect(fakeDb.__docs.get('households/demo')).toEqual(before);
  });

  it('appends a base64url-encoded passkey to the member\'s array on a verified ceremony, and deletes the challenge doc', async () => {
    seedHousehold([{ id: 'brenden', name: 'Brenden', relation: 'grandson', aliases: [], passkeyCredentialIds: [] }]);
    fakeDb.__docs.set('webauthnChallenges/brenden', { challenge: 'chal-4', expiresAt: Date.now() + 60_000 });
    const rawPublicKey = new Uint8Array([1, 2, 3, 4]);
    mockVerifyRegistrationResponse.mockResolvedValueOnce({
      verified: true,
      registrationInfo: {
        credential: { id: 'cred-new', publicKey: rawPublicKey, counter: 0, transports: ['internal'] },
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
      },
    });

    const result = await finishPasskeyRegistration.run({ data: { memberId: 'brenden', response: { id: 'cred-new' } } } as never);

    expect(result).toEqual({ ok: true });
    const household = fakeDb.__docs.get('households/demo') as { members: Array<Record<string, unknown>> };
    const passkeys = household.members[0].passkeys as Array<Record<string, unknown>>;
    expect(passkeys).toHaveLength(1);
    expect(passkeys[0].id).toBe('cred-new');
    expect(typeof passkeys[0].publicKey).toBe('string');
    expect(passkeys[0].publicKey).not.toBeInstanceOf(Uint8Array);
    expect(passkeys[0].counter).toBe(0);

    expect(fakeDb.__docs.has('webauthnChallenges/brenden')).toBe(false);
  });

  it('throws permission-denied when verified is false and does not mutate the household doc', async () => {
    seedHousehold([{ id: 'brenden', name: 'Brenden', relation: 'grandson', aliases: [], passkeyCredentialIds: [] }]);
    fakeDb.__docs.set('webauthnChallenges/brenden', { challenge: 'chal-5', expiresAt: Date.now() + 60_000 });
    const before = fakeDb.__docs.get('households/demo');
    mockVerifyRegistrationResponse.mockResolvedValueOnce({ verified: false });

    await expect(finishPasskeyRegistration.run({ data: { memberId: 'brenden', response: {} } } as never)).rejects.toThrow(
      /permission-denied|failed/i,
    );

    expect(fakeDb.__docs.get('households/demo')).toEqual(before);
  });
});
