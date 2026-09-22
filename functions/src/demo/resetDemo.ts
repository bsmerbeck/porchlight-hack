import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { onCall, HttpsError } from 'firebase-functions/https';
import { getFirestore } from 'firebase-admin/firestore';
import type { HouseholdDoc, HouseholdMember } from '@porchlight/shared';
import { demoToken, twilioAccountSid, twilioAuthToken } from '../secrets.js';
import { forceEndCall } from '../screening/endCall.js';

const REGION = 'us-central1';

// `token` is optional here (not `z.string()`) so a missing/malformed payload fails the
// SAME permission-denied gate as a wrong token, rather than zod throwing a raw
// ZodError from a schema-required field -- the acceptance criteria requires "wrong OR
// missing token" to both produce permission-denied with zero side effects.
const ResetDemoInput = z.object({
  token: z.string().optional(),
  keepCallIds: z.array(z.string()).optional(),
});

// D-06 baseline shape for the single demo household -- mirrors runTurn.ts's own seeding
// block (the only other place this literal is defined). A reset restores this baseline
// (name/members[].name/aliases/allowlist) but must NEVER clobber a member's
// already-enrolled `passkeys` array -- see the merge below.
// 05-ALLOWLIST Task 1: seeds the one real allowlisted caller for tonight's demo -- a
// number that rings in gets the allowlist pass-through (elevenlabsPersonalization.ts)
// instead of the screening/risk-scoring flow.
const DEMO_HOUSEHOLD_BASELINE: HouseholdDoc = {
  name: 'Demo household',
  seniorName: 'Margaret',
  members: [
    {
      id: 'brenden',
      name: 'Brenden',
      relation: 'grandson',
      aliases: ['Brenden', 'Brendan', 'your grandson'],
      passkeyCredentialIds: [],
    },
  ],
  allowlist: [{ number: '+14014979735', name: 'Brenden Smerbeck', relation: 'grandson' }],
};

// ASVS L1 gate (T-05-01): constant-time comparison, wrong-length short-circuits before
// ever touching timingSafeEqual (which throws on mismatched buffer lengths rather than
// returning false) -- mirrors verifyLink.ts's checkVerifyToken pattern exactly.
function checkDemoToken(token: string | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(demoToken.value());
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * DEMO-01: one-command reset of the entire demo state between runs. Gated by a shared
 * DEMO_TOKEN secret (T-05-01) checked FIRST, before any Firestore read/write or Twilio
 * call -- a wrong/missing token must have zero side effects.
 */
export const resetDemo = onCall(
  { region: REGION, cors: true, maxInstances: 5, secrets: [demoToken, twilioAccountSid, twilioAuthToken] },
  async (req) => {
    const { token, keepCallIds } = ResetDemoInput.parse(req.data);

    if (!checkDemoToken(token)) {
      throw new HttpsError('permission-denied', 'Invalid demo token');
    }

    const keep = new Set(keepCallIds ?? []);
    const db = getFirestore();

    // (1) calls/* -- force-end any still-live Twilio leg before deleting the doc. A
    // stale/already-ended Twilio call must never abort the reset (try/catch per call).
    const callsSnap = await db.collection('calls').get();
    let callsDeleted = 0;
    for (const doc of callsSnap.docs) {
      if (keep.has(doc.id)) continue;
      const data = doc.data() as { providerCallId?: string; endedAt?: number };
      if (data.providerCallId && !data.endedAt) {
        try {
          await forceEndCall(data.providerCallId, 'Demo resetting.');
        } catch (err) {
          console.error('resetDemo: forceEndCall failed, deleting call doc anyway', doc.id, err);
        }
      }
      await doc.ref.delete();
      callsDeleted++;
    }

    // (2) prompts/* -- clear every realtime verification prompt.
    const promptsSnap = await db.collection('prompts').get();
    let promptsCleared = 0;
    for (const doc of promptsSnap.docs) {
      await doc.ref.delete();
      promptsCleared++;
    }

    // (3) lamp/current -- back to idle.
    await db.doc('lamp/current').set({ state: 'idle' });

    // (4) households/demo -- restore the baseline name/members[].name/aliases, but carry
    // forward each member's existing `passkeys` array untouched so an already-enrolled
    // judge's passkey survives a reset between demo runs.
    const householdRef = db.doc('households/demo');
    const householdSnap = await householdRef.get();
    const existing = householdSnap.data() as HouseholdDoc | undefined;
    const members: HouseholdMember[] = DEMO_HOUSEHOLD_BASELINE.members.map((baseMember) => {
      const existingMember = existing?.members?.find((m) => m.id === baseMember.id);
      return existingMember?.passkeys ? { ...baseMember, passkeys: existingMember.passkeys } : { ...baseMember };
    });
    await householdRef.set({ ...DEMO_HOUSEHOLD_BASELINE, members });

    return { callsDeleted, promptsCleared };
  },
);
