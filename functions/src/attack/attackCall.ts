import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { onCall, HttpsError } from 'firebase-functions/https';
import { demoToken, elevenLabsKey, elevenLabsAttackerAgentId, elevenLabsAttackerPhoneId } from '../secrets.js';

const REGION = 'us-central1';

// ATK-01/T-05-06: the only destination this Function will ever dial. A literal
// module-level constant, never derived from req.data or any other caller-controlled
// input -- there is no field in AttackCallInput shaped like a phone number at all, so
// there is no code path that could ever accept a caller-supplied destination.
const PORCHLIGHT_NUMBER = '+14015861988';

const ELEVENLABS_OUTBOUND_CALL_URL = 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call';

// `token` is optional here (not `z.string()`) so a missing/malformed payload fails the
// SAME permission-denied gate as a wrong token -- mirrors resetDemo.ts's ResetDemoInput.
// Deliberately has no `to_number`/`toNumber`/`number` field: the input schema itself is
// part of the T-05-06 mitigation, not just the handler body.
const AttackCallInput = z.object({
  token: z.string().optional(),
});

// T-05-05: identical DEMO_TOKEN timingSafeEqual gate as resetDemo.ts's checkDemoToken --
// same secret, same comparison shape, checked before any outbound network call.
function checkDemoToken(token: string | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(demoToken.value());
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * ATK-01/ATK-02: one callable that places a real outbound call, in the consented
 * cloned-voice "Attacker" agent, that can only ever dial PORCHLIGHT_NUMBER. Gated by the
 * same DEMO_TOKEN as resetDemo (T-05-05), checked FIRST -- a wrong/missing token must
 * never reach the ElevenLabs fetch. The destination is a hardcoded literal (T-05-06),
 * never read from req.data.
 */
export const attackCall = onCall(
  {
    region: REGION,
    cors: true,
    maxInstances: 5,
    secrets: [demoToken, elevenLabsKey, elevenLabsAttackerAgentId, elevenLabsAttackerPhoneId],
  },
  async (req) => {
    const { token } = AttackCallInput.parse(req.data);

    if (!checkDemoToken(token)) {
      throw new HttpsError('permission-denied', 'Invalid demo token');
    }

    // [best-effort -- confirm on first live call; if ElevenLabs returns 401, check
    // response headers/body for the expected auth scheme and adjust] -- see
    // 02-RESEARCH.md Pitfall 5 for this project's established pattern of not blocking on
    // under-documented vendor auth. `xi-api-key` is ElevenLabs' documented header name
    // for this endpoint as of this writing.
    const res = await fetch(ELEVENLABS_OUTBOUND_CALL_URL, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsKey.value(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: elevenLabsAttackerAgentId.value(),
        agent_phone_number_id: elevenLabsAttackerPhoneId.value(),
        to_number: PORCHLIGHT_NUMBER,
      }),
    });

    const bodyText = await res.text();

    if (!res.ok) {
      // Logged raw so the human checkpoint (Task 2/3) can debug it without redeploying
      // blind -- never falls back to accepting an alternate destination.
      console.error('attackCall: ElevenLabs outbound-call failed', res.status, bodyText);
      throw new HttpsError('internal', `ElevenLabs outbound-call failed (${res.status}): ${bodyText}`);
    }

    try {
      return JSON.parse(bodyText);
    } catch {
      return { raw: bodyText };
    }
  },
);
