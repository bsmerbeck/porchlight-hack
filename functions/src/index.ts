import { onCall, onRequest, HttpsError } from 'firebase-functions/https';
import { onDocumentCreated } from 'firebase-functions/firestore';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { WaitlistPayload } from '@porchlight/shared';

initializeApp();

const REGION = 'us-central1';

// Declared now so `functions:secrets:set` + deploy binding are exercised tonight.
// Only ANTHROPIC_API_KEY has a real value tonight; the others are placeholders
// until Phase 2's human checkpoint.
export const anthropicKey = defineSecret('ANTHROPIC_API_KEY');
export const twilioAccountSid = defineSecret('TWILIO_ACCOUNT_SID');
export const twilioAuthToken = defineSecret('TWILIO_AUTH_TOKEN');
export const elevenLabsKey = defineSecret('ELEVENLABS_API_KEY');

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
    res.json({ ok: true, secrets: names.map((n) => (process.env[n] ? 'set' : 'unset')) });
  },
);
