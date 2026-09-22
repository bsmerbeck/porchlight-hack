import { z } from 'zod';
import { onCall } from 'firebase-functions/https';
import { getFirestore } from 'firebase-admin/firestore';
import twilio from 'twilio';
import { twilioAccountSid, twilioAuthToken } from '../secrets.js';

const REGION = 'us-central1';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Reuses the SAME TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN SecretParam objects already
// declared in functions/src/secrets.ts (D-04) -- never a second defineSecret() for the
// same name. Lazy singleton so the client is only constructed once the secrets are
// actually bound (at request time), matching runTurn.ts's getClient() pattern.
let client: ReturnType<typeof twilio> | undefined;
function getTwilioClient(): ReturnType<typeof twilio> {
  if (!client) client = twilio(twilioAccountSid.value(), twilioAuthToken.value());
  return client;
}

async function updateCallWithSay(callSid: string, sayLine: string, hangup: boolean): Promise<void> {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${escapeXml(sayLine)}</Say>${hangup ? '<Hangup/>' : ''}</Response>`;
  await getTwilioClient().calls(callSid).update({ twiml });
}

/**
 * Ends a real, in-progress call from OUTSIDE the live ElevenLabs conversation turn
 * (Pattern 4, 02-RESEARCH.md), using Twilio's REST call-control API directly --
 * this works regardless of what the ElevenLabs agent thinks it's doing, because
 * Twilio, not ElevenLabs, owns the call leg.
 */
export async function forceEndCall(callSid: string, sayLine: string): Promise<void> {
  await updateCallWithSay(callSid, sayLine, true);
}

/**
 * A "verified" verdict: speaks a hand-off line (if this is a real call with a
 * providerCallId) WITHOUT hanging up -- the household member is being put through,
 * not disconnected -- and marks the call doc verified/released. Simulator-provenance
 * docs (no providerCallId) skip the Twilio call entirely -- there is no real call leg
 * to touch.
 */
export async function releaseCall(callId: string): Promise<void> {
  const db = getFirestore();
  const ref = db.doc(`calls/${callId}`);
  const snap = await ref.get();
  const providerCallId = (snap.data() as { providerCallId?: string } | undefined)?.providerCallId;

  if (providerCallId) {
    await updateCallWithSay(providerCallId, "Thanks, I've confirmed who you are. I'll put you through.", false);
  }

  await ref.update({ state: 'verified', outcome: 'verified' });
}

const ForceVerdictInput = z.object({
  callId: z.string(),
  verdict: z.enum(['verified', 'scam']),
});

/**
 * Debug/demo-only forced-verdict path (CALL-04), useful ahead of Phase 4's real
 * passkey-gated verification UI. T-02-09 (accepted risk): deliberately NOT gated by
 * Firebase Auth in this phase -- a leaked callId lets someone end/release one demo
 * call, no broader blast radius.
 */
export const forceVerdict = onCall(
  { region: REGION, cors: true, maxInstances: 5, secrets: [twilioAccountSid, twilioAuthToken] },
  async (req) => {
    const { callId, verdict } = ForceVerdictInput.parse(req.data);

    if (verdict === 'verified') {
      await releaseCall(callId);
      return { callId, verdict };
    }

    const db = getFirestore();
    const ref = db.doc(`calls/${callId}`);
    const snap = await ref.get();
    const providerCallId = (snap.data() as { providerCallId?: string } | undefined)?.providerCallId;

    if (providerCallId) {
      await forceEndCall(providerCallId, 'I need to end this call now.');
    }

    // CALL-04 + CALL-05: same field names as runTurn's AI-initiated end path (02-01) --
    // state/outcome/endedAt, so the Phase 4 dashboard reads one consistent shape
    // regardless of which path ended the call.
    await ref.update({ state: 'scam', outcome: 'scam', endedAt: Date.now() });
    return { callId, verdict };
  },
);
