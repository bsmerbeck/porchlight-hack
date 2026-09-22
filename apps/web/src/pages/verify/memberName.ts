/** 'brenden' -> 'Brenden', 'mary-ann' -> 'Mary'; used for the phone's "Signed in as" line. */
export function memberDisplayName(memberId: string): string {
  const first = memberId.trim().split(/[\s_-]+/)[0] ?? '';
  return first ? first[0]!.toUpperCase() + first.slice(1) : memberId;
}
