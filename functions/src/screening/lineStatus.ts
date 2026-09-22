import { onCall } from 'firebase-functions/https';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import twilio from 'twilio';
import { twilioAccountSid, twilioAuthToken } from '../secrets.js';

const REGION = 'us-central1';

// Same hardcoded Porchlight number attackCall.ts dials.
export const PORCHLIGHT_NUMBER = '+14015861988';

// A live doc whose last activity is older than this, while Twilio says the line is free,
// is an orphan (the phone hung up but nothing ended the doc).
export const ORPHAN_STALE_MS = 20_000;

export interface ActiveTwilioCall {
  startTime?: Date | null;
  dateCreated?: Date | null;
}

export type ListActiveCalls = () => Promise<ActiveTwilioCall[]>;

export type LineStatusResult =
  | { busy: true; since?: number; checkedAt: number; healed?: undefined }
  | { busy: false; checkedAt: number; healed: number }
  | { busy: null; error: 'twilio'; checkedAt: number };

let client: ReturnType<typeof twilio> | undefined;
function getTwilioClient(): ReturnType<typeof twilio> {
  if (!client) client = twilio(twilioAccountSid.value(), twilioAuthToken.value());
  return client;
}

const listTwilioActiveCalls: ListActiveCalls = async () => {
  const c = getTwilioClient();
  const [inProgress, ringing] = await Promise.all([
    c.calls.list({ to: PORCHLIGHT_NUMBER, status: 'in-progress', limit: 3 }),
    c.calls.list({ to: PORCHLIGHT_NUMBER, status: 'ringing', limit: 3 }),
  ]);
  return [...inProgress, ...ringing];
};

type LiveDoc = {
  state?: string;
  provider?: string;
  endedAt?: number;
  startedAt?: number;
  outcome?: string;
  turns?: Array<{ at?: number }>;
};

/** Ends orphaned live (screening/verifying) docs. The calls/{id} trigger mirrors feed + lamp. */
export async function healOrphanedCalls(db: Firestore, now: number): Promise<string[]> {
  const snap = await db.collection('calls').orderBy('startedAt', 'desc').limit(5).get();
  const healed: string[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as LiveDoc;
    if (data.provider === 'simulator') continue;
    if (data.endedAt) continue;
    if (data.state !== 'screening' && data.state !== 'verifying') continue;
    const turnAts = (data.turns ?? []).map((t) => t.at).filter((n): n is number => typeof n === 'number');
    const lastActivity = Math.max(typeof data.startedAt === 'number' ? data.startedAt : 0, ...turnAts);
    if (!lastActivity || now - lastActivity < ORPHAN_STALE_MS) continue;
    await doc.ref.update({ state: 'ended', outcome: data.outcome ?? 'screened', endedAt: now });
    healed.push(doc.id);
  }
  return healed;
}

export async function checkLineStatus(
  listActive: ListActiveCalls,
  db: Firestore,
  now: number = Date.now(),
): Promise<LineStatusResult> {
  let active: ActiveTwilioCall[];
  try {
    active = await listActive();
  } catch (err) {
    console.error('lineStatus: Twilio query failed', err);
    return { busy: null, error: 'twilio', checkedAt: now };
  }
  if (active.length > 0) {
    const starts = active
      .map((c) => (c.startTime ?? c.dateCreated)?.getTime())
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    return { busy: true, since: starts.length ? Math.min(...starts) : undefined, checkedAt: now };
  }
  let healed: string[] = [];
  try {
    healed = await healOrphanedCalls(db, now);
    if (healed.length) console.log('lineStatus: ended orphaned live call docs', { healed });
  } catch (err) {
    console.error('lineStatus: self-heal failed', err);
  }
  // Count only -- call ids are capability-ish (forceVerdict takes one), never return them.
  return { busy: false, checkedAt: now, healed: healed.length };
}

/**
 * 06-K: is the Porchlight phone line currently on a call? Non-sensitive status only
 * (no caller number, no SID), so it's not token-gated. Never throws — a Twilio failure
 * returns { busy: null }. When the line is free it also ends orphaned live call docs.
 */
export const lineStatus = onCall(
  { region: REGION, cors: true, maxInstances: 5, secrets: [twilioAccountSid, twilioAuthToken] },
  async () => checkLineStatus(listTwilioActiveCalls, getFirestore()),
);
