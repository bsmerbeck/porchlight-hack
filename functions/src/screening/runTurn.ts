import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { DEMO_HOUSEHOLD_ID as SHARED_DEMO_HOUSEHOLD_ID, type CallTurn, type Tactic } from '@porchlight/shared';
import { RiskTurn } from './riskSchema.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { matchIdentity } from './matchIdentity.js';

// Re-exported so every caller of runTurn() can import the demo household id from this
// module alone; the canonical value is still defined once, in packages/shared/households.ts.
export const DEMO_HOUSEHOLD_ID = SHARED_DEMO_HOUSEHOLD_ID;

let client: Anthropic | undefined;
function getClient(): Anthropic {
  // Lazy singleton — reads ANTHROPIC_API_KEY from env at first call, not at module load,
  // so importing this module never throws before the secret is bound (see <precondition>).
  if (!client) client = new Anthropic();
  return client;
}

function fallbackTurn(previousRisk: { score: number; tactics: Tactic[] } | undefined): RiskTurn {
  return {
    reply: 'Could you say that again?',
    recommendedAction: 'continue',
    risk: previousRisk?.score ?? 0,
    tactics: previousRisk?.tactics ?? [],
    claimedIdentity: null,
  };
}

export interface RunTurnOptions {
  callId: string;
  householdId: string;
  callerText: string;
}

export interface RunTurnResult {
  reply: string;
  endCall: boolean;
}

/**
 * The shared per-turn screening core (RISK-01/02/03, CALL-03/05). One structured
 * claude-haiku-4-5 call, one Firestore update() — called identically by every later
 * plan's telephony handler and by simulateTurn (DEMO-05).
 */
export async function runTurn(opts: RunTurnOptions): Promise<RunTurnResult> {
  const db = getFirestore();

  const householdRef = db.doc(`households/${opts.householdId}`);
  const householdSnap = await householdRef.get();
  if (!householdSnap.exists && opts.householdId === DEMO_HOUSEHOLD_ID) {
    // Seed the demo household (D-06) so RISK-03 has something to match against.
    await householdRef.set({
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
    });
  }

  const callRef = db.doc(`calls/${opts.callId}`);
  const callSnap = await callRef.get();
  let callData = callSnap.data() as
    | { turns?: CallTurn[]; risk?: { score: number; tactics: Tactic[] } }
    | undefined;
  if (!callSnap.exists) {
    // D-05 schema — caller-side code (personalization webhook / startSimulatedCall) sets
    // provider/from/providerCallId separately when relevant; this is a fallback for a call
    // doc that does not exist yet (e.g. a direct runTurn invocation in tests).
    const initialDoc = {
      householdId: opts.householdId,
      state: 'screening',
      turns: [],
      risk: { score: 0, tactics: [] as Tactic[], recommendedAction: 'continue' as const, updatedAt: Date.now() },
      startedAt: Date.now(),
    };
    await callRef.set(initialDoc);
    callData = initialDoc;
  }

  const history = callData?.turns ?? [];
  const messages = [
    ...history.map((t) => ({
      role: t.role === 'caller' ? ('user' as const) : ('assistant' as const),
      content: t.text,
    })),
    { role: 'user' as const, content: opts.callerText },
  ];

  let turn: RiskTurn;
  try {
    const response = await getClient().messages.parse({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages,
      output_config: { format: zodOutputFormat(RiskTurn) },
    });
    if (!response.parsed_output) {
      console.error('runTurn: parsed_output was null, falling back to a generic reply', { callId: opts.callId });
      turn = fallbackTurn(callData?.risk);
    } else {
      turn = response.parsed_output;
    }
  } catch (err) {
    console.error('runTurn: Claude call failed, falling back to a generic reply', err);
    turn = fallbackTurn(callData?.risk);
  }

  const memberId = turn.claimedIdentity ? await matchIdentity(opts.householdId, turn.claimedIdentity) : undefined;

  // Pitfall 1: arrayUnion() silently drops serverTimestamp() nested inside array elements —
  // use Date.now() epoch-ms for `at` (matches the locked CallTurn.at: number schema).
  const at1 = Date.now();
  const at2 = at1 + 1;

  const update: Record<string, unknown> = {
    turns: FieldValue.arrayUnion(
      { role: 'caller', text: opts.callerText, at: at1 } satisfies CallTurn,
      { role: 'assistant', text: turn.reply, at: at2 } satisfies CallTurn,
    ),
    risk: {
      score: turn.risk,
      tactics: turn.tactics,
      claimedIdentity: turn.claimedIdentity ?? undefined,
      recommendedAction: turn.recommendedAction,
      // OK here — risk is a top-level map field being update()d directly, not an array element.
      updatedAt: FieldValue.serverTimestamp(),
    },
  };

  if (turn.recommendedAction === 'verify' && memberId) {
    update.state = 'verifying';
    update.verification = { memberId, promptedAt: Date.now() };
  } else if (turn.recommendedAction === 'end') {
    // CALL-05: the AI's own end recommendation persists endedAt/outcome in the SAME write —
    // no external hangup signal (Twilio/webhook) is required for this path.
    update.state = 'scam';
    update.outcome = 'scam';
    update.endedAt = Date.now();
  }

  await callRef.update(update);

  return { reply: turn.reply, endCall: turn.recommendedAction === 'end' };
}
