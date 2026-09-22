import { onRequest } from 'firebase-functions/https';
import { getFirestore } from 'firebase-admin/firestore';
import { DEMO_HOUSEHOLD_ID } from './runTurn.js';

const REGION = 'us-central1';

type PersonalizationRequestBody = {
  caller_id?: string;
  call_sid?: string;
};

/**
 * Call-start webhook (Pattern 5, 02-RESEARCH.md). ElevenLabs POSTs here before the
 * conversation starts; we create the calls/{id} doc (D-05 schema) and capture the
 * Twilio CallSid as providerCallId so a later external verdict can hang up/release the
 * real call leg via endCall.ts's Twilio REST path. Responds with `dynamic_variables`
 * so `call_doc_id` can round-trip through the rest of the call (see Open Question 2
 * in elevenlabsCustomLlm.ts).
 *
 * T-02-07 (accepted risk): no bearer check here -- this fires before any conversation
 * exists, so there is no shared secret to check yet. Worst case is a junk
 * screening-state doc; acceptable for a one-night demo.
 */
export const elevenlabsPersonalization = onRequest({ region: REGION }, async (req, res) => {
  const { caller_id, call_sid } = (req.body ?? {}) as PersonalizationRequestBody;

  const doc: Record<string, unknown> = {
    householdId: DEMO_HOUSEHOLD_ID,
    state: 'screening',
    from: caller_id ?? 'unknown',
    provider: 'elevenlabs' as const,
    turns: [],
    risk: { score: 0, tactics: [], recommendedAction: 'continue' as const, updatedAt: Date.now() },
    startedAt: Date.now(),
  };
  // Firestore's Admin SDK throws on an explicit `undefined` value (no
  // ignoreUndefinedProperties setting is configured) -- omit the key entirely rather
  // than writing providerCallId: undefined. `call_sid` is also documented as an empty
  // string on non-Twilio channels (WhatsApp/SMS), so guard on truthiness, not just
  // presence.
  if (call_sid) {
    doc.providerCallId = call_sid;
  }

  const ref = await getFirestore().collection('calls').add(doc);

  res.json({ dynamic_variables: { call_doc_id: ref.id } });
});
