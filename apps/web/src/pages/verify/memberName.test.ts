import { describe, expect, it } from 'vitest';
import { memberDisplayName } from './memberName';

describe('memberDisplayName', () => {
  it('capitalizes a bare member id', () => {
    expect(memberDisplayName('brenden')).toBe('Brenden');
  });
  it('uses the first token of a slug', () => {
    expect(memberDisplayName('mary-ann')).toBe('Mary');
  });
  it('falls back to the raw id when empty', () => {
    expect(memberDisplayName('')).toBe('');
  });
});
