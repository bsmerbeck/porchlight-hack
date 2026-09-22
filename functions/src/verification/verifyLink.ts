import { createHmac, timingSafeEqual } from 'crypto';
import { verifyLinkSecret } from '../secrets.js';

// VER-05 fallback: a single-purpose, single-use HMAC token tied to one callId+memberId
// pair, minted into every `verifying`-state prompts/{memberId} doc (functions/src/lamp.ts)
// so a family member can answer via a plain signed link if the WebAuthn ceremony blows the
// timebox -- no JWT/claims machinery needed for a token this narrow (04-RESEARCH.md's
// Don't-Hand-Roll table). ASVS V6: constant-time comparison via timingSafeEqual, never `===`.
export function mintVerifyToken(callId: string, memberId: string): string {
  return createHmac('sha256', verifyLinkSecret.value()).update(`${callId}:${memberId}`).digest('base64url');
}

export function checkVerifyToken(callId: string, memberId: string, token: string): boolean {
  const expected = Buffer.from(mintVerifyToken(callId, memberId));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
