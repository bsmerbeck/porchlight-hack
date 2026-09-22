// D-06 locked shape: a real, verifiable WebAuthn credential -- publicKey is stored
// base64url-encoded (never a raw Uint8Array; JSON round-tripping through an onCall
// payload mangles typed arrays into {0: n, 1: n, ...} objects, per 04-RESEARCH.md's
// Anti-Patterns). counter is the signature counter verifyAuthenticationResponse needs
// to detect a cloned authenticator (T-04-04).
export interface PasskeyCredential {
  id: string;
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
}

export interface HouseholdMember {
  id: string;
  name: string;
  relation: string;
  aliases: string[];
  // Legacy field -- kept in place, unused, per 04-01-PLAN.md Task 1. Superseded by
  // `passkeys` below, which carries the full credential a real verification needs.
  passkeyCredentialIds: string[];
  passkeys?: PasskeyCredential[];
}

// 05-ALLOWLIST D-05 extension: a caller_id (E.164) known ahead of time to belong to
// someone in the family's life -- distinct from `members[]` (who can carry a family
// verification passkey). An allowlist match short-circuits the whole screening flow
// (elevenlabsPersonalization.ts) with no risk scoring or family-verify hold at all.
export interface AllowlistEntry {
  number: string;
  name: string;
  relation: string;
}

export interface HouseholdDoc {
  name: string;
  seniorName: string;
  members: HouseholdMember[];
  allowlist?: AllowlistEntry[];
}

// The single demo household used tonight; no real senior data per CLAUDE.md.
export const DEMO_HOUSEHOLD_ID = 'demo';

// Shared by elevenlabsPersonalization.ts (deriving verification.memberId for an
// allowlist match) and lamp.ts (resolving that same memberId back to a display name) --
// one slug function so both sides of the round-trip agree. Deliberately distinct from a
// real household member's `id` (e.g. 'brenden') so an allowlist entry can never collide
// with -- and accidentally clear or overwrite -- a real member's prompts/{memberId} doc.
export function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
