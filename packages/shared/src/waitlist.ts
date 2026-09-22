import { z } from 'zod';

export const REFS = ['direct', 'li', 'reddit', 'fb', 'friends', 'qr', 'judges'] as const;

export const WaitlistPayload = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  protecting: z.string().trim().max(200).optional(),
  ref: z.string().trim().max(32).default('direct'),
});
export type WaitlistPayload = z.infer<typeof WaitlistPayload>;

export interface WaitlistDoc extends WaitlistPayload {
  createdAt: unknown;
  ua?: string;
}

export interface StatsWaitlistDoc {
  count: number;
}
