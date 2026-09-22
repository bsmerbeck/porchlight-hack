import { onCall, HttpsError } from 'firebase-functions/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const REGION = 'us-central1';

interface RaiseFamilyAlertInput {
  householdId: string;
}

// Plain typeof/length check — no new shared zod schema needed for this single small callable
// (03-RESEARCH.md, Task 3 action text).
function isValidInput(data: unknown): data is RaiseFamilyAlertInput {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { householdId?: unknown }).householdId === 'string' &&
    (data as { householdId: string }).householdId.length > 0
  );
}

// LAMP-04: a Pi joystick press (relayed by bridge/index.mjs's poll loop) becomes a
// households/{id}/alerts record. A real trust boundary (T-03-08) — anyone with the project's
// public config could in principle invoke this callable, not just the bridge — so it looks up
// the household server-side before writing anything, rejecting unknown ids with `not-found`
// rather than silently writing an alert against a made-up path.
export const raiseFamilyAlert = onCall({ region: REGION, cors: true, maxInstances: 5 }, async (req) => {
  if (!isValidInput(req.data)) {
    throw new HttpsError('invalid-argument', 'householdId (non-empty string) is required');
  }
  const { householdId } = req.data;

  const db = getFirestore();
  const householdSnap = await db.doc(`households/${householdId}`).get();
  if (!householdSnap.exists) {
    throw new HttpsError('not-found', `household ${householdId} not found`);
  }

  const ref = await db.collection(`households/${householdId}/alerts`).add({
    type: 'family-call-request',
    source: 'lamp-joystick',
    createdAt: FieldValue.serverTimestamp(),
  });

  return { id: ref.id };
});
