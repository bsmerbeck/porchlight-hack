import { z } from 'zod';
import { onCall, HttpsError } from 'firebase-functions/https';
import { getFirestore } from 'firebase-admin/firestore';
import { DEMO_HOUSEHOLD_ID, type HouseholdDoc, type HouseholdMember, type PasskeyCredential } from '@porchlight/shared';
import { generateRegistrationOptions, verifyRegistrationResponse, rpID, origin, encodePublicKey } from './webauthn.js';

const REGION = 'us-central1';

// 5-minute TTL, checked (not enforced by Firestore itself) in finishPasskeyRegistration --
// ASVS single-use-challenge control (04-RESEARCH.md Pitfall 2 / T-04-02).
const REGISTRATION_CHALLENGE_TTL_MS = 5 * 60_000;

async function getMember(memberId: string): Promise<HouseholdMember | undefined> {
  const snap = await getFirestore().doc(`households/${DEMO_HOUSEHOLD_ID}`).get();
  const household = snap.data() as HouseholdDoc | undefined;
  return household?.members?.find((m) => m.id === memberId);
}

const StartPasskeyRegistrationInput = z.object({ memberId: z.string().min(1) });

/**
 * VER-01: begin a family member's passkey enrollment ceremony. No secrets needed --
 * everything here is public options generation plus a short-lived challenge doc.
 */
export const startPasskeyRegistration = onCall({ region: REGION, cors: true, maxInstances: 5 }, async (req) => {
  const { memberId } = StartPasskeyRegistrationInput.parse(req.data);
  const member = await getMember(memberId);
  if (!member) {
    throw new HttpsError('not-found', `Unknown household member: ${memberId}`);
  }

  const options = await generateRegistrationOptions({
    rpName: 'Porchlight',
    rpID,
    userName: member.name,
    attestationType: 'none',
    // Excludes credentials this member already has so the same authenticator can't
    // register twice against the same member (04-RESEARCH.md Pattern 1).
    excludeCredentials: (member.passkeys ?? []).map((p) => ({ id: p.id, transports: p.transports })),
    // Pitfall 6: 'preferred', never 'required'/'discouraged' -- works acceptably across
    // iOS's always-resident and Android's opt-in resident-key behavior.
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });

  await getFirestore().doc(`webauthnChallenges/${memberId}`).set({
    challenge: options.challenge,
    expiresAt: Date.now() + REGISTRATION_CHALLENGE_TTL_MS,
  });

  return options;
});

const FinishPasskeyRegistrationInput = z.object({ memberId: z.string().min(1), response: z.unknown() });

/**
 * VER-01: complete the ceremony -- verify server-side against the stored challenge, then
 * append the new (base64url-encoded) passkey onto the member's array. D-06's locked shape
 * is an array-of-members household doc (no separate members subcollection), so this is a
 * read-modify-write on households/demo rather than a nested-doc write.
 */
export const finishPasskeyRegistration = onCall({ region: REGION, cors: true, maxInstances: 5 }, async (req) => {
  const { memberId, response } = FinishPasskeyRegistrationInput.parse(req.data);
  const db = getFirestore();
  const challengeRef = db.doc(`webauthnChallenges/${memberId}`);
  const challengeSnap = await challengeRef.get();
  const challengeData = challengeSnap.data() as { challenge: string; expiresAt: number } | undefined;

  if (!challengeSnap.exists || !challengeData || challengeData.expiresAt < Date.now()) {
    throw new HttpsError('deadline-exceeded', 'Registration challenge expired, retry');
  }

  const verification = await verifyRegistrationResponse({
    response: response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
    expectedChallenge: challengeData.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new HttpsError('permission-denied', 'Passkey registration failed');
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const passkey: PasskeyCredential = {
    id: credential.id,
    // Anti-Pattern guard: always base64url-encode before persisting, never a raw Uint8Array.
    publicKey: encodePublicKey(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
  };

  const householdRef = db.doc(`households/${DEMO_HOUSEHOLD_ID}`);
  const householdSnap = await householdRef.get();
  const household = householdSnap.data() as HouseholdDoc | undefined;
  const members = household?.members ?? [];
  const idx = members.findIndex((m) => m.id === memberId);
  if (idx === -1) {
    throw new HttpsError('not-found', `Unknown household member: ${memberId}`);
  }

  const updatedMembers = members.map((m, i) => (i === idx ? { ...m, passkeys: [...(m.passkeys ?? []), passkey] } : m));
  await householdRef.update({ members: updatedMembers });
  await challengeRef.delete();

  return { ok: true };
});
