import { describe, expect, it } from 'vitest';
import { outcomeBadge } from './outcomeBadge';

describe('outcomeBadge', () => {
  it('maps verified to a success badge', () => {
    expect(outcomeBadge('verified')).toEqual({ label: 'Verified', tone: 'success' });
  });

  it('maps scam to a danger badge', () => {
    expect(outcomeBadge('scam')).toEqual({ label: 'Scam blocked', tone: 'danger' });
  });

  it('maps screened to a neutral badge', () => {
    expect(outcomeBadge('screened')).toEqual({ label: 'Screened', tone: 'neutral' });
  });

  it('maps known (05-ALLOWLIST) to a success badge with distinct language from verified', () => {
    expect(outcomeBadge('known')).toEqual({ label: 'Known caller', tone: 'success' });
  });

  it('maps message (05-ALLOWLIST) to an info badge', () => {
    expect(outcomeBadge('message')).toEqual({ label: 'Message taken', tone: 'info' });
  });

  it('maps an undefined outcome (still in progress) to a neutral badge', () => {
    expect(outcomeBadge(undefined)).toEqual({ label: 'In progress', tone: 'neutral' });
  });
});
