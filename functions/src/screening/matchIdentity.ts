import { getFirestore } from 'firebase-admin/firestore';

// 04-FIX: returns the matched member's real household name alongside its id, not just the
// id -- callers need this to display the correctly-spelled real name (e.g. "Brenden")
// instead of echoing back whatever ASR-transcribed spelling the caller's claim came in as
// (e.g. "Brendan"), which is exactly the alias this match resolved against.
export interface IdentityMatch {
  memberId: string;
  name: string;
}

// RISK-03: case-insensitive match of a caller's claimed name against the seeded
// household's members (by name or alias). Plain string match, not an LLM judgment call.
export async function matchIdentity(householdId: string, claimedName: string): Promise<IdentityMatch | undefined> {
  const snap = await getFirestore().doc(`households/${householdId}`).get();
  const members = snap.data()?.members as Array<{ id: string; name: string; aliases: string[] }> | undefined;
  const needle = claimedName.trim().toLowerCase();
  const match = members?.find(
    (m) => m.name.toLowerCase() === needle || m.aliases.some((a) => a.toLowerCase() === needle),
  );
  return match ? { memberId: match.id, name: match.name } : undefined;
}
