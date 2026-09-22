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

export interface HouseholdDoc {
  name: string;
  seniorName: string;
  members: HouseholdMember[];
}

// The single demo household used tonight; no real senior data per CLAUDE.md.
export const DEMO_HOUSEHOLD_ID = 'demo';
