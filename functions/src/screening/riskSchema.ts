import { z } from 'zod';
import { TACTICS } from '@porchlight/shared';

// 05-ALLOWLIST Task 3: the confirmed "take a message" content -- only populated once
// Claude has BOTH gathered the message content and read it back to the caller for
// confirmation on this turn (see prompt.ts). `callback` is nullable, not optional --
// matches claimedIdentity's own null-not-missing convention so structured output never
// has to reason about an absent key.
export const RiskMessage = z.object({
  text: z.string().min(1).max(300),
  callback: z.string().nullable(),
});

export type RiskMessage = z.infer<typeof RiskMessage>;

// RISK-01: structured per-turn output from claude-haiku-4-5. Field names here are
// Claude-facing only — the mapping into the locked Firestore camelCase schema
// (claimedIdentity/recommendedAction) happens in runTurn.ts (Pitfall 8, 02-RESEARCH.md).
export const RiskTurn = z.object({
  reply: z.string().max(400),
  risk: z.number().int().min(0).max(100),
  tactics: z.array(z.enum(TACTICS)),
  claimedIdentity: z.string().nullable(),
  // 'message' (05-ALLOWLIST Task 3): a benign, unknown caller with no family-member claim
  // and a legitimate low-risk reason to call -- take a message instead of holding for
  // verification or ending as a scam.
  recommendedAction: z.enum(['continue', 'verify', 'end', 'message']),
  message: RiskMessage.nullable(),
});

export type RiskTurn = z.infer<typeof RiskTurn>;
