import Anthropic from '@anthropic-ai/sdk';
import { onDocumentWritten } from 'firebase-functions/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import type { CallDoc } from '@porchlight/shared';
import { anthropicKey } from '../secrets.js';

const REGION = 'us-central1';

const FALLBACK_REPORT = 'Report unavailable -- see call transcript.';

let client: Anthropic | undefined;
function getClient(): Anthropic {
  // Lazy singleton, same pattern as runTurn.ts's getClient() -- reads ANTHROPIC_API_KEY
  // from env at first call, not at module load.
  if (!client) client = new Anthropic();
  return client;
}

function buildPrompt(call: CallDoc): string {
  const transcript = (call.turns ?? [])
    .map((t) => `${t.role === 'caller' ? 'Caller' : 'Porchlight'}: ${t.text}`)
    .join('\n');

  return [
    'You are writing a short, plain-English report for a family about a phone call that Porchlight (an AI call screener protecting their aging relative) just finished handling.',
    '',
    `Outcome: ${call.outcome ?? call.state}`,
    `Risk score: ${call.risk?.score ?? 0}/100`,
    `Tactics detected: ${(call.risk?.tactics ?? []).join(', ') || 'none'}`,
    `Caller claimed to be: ${call.risk?.claimedIdentity ?? 'unknown'}`,
    '',
    'Transcript:',
    transcript || '(no turns recorded)',
    '',
    'Write 2-4 plain-English sentences (no jargon, no bullet points) covering: what the caller wanted, why the call was flagged as risky (or why it was cleared, if it was a verified family member), and what Porchlight did about it.',
  ].join('\n');
}

async function generateReport(call: CallDoc): Promise<string> {
  try {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: buildPrompt(call) }],
    });
    const textBlock = response.content.find((block) => block.type === 'text');
    const text = textBlock && 'text' in textBlock ? textBlock.text.trim() : '';
    return text || FALLBACK_REPORT;
  } catch (err) {
    console.error('writeFamilyReport: Claude call failed, writing fallback report', err);
    return FALLBACK_REPORT;
  }
}

/**
 * RISK-04: every call that reaches a terminal state grows its own plain-English report,
 * with no human writing it by hand. Fires exactly once per call -- on the transition
 * from no-`endedAt` to `endedAt` set -- so this trigger's own `report`-only write (which
 * never touches `endedAt`) can never re-trigger itself. Phase 4's existing
 * mirrorActiveCallToLamp trigger (functions/src/lamp.ts) already unconditionally
 * re-copies the whole calls/{id} doc, including this new `report` field, to
 * households/{id}/feed/{callId} on every write -- no second mirror write here.
 */
export const writeFamilyReport = onDocumentWritten(
  { document: 'calls/{callId}', region: REGION, secrets: [anthropicKey] },
  async (event) => {
    const before = event.data?.before.data() as CallDoc | undefined;
    const after = event.data?.after.data() as CallDoc | undefined;

    if (before?.endedAt || !after?.endedAt) {
      return;
    }

    const report = await generateReport(after);

    await getFirestore().doc(`calls/${event.params.callId}`).update({ report });
  },
);
