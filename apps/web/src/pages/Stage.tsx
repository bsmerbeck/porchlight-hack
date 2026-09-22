import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { CallDoc } from '@porchlight/shared';
import {
  CallerCard,
  LampGlow,
  LAMP_TEST_EVENT,
  OperatorBar,
  OutcomeBadge,
  ReadyState,
  RiskMeter,
  StateBanner,
  StatusDot,
  Transcript,
  deriveFreshStageState,
  stateKey,
  terminalAt,
  RESULT_HOLD_MS,
  type StateKey,
} from '@/components/porch';
import { useVerificationBackstop } from '@/lib/useVerificationBackstop';

/**
 * DASH-03 / 06-D projector stage view (`/stage`). Reads ONLY the public
 * `households/demo/feed/{callId}` mirror via one onSnapshot(list) and derives what's on
 * screen with deriveStageState(feed, now) (D-06) -- so a browser refresh mid-call rebuilds
 * exactly the same view. Firebase is dynamically imported so this eagerly-imported page
 * never bloats the landing chunk. Designed for a 1920x1080 projector, dark theme (D-01),
 * stage type scale (D-03).
 */

type FeedCall = CallDoc & { id: string };

const HOUSEHOLD_NAME = 'Margaret';
/** A "live" doc with no activity for this long is a stale leftover, not a real call. */
const LAMP_TEST_SEQUENCE: StateKey[] = ['screening', 'verifying', 'verified', 'scam', 'message', 'known', 'idle'];
const LAMP_TEST_STEP_MS = 1400;

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Short WebAudio cue; the AudioContext is armed by the first click/keypress (autoplay). */
function beep(ctx: AudioContext, frequency: number, type: OscillatorType) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.4);
}

const CUES: Partial<Record<StateKey, [number, OscillatorType]>> = {
  verifying: [550, 'triangle'],
  verified: [880, 'sine'],
  known: [880, 'sine'],
  scam: [220, 'sawtooth'],
};

function liveSub(key: StateKey, call: FeedCall): string {
  const who = call.verification?.name ?? call.risk?.claimedIdentity;
  if (key === 'verifying') return who ? `Asking ${who} to confirm it's really them…` : "Asking Margaret's family to confirm…";
  return `AI assistant is screening an unknown caller for ${HOUSEHOLD_NAME}`;
}

function resultSub(key: StateKey, call: FeedCall): string {
  const who = call.verification?.name ?? call.risk?.claimedIdentity;
  switch (key) {
    case 'scam':
      return call.verification?.answer === 'no' && who
        ? `${who} confirmed it wasn't them. The lamp turned red.`
        : 'Scam script detected. The lamp turned red.';
    case 'verified':
      return who ? `${who} confirmed with their passkey. Safe to talk.` : 'Family confirmed. Safe to talk.';
    case 'known':
      return who ? `${who} is on ${HOUSEHOLD_NAME}'s trusted list. Call put through.` : 'Trusted caller. Call put through.';
    case 'message':
      return call.message?.text ? `"${call.message.text}"` : 'Porchlight took a message for the family.';
    default:
      return 'Call ended. Nothing needed from Margaret.';
  }
}

export default function Stage() {
  const reduce = useReducedMotion();
  const [calls, setCalls] = useState<FeedCall[] | null>(null);
  const [feedError, setFeedError] = useState(false);
  const [lampTest, setLampTest] = useState<StateKey | null>(null);
  const now = useNow();
  const audioRef = useRef<AudioContext | null>(null);
  const cueRef = useRef<string | null>(null);

  // Feed subscription (the only source of truth).
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const [{ db }, { collection, query, orderBy, limit, onSnapshot }] = await Promise.all([
        import('@/lib/firebase'),
        import('firebase/firestore'),
      ]);
      if (cancelled) return;
      unsubscribe = onSnapshot(
        query(collection(db, 'households/demo/feed'), orderBy('startedAt', 'desc'), limit(25)),
        (snap) => {
          setFeedError(false);
          setCalls(snap.docs.map((d) => ({ id: d.id, ...(d.data() as CallDoc) })));
        },
        (err) => {
          console.error('Stage: feed onSnapshot failed', err);
          setFeedError(true);
        },
      );
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Arm audio on the first interaction (browser autoplay policy).
  useEffect(() => {
    const arm = () => {
      if (!audioRef.current) {
        try {
          audioRef.current = new AudioContext();
        } catch {
          /* no audio */
        }
      }
    };
    window.addEventListener('pointerdown', arm);
    window.addEventListener('keydown', arm);
    return () => {
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
    };
  }, []);

  // Lamp test (OperatorBar): cycle the on-screen lamp through every D-02 state.
  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      timers.forEach(clearTimeout);
      timers = LAMP_TEST_SEQUENCE.map((s, i) =>
        setTimeout(() => setLampTest(i === LAMP_TEST_SEQUENCE.length - 1 ? null : s), i * LAMP_TEST_STEP_MS),
      );
    };
    window.addEventListener(LAMP_TEST_EVENT, run);
    return () => {
      window.removeEventListener(LAMP_TEST_EVENT, run);
      timers.forEach(clearTimeout);
    };
  }, []);

  const view = useMemo(() => {
    return deriveFreshStageState(calls ?? [], now);
  }, [calls, now]);

  const call = view.call;
  // 06-I: server-side verification-timeout backstop (phone may be locked/closed).
  useVerificationBackstop(view.mode === 'live' ? call : undefined, now);
  const key: StateKey = view.mode === 'ready' ? 'idle' : stateKey(call);

  // Audio cue once per (call, state) transition -- never on the first snapshot after a refresh.
  useEffect(() => {
    if (calls === null) return;
    const sig = call ? `${call.id}:${key}` : 'ready';
    const prev = cueRef.current;
    cueRef.current = sig;
    if (prev === null || prev === sig) return;
    const cue = CUES[key];
    if (cue && audioRef.current) beep(audioRef.current, cue[0], cue[1]);
  }, [calls, call, key]);

  const fade = {
    initial: reduce ? false : { opacity: 0, scale: 0.985 },
    animate: { opacity: 1, scale: 1 },
    exit: reduce ? undefined : { opacity: 0, scale: 0.985 },
    transition: { duration: 0.35, ease: 'easeOut' as const },
  };

  const holdLeft = call && view.mode === 'result' ? Math.max(0, RESULT_HOLD_MS - (now - terminalAt(call))) : 0;
  const headerKey: StateKey = lampTest ?? key;

  return (
    <div className="dark flex h-screen min-h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Header strip */}
      <header className="flex h-20 shrink-0 items-center justify-between px-12">
        <div className="flex items-center gap-4">
          <LampGlow state={headerKey} size={40} className="text-foreground" />
          <span className="text-[28px] font-bold tracking-tight">Porchlight</span>
          <span className="label-caps text-muted-foreground">{HOUSEHOLD_NAME}&apos;s line</span>
        </div>
        <div className="flex items-center gap-6">
          {view.mode === 'live' && <StatusDot state={key} pulse label={<span className="label-caps">Live call</span>} />}
          {feedError ? (
            <StatusDot tone="bad" label={<span className="label-caps">Feed offline</span>} />
          ) : calls === null ? (
            <StatusDot tone="warn" pulse label={<span className="label-caps">Connecting</span>} />
          ) : (
            <StatusDot tone="ok" label={<span className="label-caps text-muted-foreground">Watching</span>} />
          )}
        </div>
      </header>

      <main className="relative min-h-0 flex-1 px-12 pb-12">
        {/* 06-I: popLayout (not "wait") so the body swaps on the SAME render as the header's
            "Live call" dot -- both read one deriveStageState result; the outgoing screen fades
            out absolutely-positioned underneath instead of delaying the incoming one. */}
        <AnimatePresence mode="popLayout" initial={false}>
          {view.mode === 'ready' || !call ? (
            <motion.div key="ready" {...fade} className="flex h-full items-center justify-center">
              <ReadyState
                state={lampTest ?? 'idle'}
                lampSize="xl"
                title={
                  lampTest ? (
                    <span className="label-caps text-[40px]!">Lamp test: {lampTest}</span>
                  ) : (
                    <>Porchlight is watching {HOUSEHOLD_NAME}&apos;s line</>
                  )
                }
                subtitle={
                  lampTest
                    ? 'Cycling every lamp state.'
                    : 'Unknown callers talk to Porchlight first. Family confirms with one tap. The lamp tells her the answer.'
                }
              />
            </motion.div>
          ) : view.mode === 'live' ? (
            <motion.div key={`live:${call.id}`} {...fade} className="flex h-full min-h-0 flex-col gap-8">
              <StateBanner state={key} sub={liveSub(key, call)} />
              <div className="grid min-h-0 flex-1 grid-cols-12 gap-8">
                <section className="col-span-5 flex min-h-0 flex-col gap-8">
                  <CallerCard
                    name={call.verification?.name ?? call.risk?.claimedIdentity}
                    claimedText={call.verification?.claimedText}
                    from={call.from}
                    known={call.outcome === 'known'}
                    className="p-8"
                  />
                  <div className="rounded-3xl border bg-card p-8 shadow-soft">
                    <RiskMeter score={call.risk?.score ?? 0} tactics={call.risk?.tactics ?? []} />
                  </div>
                </section>
                <section className="col-span-7 flex min-h-0 flex-col rounded-3xl border bg-card p-8 shadow-soft">
                  <div className="label-caps mb-4 shrink-0 text-muted-foreground">Live transcript</div>
                  <Transcript
                    turns={call.turns ?? []}
                    pending={call.turns?.length ? (call.turns[call.turns.length - 1].role === 'caller' ? 'assistant' : false) : 'caller'}
                    className="min-h-0 flex-1 overflow-y-auto"
                  />
                </section>
              </div>
            </motion.div>
          ) : (
            <motion.div key={`result:${call.id}`} {...fade} className="flex h-full min-h-0 flex-col gap-8">
              <StateBanner state={key} sub={resultSub(key, call)} />
              <div className="grid min-h-0 flex-1 grid-cols-12 gap-8">
                <section className="col-span-5 flex min-h-0 flex-col items-center justify-center gap-6 rounded-3xl border bg-card p-8 shadow-soft">
                  <LampGlow state={key} size="lg" className="text-foreground" />
                  <OutcomeBadge visual={key} size="lg" />
                </section>
                <section className="col-span-7 flex min-h-0 flex-col gap-8">
                  <CallerCard
                    name={call.verification?.name ?? call.risk?.claimedIdentity}
                    claimedText={call.verification?.claimedText}
                    from={call.from}
                    known={key === 'known'}
                    className="p-8"
                  />
                  <div className="rounded-3xl border bg-card p-8 shadow-soft">
                    <RiskMeter score={call.risk?.score ?? 0} tactics={call.risk?.tactics ?? []} label="Final scam risk" />
                  </div>
                </section>
              </div>
              <div className="flex shrink-0 items-center gap-6">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                    style={{ width: `${(holdLeft / RESULT_HOLD_MS) * 100}%`, backgroundColor: 'var(--amber)' }}
                  />
                </div>
                <span className="label-caps tabular text-muted-foreground">
                  Back to watching in {Math.ceil(holdLeft / 1000)}s
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <OperatorBar />
    </div>
  );
}
