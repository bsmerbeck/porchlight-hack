import { onCall, onRequest, HttpsError } from 'firebase-functions/https';
import { onDocumentCreated } from 'firebase-functions/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { WaitlistPayload, CALL_STATES } from '@porchlight/shared';
import { anthropicKey, twilioAccountSid, twilioAuthToken, elevenLabsKey, elevenLabsLlmToken } from './secrets.js';
import { startSimulatedCall, simulateTurn } from './screening/simulateTurn.js';
import { mirrorActiveCallToLamp } from './lamp.js';
import { raiseFamilyAlert } from './alerts.js';
import { elevenlabsCustomLlm } from './screening/elevenlabsCustomLlm.js';
import { elevenlabsPersonalization } from './screening/elevenlabsPersonalization.js';
import { forceVerdict } from './screening/endCall.js';
import { startPasskeyRegistration, finishPasskeyRegistration } from './verification/passkeyRegistration.js';
import { startPasskeyAuthentication, answerVerification } from './verification/passkeyAuthentication.js';
import { resetDemo } from './demo/resetDemo.js';
import { writeFamilyReport } from './reports/writeFamilyReport.js';
import { attackCall } from './attack/attackCall.js';

initializeApp();

const REGION = 'us-central1';

// Phase 3 (Plan 02): Firestore -> lamp bridge. Owned by functions/src/lamp.ts / alerts.ts.
export { mirrorActiveCallToLamp, raiseFamilyAlert };

// Declared in ./secrets.ts so screening modules can import the SecretParam objects
// directly without a circular import through this file. Re-exported here so
// `functions:secrets:set` + deploy binding are exercised tonight. Only
// ANTHROPIC_API_KEY has a real value tonight; the others are placeholders until
// Phase 2's human checkpoint. ELEVENLABS_LLM_TOKEN is a shared bearer secret the
// executor generates itself (see 02-02-SUMMARY.md "Human follow-up").
export { anthropicKey, twilioAccountSid, twilioAuthToken, elevenLabsKey, elevenLabsLlmToken };
export { startSimulatedCall, simulateTurn };
// 02-02 Task 1: elevenlabsCustomLlm is the agent's entire brain, wired to runTurn (02-01).
// 02-02 Task 2: elevenlabsPersonalization creates the call doc at ring time; forceVerdict
// is the debug/demo end-or-release path ahead of Phase 4's real verification UI.
export { elevenlabsCustomLlm, elevenlabsPersonalization, forceVerdict };
// Phase 4 (Plan 01): VER-01 passkey enrollment. Owned by functions/src/verification/passkeyRegistration.ts.
export { startPasskeyRegistration, finishPasskeyRegistration };
// Phase 4 (Plan 01): VER-03/04/05 passkey authentication + verdict. Owned by
// functions/src/verification/passkeyAuthentication.ts.
export { startPasskeyAuthentication, answerVerification };
// Phase 5 (Plan 01): DEMO-01 one-command reset. Owned by functions/src/demo/resetDemo.ts.
export { resetDemo };
// Phase 5 (Plan 01): RISK-04 post-call plain-English family report. Owned by
// functions/src/reports/writeFamilyReport.ts.
export { writeFamilyReport };
// Phase 5 (Plan 02): ATK-01/ATK-02 attack simulator -- DEMO_TOKEN-gated onCall that
// places a real outbound call, in the consented cloned-voice "Attacker" agent, to the
// hardcoded Porchlight number only. Owned by functions/src/attack/attackCall.ts.
export { attackCall };

export const joinWaitlist = onCall({ region: REGION, cors: true, maxInstances: 5 }, async (req) => {
  const parsed = WaitlistPayload.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid signup', parsed.error.flatten());
  }
  const ua = req.rawRequest.get('user-agent')?.slice(0, 200);
  const ref = await getFirestore()
    .collection('waitlist')
    .add({
      ...parsed.data,
      ua,
      createdAt: FieldValue.serverTimestamp(),
    });
  return { id: ref.id };
});

export const onWaitlistCreated = onDocumentCreated({ document: 'waitlist/{id}', region: REGION }, async () => {
  await getFirestore().doc('stats/waitlist').set({ count: FieldValue.increment(1) }, { merge: true });
});

// Placeholder endpoint whose only job is binding the four vendor secrets so
// `functions:secrets:set` + deploy binding are exercised tonight. Reports
// presence only, never values.
export const healthz = onRequest(
  { region: REGION, secrets: [anthropicKey, twilioAccountSid, twilioAuthToken, elevenLabsKey] },
  (_req, res) => {
    const names = ['ANTHROPIC_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'ELEVENLABS_API_KEY'];
    res.json({
      ok: true,
      secrets: names.map((n) => (process.env[n] ? 'set' : 'unset')),
      states: CALL_STATES,
    });
  },
);
