import { z } from 'zod';
import { TACTICS } from '@porchlight/shared';

// RISK-01: structured per-turn output from claude-haiku-4-5. Field names here are
// Claude-facing only — the mapping into the locked Firestore camelCase schema
// (claimedIdentity/recommendedAction) happens in runTurn.ts (Pitfall 8, 02-RESEARCH.md).
export const RiskTurn = z.object({
  reply: z.string().max(400),
  risk: z.number().int().min(0).max(100),
  tactics: z.array(z.enum(TACTICS)),
  claimedIdentity: z.string().nullable(),
  recommendedAction: z.enum(['continue', 'verify', 'end']),
});

export type RiskTurn = z.infer<typeof RiskTurn>;
