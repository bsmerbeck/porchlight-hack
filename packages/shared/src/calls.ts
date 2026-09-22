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

export const RECOMMENDED_ACTIONS = ['continue', 'verify', 'end'] as const;
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
    recommendedAction: 'continue' | 'verify' | 'end';
    updatedAt: number;
  };
  verification?: {
    memberId: string;
    promptedAt: number;
    answeredAt?: number;
    answer?: 'yes' | 'no' | 'timeout';
    method?: 'passkey' | 'link';
  };
  outcome?: 'verified' | 'scam' | 'screened';
  report?: string;
}
