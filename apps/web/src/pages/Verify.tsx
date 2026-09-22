import { useEffect, useRef, useState } from 'react';
import { DEMO_HOUSEHOLD_ID } from '@porchlight/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getPairedMemberId,
  recoverPairedMemberIdFromQuery,
  setPairedMemberId,
} from '@/lib/memberSession';
import { computeSecondsLeft, hasExpired } from '@/lib/verifyCountdown';
import * as webauthn from '@/lib/webauthn';

// The single demo member this hackathon build ceremony enrolls/verifies — change this to
// pair a different household member's phone. DEMO_HOUSEHOLD_ID is 'demo' (the only
// household seeded in this build); the member id itself must match one of
// households/demo.members[].id (functions/src/screening/runTurn.ts seeds 'brenden').
const DEMO_MEMBER_ID = 'brenden';
void DEMO_HOUSEHOLD_ID; // documents which household this member belongs to; no client read needed

type EnrollStatus = 'idle' | 'enrolling' | 'error';

// Mirrors functions/src/lamp.ts's prompts/{memberId} write shape (04-01) — public-read,
// carries a fresh VER-05 HMAC token whenever a call enters 'verifying'.
interface PromptDoc {
  callId?: string;
  state: 'none' | 'verifying';
  claimedIdentity?: string | null;
  promptedAt?: number;
  token?: string;
}

/**
 * Pitfall 5 (04-RESEARCH.md): unlock future Audio/AudioContext playback from inside a real
 * user-gesture click handler — playing a near-silent buffer immediately satisfies both
 * Chrome's and Safari's autoplay-gesture requirement so the later alert tone (fired from an
 * onSnapshot callback, which has no gesture in its call stack) is allowed to play.
 */
function unlockAudio(): AudioContext | null {
  try {
    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    const ctx = new AudioContextCtor();
    void ctx.resume().catch(() => {
      // Never block on resume failing — the visual modal is the channel that never fails.
    });
    const silentBuffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = silentBuffer;
    source.connect(ctx.destination);
    source.start(0);
    return ctx;
  } catch {
    return null;
  }
}

/** Short attention-getting beep — wrapped so a failure here never blocks the Yes/No modal. */
function playAlertTone(ctx: AudioContext | null): void {
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.5);
  } catch {
    // Audio is an enhancement layer, never the primary channel (Pitfall 4/5).
  }
}

/** Pitfall 4: navigator.vibrate is unreliable on iOS Safari — feature-detected, never thrown. */
function tryVibrate(): void {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate([300, 100, 300, 100, 300]);
    } catch {
      // A no-op on iOS Safari is expected, not a bug.
    }
  }
}

/**
 * VER-01/02/03/04: the family member's phone-side app. Unpaired phones enroll a passkey tied
 * to a household member id (Pitfall 7 — no Firebase Auth, so pairing lives in localStorage);
 * paired phones arm themselves, subscribe to prompts/{memberId}, and show a full-screen
 * Yes/No prompt the instant a call enters 'verifying'. React.lazy-loaded from App.tsx,
 * matching Sim.tsx's convention (02-01-SUMMARY).
 */
export default function Verify() {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [enrollStatus, setEnrollStatus] = useState<EnrollStatus>('idle');
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState<PromptDoc | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(20);
  const [answering, setAnswering] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [result, setResult] = useState<'verified' | 'scam' | null>(null);
  const [lastMethod, setLastMethod] = useState<'passkey' | 'link' | null>(null);

  const promptRef = useRef<PromptDoc | null>(null);
  promptRef.current = prompt;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const answeringRef = useRef(false);
  const playedForCallIdRef = useRef<string | null>(null);

  useEffect(() => {
    recoverPairedMemberIdFromQuery();
    setMemberId(getPairedMemberId());
  }, []);

  // VER-02: subscribe to this member's realtime prompt doc once paired.
  useEffect(() => {
    if (!memberId) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const [{ db }, { doc, onSnapshot }] = await Promise.all([
        import('@/lib/firebase'),
        import('firebase/firestore'),
      ]);
      if (cancelled) return;
      unsubscribe = onSnapshot(doc(db, 'prompts', memberId), (snap) => {
        setPrompt((snap.data() as PromptDoc | undefined) ?? null);
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [memberId]);

  // 20s visible countdown, driven by the pure verifyCountdown helpers.
  useEffect(() => {
    if (!prompt || prompt.state !== 'verifying' || typeof prompt.promptedAt !== 'number') {
      setSecondsLeft(20);
      return;
    }

    setAnswerError(null);
    const promptedAt = prompt.promptedAt;

    const tick = () => {
      const left = computeSecondsLeft(promptedAt, Date.now());
      setSecondsLeft(left);
      if (hasExpired(left)) {
        void handleAnswer('timeout');
      }
    };

    tick();
    const intervalId = setInterval(tick, 250);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleAnswer reads promptRef.current
  }, [prompt?.callId, prompt?.state, prompt?.promptedAt]);

  // Alert the moment a NEW verifying prompt arrives (not on every re-render of the same one).
  useEffect(() => {
    if (prompt?.state === 'verifying' && prompt.callId && playedForCallIdRef.current !== prompt.callId) {
      playedForCallIdRef.current = prompt.callId;
      playAlertTone(audioCtxRef.current);
      tryVibrate();
    }
  }, [prompt?.state, prompt?.callId]);

  function handleEnableAlerts() {
    audioCtxRef.current = unlockAudio();
    setAlertsEnabled(true);
  }

  async function handleAnswer(answer: 'yes' | 'no' | 'timeout') {
    if (answeringRef.current) return;
    const currentPrompt = promptRef.current;
    if (!currentPrompt?.callId || !memberId) return;

    answeringRef.current = true;
    setAnswering(true);
    setAnswerError(null);

    try {
      const [{ fns }, { httpsCallable }] = await Promise.all([
        import('@/lib/firebase'),
        import('firebase/functions'),
      ]);
      const answerVerification = httpsCallable<Record<string, unknown>, { verified: boolean }>(
        fns,
        'answerVerification',
      );

      let verified: boolean;

      if (answer === 'yes') {
        // Always attempt the real passkey ceremony first — never a bare answer:'yes'.
        let response: unknown | undefined;
        try {
          const available = await webauthn.platformAuthenticatorIsAvailable();
          if (available) {
            const startPasskeyAuthentication = httpsCallable<{ memberId: string }, unknown>(
              fns,
              'startPasskeyAuthentication',
            );
            const { data: optionsJSON } = await startPasskeyAuthentication({ memberId });
            response = await webauthn.startAuthentication({
              optionsJSON: optionsJSON as Parameters<typeof webauthn.startAuthentication>[0]['optionsJSON'],
            });
          }
        } catch (ceremonyErr) {
          console.warn('Verify: passkey ceremony failed, checking link-token fallback', ceremonyErr);
        }

        if (response) {
          const { data } = await answerVerification({
            callId: currentPrompt.callId,
            memberId,
            answer: 'yes',
            response,
          });
          verified = data.verified;
          setLastMethod('passkey');
        } else if (currentPrompt.token) {
          // VER-05 fallback — platform authenticator unavailable or the ceremony threw.
          const { data } = await answerVerification({
            callId: currentPrompt.callId,
            memberId,
            answer: 'yes',
            token: currentPrompt.token,
          });
          verified = data.verified;
          setLastMethod('link');
        } else {
          throw new Error('No passkey available and no fallback link token present');
        }
      } else {
        // No / timeout: never touches WebAuthn.
        const { data } = await answerVerification({ callId: currentPrompt.callId, memberId, answer });
        verified = data.verified;
      }

      setResult(verified ? 'verified' : 'scam');
      setTimeout(() => setResult(null), 5000);
    } catch (err) {
      console.error('Verify: answerVerification failed', err);
      setAnswerError('Something went wrong confirming — try again.');
    } finally {
      answeringRef.current = false;
      setAnswering(false);
    }
  }

  async function handleEnroll() {
    setEnrollStatus('enrolling');
    setEnrollError(null);

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
      setEnrollStatus('idle');
    } catch (err) {
      console.error('Verify: passkey enrollment failed', err);
      setEnrollError('Enrollment failed — check the console and try again.');
      setEnrollStatus('error');
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
          disabled={enrollStatus === 'enrolling'}
          size="lg"
          className="w-fit"
        >
          {enrollStatus === 'enrolling' ? 'Enrolling…' : 'Enroll this phone'}
        </Button>
        {enrollError && <p className="text-sm text-destructive">{enrollError}</p>}
      </div>
    );
  }

  if (result) {
    const isVerified = result === 'verified';
    return (
      <div
        className={cn(
          'fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-6 text-center text-white',
          isVerified ? 'bg-green-700' : 'bg-red-700',
        )}
      >
        <p className="text-4xl font-bold">{isVerified ? 'VERIFIED ✓' : 'SCAM BLOCKED'}</p>
        {lastMethod === 'link' && (
          <p className="text-xs opacity-70">Confirmed via secure link (passkey unavailable)</p>
        )}
      </div>
    );
  }

  if (prompt?.state === 'verifying' && prompt.callId) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/95 p-6 text-center text-white">
        <p className="text-2xl">Is {prompt.claimedIdentity ?? 'someone'} calling Grandma right now?</p>
        <p className="text-6xl font-bold tabular-nums">{secondsLeft}s</p>
        {answerError && <p className="text-sm text-red-400">{answerError}</p>}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => void handleAnswer('yes')}
            disabled={answering}
            className="rounded-lg bg-green-600 px-10 py-6 text-2xl font-semibold disabled:opacity-50"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => void handleAnswer('no')}
            disabled={answering}
            className="rounded-lg bg-red-600 px-10 py-6 text-2xl font-semibold disabled:opacity-50"
          >
            No
          </button>
        </div>
        {prompt.token && <p className="text-xs opacity-50">Falls back to a secure link if Face ID/Touch ID isn't available</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">Armed — waiting for a call</h1>
      <p className="text-muted-foreground">This phone is paired and ready to confirm calls.</p>
      {!alertsEnabled ? (
        <Button onClick={handleEnableAlerts} size="lg" variant="outline">
          Enable alerts
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Alerts enabled ✓</p>
      )}
    </div>
  );
}
