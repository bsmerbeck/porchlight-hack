export const CALL_STATES = ['idle', 'screening', 'verifying', 'verified', 'scam', 'ended'] as const;
export type CallState = (typeof CALL_STATES)[number];

// D-05 / FND-03 state machine: idle → screening → verifying → verified | scam → ended
export const CALL_TRANSITIONS: Record<CallState, readonly CallState[]> = {
  idle: ['screening'],
  screening: ['verifying', 'scam', 'ended'],
  verifying: ['verified', 'scam', 'ended'],
  verified: ['ended'],
  scam: ['ended'],
  ended: [],
};

export const TACTICS = ['urgency', 'secrecy', 'payment_method', 'authority_bail', 'impersonation'] as const;
export type Tactic = (typeof TACTICS)[number];

// 'message' (05-ALLOWLIST): a benign, unknown caller with no family-member claim and a
// legitimate low-risk reason to call -- the screener takes a message instead of holding
// for family verification or ending as a scam.
export const RECOMMENDED_ACTIONS = ['continue', 'verify', 'end', 'message'] as const;
export const PROVIDERS = ['elevenlabs', 'simulator'] as const;

export interface CallTurn {
  role: 'caller' | 'assistant';
  text: string;
  at: number;
}

export interface CallDoc {
  householdId: string;
  state: CallState;
  from: string;
  startedAt: number;
  endedAt?: number;
  provider: 'elevenlabs' | 'simulator';
  providerCallId?: string;
  turns: CallTurn[];
  risk: {
    score: number;
    tactics: Tactic[];
    claimedIdentity?: string;
    recommendedAction: 'continue' | 'verify' | 'end' | 'message';
    updatedAt: number;
  };
  verification?: {
    memberId: string;
    // Optional (not set by the allowlist pass-through path, which has no real
    // "prompted, waiting for a tap" moment -- it resolves synchronously at ring time).
    promptedAt?: number;
    answeredAt?: number;
    answer?: 'yes' | 'no' | 'timeout';
    method?: 'passkey' | 'link' | 'allowlist';
    // Display name for an 'allowlist' match -- lets the dashboard/lamp show a friendly
    // name without a second households/{id} read on the client.
    name?: string;
  };
  outcome?: 'verified' | 'scam' | 'screened' | 'known' | 'message';
  // Set once a 'message' outcome is finalized (05-ALLOWLIST Task 3).
  message?: { text: string; callback?: string };
  report?: string;
}
