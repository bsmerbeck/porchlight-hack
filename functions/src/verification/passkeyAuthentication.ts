import { z } from 'zod';
import { onCall, HttpsError } from 'firebase-functions/https';
import { getFirestore } from 'firebase-admin/firestore';
import { DEMO_HOUSEHOLD_ID, type CallDoc, type HouseholdDoc, type HouseholdMember } from '@porchlight/shared';
// Task 1 confirmed the ACTUAL exported names/signatures live in functions/src/screening/endCall.ts:
// forceEndCall(callSid: string, sayLine: string) -- Twilio hangup only, no Firestore write --
// and releaseCall(callId: string) -- looks up providerCallId itself and writes
// state:'verified'/outcome:'verified' internally. Never a second hand-rolled Twilio call here.
import { forceEndCall, releaseCall } from '../screening/endCall.js';
import { checkVerifyToken } from './verifyLink.js';
import { generateAuthenticationOptions, verifyAuthenticationResponse, rpID, origin, decodePublicKey } from './webauthn.js';
import { twilioAccountSid, twilioAuthToken, verifyLinkSecret } from '../secrets.js';

const REGION = 'us-central1';

// 60s TTL for an authentication ceremony -- shorter than registration's 5min because this
// runs against a live incoming call, not a leisurely enrollment flow (04-RESEARCH.md).
const AUTHENTICATION_CHALLENGE_TTL_MS = 60_000;

async function getMember(memberId: string): Promise<HouseholdMember | undefined> {
  const snap = await getFirestore().doc(`households/${DEMO_HOUSEHOLD_ID}`).get();
  const household = snap.data() as HouseholdDoc | undefined;
  return household?.members?.find((m) => m.id === memberId);
}

// Persists authenticationInfo.newCounter back onto the matching stored passkey's counter --
// the cloned-authenticator defense (T-04-04): a future assertion with a non-increasing
// counter is rejected by verifyAuthenticationResponse itself.
async function updatePasskeyCounter(memberId: string, credentialId: string, newCounter: number): Promise<void> {
  const db = getFirestore();
  const householdRef = db.doc(`households/${DEMO_HOUSEHOLD_ID}`);
  const householdSnap = await householdRef.get();
  const household = householdSnap.data() as HouseholdDoc | undefined;
  const members = household?.members ?? [];
  const updatedMembers = members.map((m) => {
    if (m.id !== memberId) return m;
    return {
      ...m,
      passkeys: (m.passkeys ?? []).map((p) => (p.id === credentialId ? { ...p, counter: newCounter } : p)),
    };
  });
  await householdRef.update({ members: updatedMembers });
}

const StartPasskeyAuthenticationInput = z.object({ memberId: z.string().min(1) });

/**
 * VER-03: begin the "Yes" ceremony. allowCredentials is ALWAYS scoped to this specific
 * member's stored passkeys -- never the empty/discoverable-credential flow (04-RESEARCH.md
 * Anti-Patterns) -- because the phone already knows which member it is paired to.
 */
export const startPasskeyAuthentication = onCall({ region: REGION, cors: true, maxInstances: 5 }, async (req) => {
  const { memberId } = StartPasskeyAuthenticationInput.parse(req.data);
  const member = await getMember(memberId);
  if (!member) {
    throw new HttpsError('not-found', `Unknown household member: ${memberId}`);
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: (member.passkeys ?? []).map((p) => ({ id: p.id, transports: p.transports })),
    userVerification: 'preferred',
  });

  await getFirestore().doc(`webauthnChallenges/${memberId}`).set({
    challenge: options.challenge,
    expiresAt: Date.now() + AUTHENTICATION_CHALLENGE_TTL_MS,
  });

  return options;
});

/**
 * The ONE "No"/"timeout" verdict path (04-FIX verdict finality): records the answer, marks
 * the call scam, and hangs up the Twilio leg. Shared by answerVerification (the phone) and
 * expireVerification (06-I server-side backstop) so both apply byte-identical effects.
 * Callers MUST have already checked `verification.answer` is unset.
 */
async function applyNoOrTimeoutVerdict(
  callId: string,
  callData: CallDoc,
  answer: 'no' | 'timeout',
  log: Record<string, unknown>,
): Promise<void> {
  const callRef = getFirestore().doc(`calls/${callId}`);
  await callRef.update({
    verification: { ...callData.verification, answer, answeredAt: Date.now() },
    state: 'scam',
    outcome: 'scam',
    endedAt: Date.now(),
  });
  // 04-FIX ("'No' must hang up"): forceEndCall() is the DIRECT hang-up path -- it calls
  // Twilio's REST call-control API itself, independent of whatever the ElevenLabs agent
  // thinks it's doing. If a call doc has no providerCallId (a simulated/demo call, or a
  // real call whose personalization webhook doc was never adopted -- see
  // elevenlabsCustomLlm.ts's Tier 3 fallback), there is no real Twilio call leg to hang
  // up here at all -- the ONLY way that call actually ends is runTurn()'s own
  // endCall:true/end_call-tool backstop on the next caller turn (see the "verdict
  // finality" fix above). Log loudly so a missing providerCallId on a call that SHOULD
  // have one (a real phone call) is never silently swallowed.
  if (callData.providerCallId) {
    try {
      await forceEndCall(callData.providerCallId, "I'm sorry, but this call has been identified as a scam and is being ended now.");
    } catch (err) {
      console.error('answerVerification: Twilio hang-up failed (verdict already written)', { callId, err, ...log });
    }
  } else {
    console.warn(
      "answerVerification: no providerCallId on call doc -- cannot directly hang up the Twilio call leg; relying on runTurn()/elevenlabsCustomLlm.ts's end_call fallback on the next caller turn",
      { callId, ...log },
    );
  }
}

const AnswerVerificationInput = z.object({
  callId: z.string().min(1),
  memberId: z.string().min(1),
  answer: z.enum(['yes', 'no', 'timeout']),
  response: z.unknown().optional(),
  token: z.string().optional(),
});

/**
 * VER-03/04/05: the single decision point for a family member's verdict on a live call.
 * Never trusts a bare `answer:'yes'` -- a real passkey assertion OR a valid single-use
 * VER-05 token is required before anything is marked verified (T-04-01). Single-use per
 * call: once `verification.answer` is set, a second call is rejected (VER-05 + the passkey
 * ceremony both close after one use).
 */
export const answerVerification = onCall(
  { region: REGION, cors: true, maxInstances: 5, secrets: [twilioAccountSid, twilioAuthToken, verifyLinkSecret] },
  async (req) => {
    const { callId, memberId, answer, response, token } = AnswerVerificationInput.parse(req.data);
    const db = getFirestore();
    const callRef = db.doc(`calls/${callId}`);
    const callSnap = await callRef.get();
    if (!callSnap.exists) {
      throw new HttpsError('not-found', `Unknown call: ${callId}`);
    }
    const callData = callSnap.data() as CallDoc;

    if (callData.verification?.answer) {
      throw new HttpsError('failed-precondition', 'Already answered');
    }

    if (answer !== 'yes') {
      await applyNoOrTimeoutVerdict(callId, callData, answer, { memberId });
      return { verified: false };
    }

    // answer === 'yes' from here on -- never trust it without real proof (T-04-01).
    if (!response && !token) {
      throw new HttpsError('invalid-argument', 'Yes requires a passkey response or a link token');
    }

    let method: 'passkey' | 'link';

    if (token) {
      // VER-05 fallback -- no WebAuthn ceremony at all, just a constant-time HMAC check.
      if (!checkVerifyToken(callId, memberId, token)) {
        throw new HttpsError('permission-denied', 'Bad or expired link');
      }
      method = 'link';
    } else {
      const challengeRef = db.doc(`webauthnChallenges/${memberId}`);
      const challengeSnap = await challengeRef.get();
      const challengeData = challengeSnap.data() as { challenge: string; expiresAt: number } | undefined;
      if (!challengeSnap.exists || !challengeData || challengeData.expiresAt < Date.now()) {
        throw new HttpsError('permission-denied', 'Authentication challenge expired');
      }

      const member = await getMember(memberId);
      const responseId = (response as { id?: string } | undefined)?.id;
      const passkey = member?.passkeys?.find((p) => p.id === responseId);
      if (!passkey) {
        throw new HttpsError('permission-denied', 'Unknown passkey');
      }

      const verification = await verifyAuthenticationResponse({
        response: response as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
        expectedChallenge: challengeData.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: passkey.id,
          publicKey: decodePublicKey(passkey.publicKey),
          counter: passkey.counter,
          transports: passkey.transports,
        },
      });

      if (!verification.verified) {
        throw new HttpsError('permission-denied', 'Passkey assertion failed');
      }

      await updatePasskeyCounter(memberId, passkey.id, verification.authenticationInfo.newCounter);
      await challengeRef.delete();
      method = 'passkey';
    }

    await callRef.update({
      verification: { ...callData.verification, answer: 'yes', answeredAt: Date.now(), method },
    });
    await releaseCall(callId);

    return { verified: true };
  },
);

/** 06-I: the phone's own countdown is 20s; the server backstop waits a little longer. */
export const VERIFY_EXPIRE_MS = 50_000;

const ExpireVerificationInput = z.object({ callId: z.string().min(1) });

/**
 * 06-I server-side backstop for the VER timeout. The 20s countdown lives only in the /verify
 * phone's browser, so with that phone locked/closed a call would sit on VERIFYING forever.
 * /stage (and /sim) call this once per callId when they see a verifying call past
 * promptedAt + 25s. No token needed: it can only ever apply the SAME outcome the phone's own
 * 'timeout' answer would, and only when the SERVER's record says it is due -- still
 * `verifying`, unanswered, and prompted >= 25s ago. Anything else is an idempotent no-op.
 */
export const expireVerification = onCall(
  { region: REGION, cors: true, maxInstances: 5, secrets: [twilioAccountSid, twilioAuthToken] },
  async (req) => {
    const { callId } = ExpireVerificationInput.parse(req.data);
    const snap = await getFirestore().doc(`calls/${callId}`).get();
    if (!snap.exists) return { expired: false, reason: 'not-found' };
    const callData = snap.data() as CallDoc;
    if (callData.verification?.answer) return { expired: false, reason: 'already-answered' };
    if (callData.state !== 'verifying') return { expired: false, reason: 'not-verifying' };
    const promptedAt = callData.verification?.promptedAt ?? callData.risk?.updatedAt ?? callData.startedAt;
    if (!promptedAt || Date.now() - promptedAt < VERIFY_EXPIRE_MS) return { expired: false, reason: 'too-early' };
    await applyNoOrTimeoutVerdict(callId, callData, 'timeout', {
      memberId: callData.verification?.memberId,
      via: 'expireVerification',
    });
    return { expired: true };
  },
);
