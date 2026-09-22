import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type Uint8Array_,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

// Pitfall 3 (04-RESEARCH.md): rpID/origin must be hard-coded, NEVER derived from
// req.headers.origin (attacker-controlled input) and never a localhost fallback in the
// deployed path -- WebAuthn ceremonies must run against the real deployed Hosting domain.
export const rpID = 'porchlight-hack.web.app';
export const origin = `https://${rpID}`;

export { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse };

// Confirmed via node_modules/@simplewebauthn/server/esm/helpers/iso/isoBase64URL.d.ts
// (Open Question 1, 04-RESEARCH.md): `toBuffer` is the exact reverse of `fromBuffer`.
// A stored passkey's publicKey is always base64url text (never a raw Uint8Array --
// round-tripping through an onCall's JSON payload mangles typed arrays into
// {0: n, 1: n, ...} objects); decode it back to bytes only at verification time.
export function decodePublicKey(base64: string): Uint8Array_ {
  return isoBase64URL.toBuffer(base64);
}

export function encodePublicKey(bytes: Uint8Array_): string {
  return isoBase64URL.fromBuffer(bytes);
}
