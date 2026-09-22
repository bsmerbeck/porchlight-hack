import { describe, expect, it } from 'vitest';
import { computeSecondsLeft, hasExpired } from './verifyCountdown';

describe('computeSecondsLeft', () => {
  it('returns 45 at now===promptedAt', () => {
    expect(computeSecondsLeft(1000, 1000)).toBe(45);
  });

  it('returns 0 at now===promptedAt+45000', () => {
    expect(computeSecondsLeft(1000, 1000 + 45_000)).toBe(0);
  });

  it('clamps non-negative when now is well past promptedAt+45000', () => {
    expect(computeSecondsLeft(1000, 1000 + 45_000)).toBe(0);
  });

  it('returns a value between 0 and 45 partway through the window', () => {
    const result = computeSecondsLeft(1000, 1000 + 5_000);
    expect(result).toBe(40);
  });
});

describe('hasExpired', () => {
  it('returns true at secondsLeft === 0', () => {
    expect(hasExpired(0)).toBe(true);
  });

  it('returns true when secondsLeft is negative', () => {
    expect(hasExpired(-1)).toBe(true);
  });

  it('returns false when secondsLeft > 0', () => {
    expect(hasExpired(1)).toBe(false);
    expect(hasExpired(20)).toBe(false);
  });
});
