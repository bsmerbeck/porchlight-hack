import { useEffect, useState } from 'react';
import { DEMO_HOUSEHOLD_ID } from '@porchlight/shared';
import { Button } from '@/components/ui/button';
import {
  getPairedMemberId,
  recoverPairedMemberIdFromQuery,
  setPairedMemberId,
} from '@/lib/memberSession';
import * as webauthn from '@/lib/webauthn';

// The single demo member this hackathon build ceremony enrolls/verifies — change this to
// pair a different household member's phone. DEMO_HOUSEHOLD_ID is 'demo' (the only
// household seeded in this build); the member id itself must match one of
// households/demo.members[].id (functions/src/screening/runTurn.ts seeds 'brenden').
const DEMO_MEMBER_ID = 'brenden';
void DEMO_HOUSEHOLD_ID; // documents which household this member belongs to; no client read needed

type EnrollStatus = 'idle' | 'enrolling' | 'error';

/**
 * VER-01/02: the family member's phone-side app. Unpaired phones enroll a passkey tied to
 * a household member id (Pitfall 7 — no Firebase Auth, so pairing lives in localStorage);
 * paired phones arm themselves and wait for a full-screen Yes/No prompt (Task 2).
 * React.lazy-loaded from App.tsx, matching Sim.tsx's convention (02-01-SUMMARY).
 */
export default function Verify() {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [status, setStatus] = useState<EnrollStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    recoverPairedMemberIdFromQuery();
    setMemberId(getPairedMemberId());
  }, []);

  async function handleEnroll() {
    setStatus('enrolling');
    setError(null);

    try {
      const [{ fns }, { httpsCallable }] = await Promise.all([
        import('@/lib/firebase'),
        import('firebase/functions'),
      ]);

      const startPasskeyRegistration = httpsCallable<{ memberId: string }, unknown>(
        fns,
        'startPasskeyRegistration',
      );
      const finishPasskeyRegistration = httpsCallable<
        { memberId: string; response: unknown },
        { ok: boolean }
      >(fns, 'finishPasskeyRegistration');

      const { data: optionsJSON } = await startPasskeyRegistration({ memberId: DEMO_MEMBER_ID });
      const response = await webauthn.startRegistration({
        optionsJSON: optionsJSON as Parameters<typeof webauthn.startRegistration>[0]['optionsJSON'],
      });
      await finishPasskeyRegistration({ memberId: DEMO_MEMBER_ID, response });

      setPairedMemberId(DEMO_MEMBER_ID);
      setMemberId(DEMO_MEMBER_ID);
      setStatus('idle');
    } catch (err) {
      console.error('Verify: passkey enrollment failed', err);
      setError('Enrollment failed — check the console and try again.');
      setStatus('error');
    }
  }

  if (!memberId) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold">Porchlight family verify</h1>
          <p className="text-muted-foreground">
            Enroll this phone with a passkey so it can confirm "yes, that's really me" during a
            call.
          </p>
        </div>
        <Button
          onClick={() => void handleEnroll()}
          disabled={status === 'enrolling'}
          size="lg"
          className="w-fit"
        >
          {status === 'enrolling' ? 'Enrolling…' : 'Enroll this phone'}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // Paired — Task 2 extends this branch with the onSnapshot-driven full-screen Yes/No modal.
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">Armed — waiting for a call</h1>
      <p className="text-muted-foreground">This phone is paired and ready to confirm calls.</p>
    </div>
  );
}
