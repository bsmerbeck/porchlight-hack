import { getFirestore } from 'firebase-admin/firestore';

// RISK-03: case-insensitive match of a caller's claimed name against the seeded
// household's members (by name or alias). Plain string match, not an LLM judgment call.
export async function matchIdentity(householdId: string, claimedName: string): Promise<string | undefined> {
  const snap = await getFirestore().doc(`households/${householdId}`).get();
  const members = snap.data()?.members as Array<{ id: string; name: string; aliases: string[] }> | undefined;
  const needle = claimedName.trim().toLowerCase();
  return members?.find(
    (m) => m.name.toLowerCase() === needle || m.aliases.some((a) => a.toLowerCase() === needle),
  )?.id;
}
