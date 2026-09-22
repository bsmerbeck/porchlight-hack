import { useEffect, useRef, useState } from 'react';
import { DEMO_HOUSEHOLD_ID } from '@porchlight/shared';
import {
  getPairedMemberId,
  isPasskeyEnrolled,
  recoverPairedMemberIdFromQuery,
  setPairedMemberId,
  setPasskeyEnrolled,
} from '@/lib/memberSession';
import { computeSecondsLeft, hasExpired } from '@/lib/verifyCountdown';
import * as webauthn from '@/lib/webauthn';
import { ArmedScreen, EnrollScreen, PromptScreen, ResultScreen, memberDisplayName } from './verify/VerifyScreens';

// Default demo member this hackathon build's enroll screen targets when no `?member=` query
// param pre-selects a different one (04-POLISH) — change this to pair a different household
// member's phone by default. DEMO_HOUSEHOLD_ID is 'demo' (the only household seeded in this
// build); the member id itself must match one of households/demo.members[].id
// (functions/src/screening/runTurn.ts seeds 'brenden').
const DEMO_MEMBER_ID = 'brenden';
void DEMO_HOUSEHOLD_ID; // documents which household this member belongs to; no client read needed

type EnrollStatus = 'idle' | 'enrolling' | 'error';

// D-08: how long the post-answer result card holds before returning to armed idle.
const RESULT_CARD_MS = 6000;

// 04-FIX (phone-side guard): a defense-in-depth backstop, independent of the server-side
// verdict-finality fix in runTurn.ts -- once THIS device has answered a given callId
// (yes/no/timeout), never show the full-screen Yes/No modal for that same callId again,
// even if prompts/{memberId} briefly reports state:'verifying' again for it (e.g. a stale
// Firestore snapshot replay, or any future server-side regression of the finality fix).
// Persisted to localStorage (not just React state) so a page reload/re-render doesn't
// forget an already-answered call for as long as this phone stays paired.
const ANSWERED_CALLS_STORAGE_KEY = 'porchlight_answered_calls';
// Caps unbounded localStorage growth across a long demo session -- far more than any
// single household will ever need to remember at once.
const MAX_STORED_ANSWERED_CALL_IDS = 50;

function loadAnsweredCallIds(): Set<string> {
  try {
    const raw = localStorage.getItem(ANSWERED_CALLS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === 'string')) : new Set();
  } catch {
    // Private browsing / corrupted value -- never block the verify flow over this.
    return new Set();
  }
}

function persistAnsweredCallIds(ids: Set<string>): void {
  try {
    localStorage.setItem(ANSWERED_CALLS_STORAGE_KEY, JSON.stringify([...ids].slice(-MAX_STORED_ANSWERED_CALL_IDS)));
  } catch {
    // localStorage can throw (private browsing / quota exceeded) -- the in-memory Set still
    // guards this session even if persistence fails.
  }
}

// Mirrors functions/src/lamp.ts's prompts/{memberId} write shape (04-01) — public-read,
// carries a fresh VER-05 HMAC token whenever a call enters 'verifying'.
interface PromptDoc {
  callId?: string;
  state: 'none' | 'verifying';
  claimedIdentity?: string | null;
  // Not written by lamp.ts today; rendered as CallerCard's "Says: ..." if a future writer adds it.
  claimedText?: string | null;
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
  // 04-POLISH: which member id the Enroll button targets. A `?member=` query param
  // pre-selects this WITHOUT itself pairing/enrolling the phone (see memberSession.ts) —
  // it only changes what "Enroll this phone" enrolls as, defaulting to DEMO_MEMBER_ID.
  const [enrollTargetId, setEnrollTargetId] = useState<string>(DEMO_MEMBER_ID);
  const [passkeyEnrolled, setPasskeyEnrolledState] = useState(false);
  const [enrollStatus, setEnrollStatus] = useState<EnrollStatus>('idle');
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState<PromptDoc | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(20);
  const [answering, setAnswering] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [result, setResult] = useState<'verified' | 'scam' | null>(null);
  const [lastMethod, setLastMethod] = useState<'passkey' | 'link' | null>(null);
  // 06-E: which answer produced the current result card + who was confirmed (for copy).
  const [lastAnswer, setLastAnswer] = useState<'yes' | 'no' | 'timeout' | null>(null);
  const [resultName, setResultName] = useState<string | undefined>(undefined);
  const [answeringChoice, setAnsweringChoice] = useState<'yes' | 'no' | 'timeout' | null>(null);
  // 06-E: true once the first prompts/{memberId} snapshot lands (drives the "Armed" dot).
  const [connected, setConnected] = useState(false);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 04-FIX: callIds this device has already answered -- see loadAnsweredCallIds() above.
  const [answeredCallIds, setAnsweredCallIds] = useState<Set<string>>(() => loadAnsweredCallIds());

  const promptRef = useRef<PromptDoc | null>(null);
  promptRef.current = prompt;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const answeringRef = useRef(false);
  const playedForCallIdRef = useRef<string | null>(null);

  useEffect(() => {
    // 04-POLISH: a bare `?member=X` only pre-selects the enroll target -- it never pairs or
    // enrolls the phone by itself (see memberSession.ts). Only `&paired=1` (the documented
    // link-fallback escape hatch) or a real prior finishPasskeyRegistration bypasses Enroll.
    const queryMemberId = recoverPairedMemberIdFromQuery();
    if (queryMemberId) setEnrollTargetId(queryMemberId);
    setMemberId(getPairedMemberId());
    setPasskeyEnrolledState(isPasskeyEnrolled());
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
        setConnected(true);
        setPrompt((snap.data() as PromptDoc | undefined) ?? null);
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [memberId]);

  // Clear a pending result-card timer on unmount.
  useEffect(() => () => {
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
  }, []);

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
    // 04-FIX: the 20s countdown effect can fire a 'timeout' independently of the modal's
    // render guard above -- belt-and-suspenders against double-answering (which the server
    // would reject as "Already answered" anyway, but there's no reason to even try).
    if (answeredCallIds.has(currentPrompt.callId)) return;

    answeringRef.current = true;
    setAnswering(true);
    setAnsweringChoice(answer);
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

      // 04-FIX (phone-side guard): mark this callId answered on THIS device only once the
      // server has actually recorded the verdict -- never on a thrown/failed attempt, so a
      // genuinely failed answer can still be retried.
      setAnsweredCallIds((prev) => {
        const next = new Set(prev);
        next.add(currentPrompt.callId!);
        persistAnsweredCallIds(next);
        return next;
      });

      // D-08: result card for 6s, then back to armed idle.
      setLastAnswer(answer);
      setResultName(currentPrompt.claimedIdentity ?? undefined);
      setResult(verified ? 'verified' : 'scam');
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
      resultTimerRef.current = setTimeout(() => setResult(null), RESULT_CARD_MS);
    } catch (err) {
      console.error('Verify: answerVerification failed', err);
      setAnswerError('Something went wrong confirming — try again.');
    } finally {
      answeringRef.current = false;
      setAnswering(false);
      setAnsweringChoice(null);
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

      const { data: optionsJSON } = await startPasskeyRegistration({ memberId: enrollTargetId });
      const response = await webauthn.startRegistration({
        optionsJSON: optionsJSON as Parameters<typeof webauthn.startRegistration>[0]['optionsJSON'],
      });
      await finishPasskeyRegistration({ memberId: enrollTargetId, response });

      setPairedMemberId(enrollTargetId);
      setPasskeyEnrolled();
      setMemberId(enrollTargetId);
      setPasskeyEnrolledState(true);
      setEnrollStatus('idle');
    } catch (err) {
      console.error('Verify: passkey enrollment failed', err);
      setEnrollError('Enrollment failed — check the console and try again.');
      setEnrollStatus('error');
    }
  }

  if (!memberId) {
    return (
      <EnrollScreen
        targetName={memberDisplayName(enrollTargetId)}
        enrolling={enrollStatus === 'enrolling'}
        error={enrollError}
        onEnroll={() => void handleEnroll()}
      />
    );
  }

  if (result) {
    return (
      <ResultScreen verified={result === 'verified'} answer={lastAnswer} method={lastMethod} name={resultName} />
    );
  }

  // 04-FIX: never re-show the modal for a callId this device already answered, even if the
  // prompt doc briefly reports state:'verifying' again for it.
  if (prompt?.state === 'verifying' && prompt.callId && !answeredCallIds.has(prompt.callId)) {
    return (
      <PromptScreen
        key={prompt.callId}
        name={prompt.claimedIdentity ?? undefined}
        claimedText={prompt.claimedText ?? undefined}
        secondsLeft={secondsLeft}
        answering={answering}
        answeringChoice={answeringChoice}
        error={answerError}
        hasFallbackToken={!!prompt.token}
        // Called directly from the click handler so WebAuthn keeps its user-gesture context.
        onYes={() => void handleAnswer('yes')}
        onNo={() => void handleAnswer('no')}
      />
    );
  }

  return (
    <ArmedScreen
      memberName={memberDisplayName(memberId)}
      passkeyEnrolled={passkeyEnrolled}
      alertsEnabled={alertsEnabled}
      connected={connected}
      onEnableAlerts={handleEnableAlerts}
    />
  );
}
