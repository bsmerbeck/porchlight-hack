import { z } from 'zod';
import { onCall } from 'firebase-functions/https';
import { getFirestore } from 'firebase-admin/firestore';
import { anthropicKey } from '../secrets.js';
import { runTurn, DEMO_HOUSEHOLD_ID } from './runTurn.js';

const REGION = 'us-central1';

const StartSimulatedCallInput = z.object({});

// DEMO-05: creates a fresh calls/{id} doc, mirroring what the personalization webhook does
// for a real telephony call — minus the Twilio CallSid, since there is none.
export const startSimulatedCall = onCall({ region: REGION, cors: true, maxInstances: 5 }, async (req) => {
  StartSimulatedCallInput.parse(req.data ?? {});

  const ref = await getFirestore()
    .collection('calls')
    .add({
      householdId: DEMO_HOUSEHOLD_ID,
      state: 'screening',
      from: 'simulator',
      provider: 'simulator' as const,
      turns: [],
      risk: { score: 0, tactics: [], recommendedAction: 'continue' as const, updatedAt: Date.now() },
      startedAt: Date.now(),
    });

  return { callId: ref.id };
});

// Deliberately NO `householdId` field on this input schema — this is the ASVS L1
// access-control mitigation (T-02-02): the endpoint is an onCall (no Firebase Auth
// required) and structurally cannot address any household but the hardcoded demo one.
export const SimulateTurnInput = z.object({
  callId: z.string(),
  callerText: z.string(),
});

export const simulateTurn = onCall(
  { region: REGION, cors: true, maxInstances: 5, secrets: [anthropicKey] },
  async (req) => {
    const { callId, callerText } = SimulateTurnInput.parse(req.data);
    return runTurn({ callId, householdId: DEMO_HOUSEHOLD_ID, callerText });
  },
);
