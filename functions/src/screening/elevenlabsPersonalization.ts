import { onRequest } from 'firebase-functions/https';
import { getFirestore } from 'firebase-admin/firestore';
import { DEMO_HOUSEHOLD_ID } from './runTurn.js';
import { matchAllowlist } from './matchAllowlist.js';

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

  // 05-ALLOWLIST Task 2: a caller_id on the household's allowlist skips risk-scoring and
  // family-verification entirely -- the call doc is created ALREADY verified, and the
  // greeting-and-goodbye line is spoken from elevenlabsCustomLlm.ts's own first-turn
  // check (the ElevenLabs agent's first message is static in the dashboard, so this is
  // the only way to make the opening line personalized for a known caller).
  const allowlisted = await matchAllowlist(DEMO_HOUSEHOLD_ID, caller_id);

  const doc: Record<string, unknown> = {
    householdId: DEMO_HOUSEHOLD_ID,
    state: allowlisted ? 'verified' : 'screening',
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
  if (allowlisted) {
    doc.outcome = 'known' as const;
    doc.verification = {
      memberId: allowlisted.memberId,
      method: 'allowlist' as const,
      answeredAt: Date.now(),
      name: allowlisted.name,
    };
  }

  const ref = await getFirestore().collection('calls').add(doc);

  const dynamicVariables: Record<string, unknown> = { call_doc_id: ref.id };
  if (allowlisted) {
    // Templatable into the agent's system prompt/first message per ElevenLabs' own
    // dynamic-variables docs (see elevenlabsCustomLlm.ts's module comment) -- first name
    // only, matching lamp.ts's own never-more-than-a-first-name convention.
    dynamicVariables.caller_name = allowlisted.name.trim().split(/\s+/)[0];
    dynamicVariables.known_caller = true;
  }

  res.json({ dynamic_variables: dynamicVariables });
});
