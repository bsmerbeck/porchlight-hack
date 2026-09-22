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

// 02-FIX: the standard line spoken whenever this module OVERRIDES Claude's own
// recommendedAction to 'verify' because the caller's claimed identity matched a real
// household member -- keeps the caller on the line instead of whatever ending/declining
// line Claude generated under the assumption it was ending the call. Only used when the
// override actually changes the action (see below); if Claude already said 'verify' on
// its own, its own reply is kept as-is.
const FAMILY_VERIFY_REPLY = "One moment, I'm checking with the family.";

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

  // 02-FIX: carry a claimed identity forward across turns. Claude's structured output
  // only reports claimedIdentity on the turn it's actually stated (or wherever it
  // happens to repeat it); `risk` is a full-object overwrite below, not a merge, so a
  // later turn that omits claimedIdentity would otherwise silently erase an
  // already-established claim -- which is exactly what happened in the live bug this
  // fixes: a caller said "it's Brenden" on turn 1, then delivered the scam script on
  // turn 2 without repeating the name, and the (then per-turn-doc) code had no memory of
  // the earlier claim when deciding whether to end the call.
  const priorClaimedIdentity = (callData?.risk as { claimedIdentity?: string } | undefined)?.claimedIdentity;
  const effectiveClaimedIdentity = turn.claimedIdentity ?? priorClaimedIdentity ?? null;
  const memberId = effectiveClaimedIdentity
    ? await matchIdentity(opts.householdId, effectiveClaimedIdentity)
    : undefined;

  // 02-FIX (policy): once a caller's claimed identity matches a real household member,
  // ALWAYS hold the call for family verification -- never let the AI end the call on its
  // own, regardless of risk score or what Claude itself recommended. Ending the call
  // outright would foreclose the "real family member taps the verify prompt, lamp turns
  // red" loop that is this product's core value; a human verification decision always
  // outranks an AI-decided hangup. Only a genuinely unclaimed caller can be ended
  // directly by the AI, and only at a high-confidence risk score.
  let effectiveAction: RiskTurn['recommendedAction'];
  let effectiveReply = turn.reply;
  if (memberId) {
    effectiveAction = 'verify';
    if (turn.recommendedAction !== 'verify') {
      // Claude generated its reply under a different assumption (e.g. an
      // ending/declining line) -- replace it so the caller hears something consistent
      // with the call actually staying open, not the farewell/decline Claude drafted.
      effectiveReply = FAMILY_VERIFY_REPLY;
    }
  } else if (turn.recommendedAction === 'end' && turn.risk < 80) {
    // No family claim and not a high-confidence scam signal -- a marginal 'end'
    // recommendation should not hang up on what might just be a genuine stranger.
    effectiveAction = 'continue';
  } else {
    effectiveAction = turn.recommendedAction;
  }

  // Pitfall 1: arrayUnion() silently drops serverTimestamp() nested inside array elements —
  // use Date.now() epoch-ms for `at` (matches the locked CallTurn.at: number schema).
  const at1 = Date.now();
  const at2 = at1 + 1;

  // The real (non-mocked) Firestore Admin SDK throws "Cannot use 'undefined' as a
  // Firestore value" on ANY explicit undefined, nested or not (no
  // ignoreUndefinedProperties setting is configured for this project) -- confirmed live
  // via 02-02's post-deploy curl verification, where every turn with a null
  // claimedIdentity (the common case, before a caller states who they are) threw on
  // this exact field and silently fell back to the generic reply. Omit the key
  // entirely instead of writing `claimedIdentity: undefined`.
  const risk: Record<string, unknown> = {
    score: turn.risk,
    tactics: turn.tactics,
    recommendedAction: effectiveAction,
    // OK here — risk is a top-level map field being update()d directly, not an array element.
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (effectiveClaimedIdentity) {
    risk.claimedIdentity = effectiveClaimedIdentity;
  }

  const update: Record<string, unknown> = {
    turns: FieldValue.arrayUnion(
      { role: 'caller', text: opts.callerText, at: at1 } satisfies CallTurn,
      { role: 'assistant', text: effectiveReply, at: at2 } satisfies CallTurn,
    ),
    risk,
  };

  if (effectiveAction === 'verify' && memberId) {
    update.state = 'verifying';
    update.verification = { memberId, promptedAt: Date.now() };
  } else if (effectiveAction === 'end') {
    // CALL-05: the AI's own end recommendation persists endedAt/outcome in the SAME write —
    // no external hangup signal (Twilio/webhook) is required for this path.
    update.state = 'scam';
    update.outcome = 'scam';
    update.endedAt = Date.now();
  }

  await callRef.update(update);

  return { reply: effectiveReply, endCall: effectiveAction === 'end' };
}
