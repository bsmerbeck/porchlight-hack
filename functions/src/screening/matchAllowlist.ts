import { getFirestore } from 'firebase-admin/firestore';
import { slugifyName, type AllowlistEntry } from '@porchlight/shared';

export interface AllowlistMatch {
  memberId: string;
  name: string;
  relation: string;
}

/**
 * 05-ALLOWLIST Task 2: allowlist pass-through. Case-sensitive E.164 match of the
 * incoming caller_id against the household's known-caller list -- plain string
 * match, not an LLM judgment call, mirroring matchIdentity.ts's own pattern.
 */
export async function matchAllowlist(householdId: string, callerId: string | undefined): Promise<AllowlistMatch | undefined> {
  if (!callerId) return undefined;
  const snap = await getFirestore().doc(`households/${householdId}`).get();
  const allowlist = snap.data()?.allowlist as AllowlistEntry[] | undefined;
  const entry = allowlist?.find((a) => a.number === callerId);
  if (!entry) return undefined;
  return { memberId: slugifyName(entry.name), name: entry.name, relation: entry.relation };
}
