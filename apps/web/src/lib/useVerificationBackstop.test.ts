import { describe, expect, it } from 'vitest';
import { VERIFY_BACKSTOP_MS, backstopDueAt } from './useVerificationBackstop';

describe('backstopDueAt (06-I)', () => {
  const base = { id: 'c', startedAt: 1000 };
  it('due at promptedAt + 25s for an unanswered verifying call', () => {
    expect(backstopDueAt({ ...base, state: 'verifying', verification: { promptedAt: 5000 } }, 9000)).toBe(
      5000 + VERIFY_BACKSTOP_MS,
    );
  });
  it('falls back to first-seen time when the feed doc lacks promptedAt', () => {
    expect(backstopDueAt({ ...base, state: 'verifying' }, 9000)).toBe(9000 + VERIFY_BACKSTOP_MS);
  });
  it('never for answered, non-verifying or missing calls', () => {
    expect(backstopDueAt({ ...base, state: 'verifying', verification: { promptedAt: 5000, answer: 'no' } }, 1)).toBeNull();
    expect(backstopDueAt({ ...base, state: 'screening' }, 1)).toBeNull();
    expect(backstopDueAt(undefined, 1)).toBeNull();
  });
});
