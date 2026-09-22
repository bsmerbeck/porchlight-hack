import { useEffect, useRef } from 'react';
import type { CallDoc } from '@porchlight/shared';

/**
 * 06-I: server-side backstop for the verification timeout. The 20s countdown lives only in
 * the /verify phone's browser; if that phone is locked/closed the call would sit on
 * VERIFYING forever. Display surfaces (/stage, /sim) call `expireVerification` once the
 * current call has been verifying past promptedAt + 25s. The server re-validates against
 * its own record (still verifying, unanswered, prompted >= 25s ago), so this is safe to
 * fire from any number of screens.
 */
export const VERIFY_BACKSTOP_MS = 25_000;
const RETRY_MS = 5_000;
const MAX_ATTEMPTS = 4;

type BackstopCall = Pick<CallDoc, 'state' | 'startedAt'> & {
  id: string;
  verification?: Pick<NonNullable<CallDoc['verification']>, 'promptedAt' | 'answer'>;
};

/** When the backstop should fire for this call, or null if it never should. */
export function backstopDueAt(call: BackstopCall | undefined, firstSeenVerifyingAt: number | undefined): number | null {
  if (!call || call.state !== 'verifying' || call.verification?.answer) return null;
  const base = call.verification?.promptedAt ?? firstSeenVerifyingAt;
  return base === undefined ? null : base + VERIFY_BACKSTOP_MS;
}

export function useVerificationBackstop(call: BackstopCall | undefined, now: number): void {
  const firstSeen = useRef(new Map<string, number>());
  const attempts = useRef(new Map<string, { n: number; next: number; done: boolean }>());

  useEffect(() => {
    if (!call || call.state !== 'verifying') return;
    if (!firstSeen.current.has(call.id)) firstSeen.current.set(call.id, now);
    const due = backstopDueAt(call, firstSeen.current.get(call.id));
    if (due === null || now < due) return;
    const a = attempts.current.get(call.id) ?? { n: 0, next: 0, done: false };
    if (a.done || a.n >= MAX_ATTEMPTS || now < a.next) return;
    a.n += 1;
    a.next = now + RETRY_MS;
    attempts.current.set(call.id, a);
    const callId = call.id;
    void (async () => {
      try {
        const [{ fns }, { httpsCallable }] = await Promise.all([import('@/lib/firebase'), import('firebase/functions')]);
        const expire = httpsCallable<{ callId: string }, { expired: boolean; reason?: string }>(fns, 'expireVerification');
        const { data } = await expire({ callId });
        // 'too-early' = client/server clock skew; let the retry timer try again.
        if (data.expired || data.reason !== 'too-early') a.done = true;
      } catch (err) {
        console.error('expireVerification failed', callId, err);
      }
    })();
  }, [call, now]);
}
