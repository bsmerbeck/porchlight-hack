import { onDocumentWritten } from 'firebase-functions/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { CallDoc } from '@porchlight/shared';

const REGION = 'us-central1';

// Mirrors just the fields the Pi lamp needs out of the closed `calls/{id}` collection into a
// narrowly public `lamp/current` doc (firestore.rules: `allow get: if true; allow write: if false`).
// No other call field (transcript, risk detail, phone number) is ever mirrored here — see the
// phase's threat model (T-03-06).
export const mirrorActiveCallToLamp = onDocumentWritten({ document: 'calls/{callId}', region: REGION }, async (event) => {
  const after = event.data?.after.data() as CallDoc | undefined;
  const db = getFirestore();
  const lampRef = db.doc('lamp/current');

  if (!after || after.state === 'ended') {
    // Only clear if this write's callId is the one currently mirrored — avoids a stale/ended
    // call clobbering a newer active call that started after this write's `after` was read.
    const current = (await lampRef.get()).data();
    if (current?.callId === event.params.callId) {
      await lampRef.set({
        state: 'idle',
        callId: null,
        name: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return;
  }

  // Name resolution (household member lookup / claimedIdentity fallback) is added by Task 2 —
  // this tracer only proves the `state` field's path end-to-end.
  await lampRef.set({
    state: after.state,
    callId: event.params.callId,
    name: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
});
