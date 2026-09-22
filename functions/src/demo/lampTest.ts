import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { onCall, HttpsError } from 'firebase-functions/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { demoToken } from '../secrets.js';

const REGION = 'us-central1';

const LampTestInput = z.object({
  token: z.string().optional(),
});

/**
 * Physical lamp sweep order. Only states the hardware understands: the Pi's VALID_STATES
 * and the bridge's Hue COLORS table are idle/screening/verifying/verified/scam/ended, so
 * the on-screen-only 'message' / 'known' looks are NOT written here (the Pi would reject
 * them). Always ends on idle.
 */
export const LAMP_TEST_SEQUENCE = ['screening', 'verifying', 'verified', 'scam', 'idle'] as const;
export const LAMP_TEST_STEP_MS = 1200;

/** lamp/current states that mean "no live call is using the lamp right now". */
const LAMP_FREE_STATES = new Set(['idle', 'ended', undefined]);

function checkDemoToken(token: string | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(demoToken.value());
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 06-H: real "Lamp test" for the OperatorBar. DEMO_TOKEN-gated (checked FIRST, zero side
 * effects on a wrong/missing token), then cycles `lamp/current` through the sweep so the
 * existing Mac bridge mirrors each step to the Pi + Hue. Refuses (failed-precondition) if
 * a live call currently owns the lamp so a test can never clobber a real screening.
 */
export const lampTest = onCall(
  { region: REGION, cors: true, maxInstances: 2, timeoutSeconds: 60, secrets: [demoToken] },
  async (req) => {
    const { token } = LampTestInput.parse(req.data ?? {});
    if (!checkDemoToken(token)) {
      throw new HttpsError('permission-denied', 'Invalid demo token');
    }

    const lampRef = getFirestore().doc('lamp/current');
    const current = (await lampRef.get()).data() as { state?: string; callId?: string | null } | undefined;
    if (current?.callId && !LAMP_FREE_STATES.has(current.state)) {
      throw new HttpsError('failed-precondition', 'A live call is using the lamp');
    }

    for (let i = 0; i < LAMP_TEST_SEQUENCE.length; i++) {
      if (i > 0) await sleep(LAMP_TEST_STEP_MS);
      await lampRef.set({
        state: LAMP_TEST_SEQUENCE[i],
        callId: null,
        name: null,
        lampTest: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return { steps: LAMP_TEST_SEQUENCE.length };
  },
);
