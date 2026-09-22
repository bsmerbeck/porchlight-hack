import { useEffect, useRef, useState } from 'react';
import type { CallDoc, CallState } from '@porchlight/shared';

/**
 * DASH-03 projector stage view — `/stage`, already wired into App.tsx. Reads ONLY the
 * public `households/demo/feed/{callId}` mirror (04-01) via a single onSnapshot(list);
 * never `calls/{id}` directly (D-10 closed-rules design). Firebase is dynamically
 * imported inside useEffect (matching Sim.tsx's convention) so this eagerly-imported
 * page (App.tsx renders it without lazy()) never bloats the landing page's main chunk.
 *
 * Projector sizing: body copy >=28px, the state banner >=72px, readable from the back
 * of a room (ROADMAP Phase 4 success criterion 5).
 */

type FeedCall = CallDoc & { id: string };

const STATE_LABEL: Record<CallState, string> = {
  idle: 'SCREENING',
  screening: 'SCREENING',
  verifying: 'VERIFYING…',
  verified: 'VERIFIED ✓',
  scam: 'SCAM BLOCKED',
  ended: 'CALL ENDED',
};

// 05-ALLOWLIST: 'known' and 'message' are outcomes, not CallStates -- a known-caller call
// stays state:'verified' (keeping that banner green, per the phase spec) and a
// message-taking call ends up state:'ended' just like any other finished call. Without
// this override both would show a generic label ("VERIFIED ✓" / "CALL ENDED") instead of
// naming what actually happened.
const OUTCOME_STATE_LABEL: Partial<Record<string, string>> = {
  known: 'KNOWN CALLER',
  message: 'MESSAGE TAKEN',
};

function stateLabel(call: FeedCall): string {
  return (call.outcome && OUTCOME_STATE_LABEL[call.outcome]) || STATE_LABEL[call.state];
}

// Full-bleed takeover only fires for these two terminal verdict states, and only holds
// for a few seconds before the normal live panel (still showing the same state label)
// returns -- per the plan's "returning to the live/history view" requirement.
const TAKEOVER_BANNER: Partial<Record<CallState, { text: string; bg: string }>> = {
  verified: { text: 'VERIFIED ✓', bg: 'oklch(0.75 0.19 145)' }, // green — Lamp.tsx GLOW_COLOR.green
  scam: { text: 'SCAM BLOCKED', bg: 'oklch(0.65 0.22 25)' }, // red — Lamp.tsx GLOW_COLOR.red
};

const TAKEOVER_DURATION_MS = 5000;

// Amber — the Porchlight brand color (matches --primary / Lamp.tsx GLOW_COLOR.amber).
const AMBER_BG = 'oklch(0.85 0.17 75)';
const AMBER_FG = 'oklch(0.2 0.03 60)';

function riskColor(score: number): string {
  if (score >= 70) return 'oklch(0.65 0.22 25)'; // red
  if (score >= 40) return AMBER_BG; // amber
  return 'oklch(0.75 0.19 145)'; // green
}

// 04-POLISH: the persistent state banner used to render in a fixed amber regardless of
// state, contradicting the "known-caller call stays state:'verified' (keeping that banner
// green, per the phase spec)" comment above -- it now actually tracks the call's verdict:
// green for verified/known, red for scam, blue for a taken message, and a pulsing amber
// while actively verifying. Idle/screening/ended fall back to the neutral amber brand color.
const BANNER_PALETTE = {
  amber: { bg: AMBER_BG, fg: AMBER_FG },
  green: { bg: 'oklch(0.75 0.19 145)', fg: AMBER_FG }, // Lamp.tsx GLOW_COLOR.green
  red: { bg: 'oklch(0.65 0.22 25)', fg: 'oklch(0.98 0 0)' }, // Lamp.tsx GLOW_COLOR.red
  blue: { bg: 'oklch(0.7 0.15 250)', fg: 'oklch(0.98 0 0)' },
} as const;

function bannerStyle(call: FeedCall): { bg: string; fg: string; pulse: boolean } {
  if (call.outcome === 'known') return { ...BANNER_PALETTE.green, pulse: false };
  if (call.outcome === 'message') return { ...BANNER_PALETTE.blue, pulse: false };

  switch (call.state) {
    case 'verified':
      return { ...BANNER_PALETTE.green, pulse: false };
    case 'scam':
      return { ...BANNER_PALETTE.red, pulse: false };
    case 'verifying':
      return { ...BANNER_PALETTE.amber, pulse: true };
    default:
      return { ...BANNER_PALETTE.amber, pulse: false };
  }
}

/** Short WebAudio beep, gated behind a user click (autoplay policies) -- optional cue. */
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

export default function Stage() {
  const [calls, setCalls] = useState<FeedCall[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [takeoverState, setTakeoverState] = useState<CallState | null>(null);
  const [soundArmed, setSoundArmed] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevStateRef = useRef<CallState | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const [{ db }, { collection, query, orderBy, onSnapshot }] = await Promise.all([
        import('@/lib/firebase'),
        import('firebase/firestore'),
      ]);
      if (cancelled) return;

      const feedQuery = query(collection(db, 'households/demo/feed'), orderBy('startedAt', 'desc'));
      unsubscribe = onSnapshot(
        feedQuery,
        (snap) => {
          setCalls(snap.docs.map((d) => ({ id: d.id, ...(d.data() as CallDoc) })));
        },
        (err) => {
          console.error('Stage: feed onSnapshot failed', err);
          setError('Could not load the call feed — check the console.');
        },
      );
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Single most-recent non-ended call; falls back to the newest overall once every call
  // has ended, so the stage still shows the last thing that happened.
  const call = calls?.find((c) => c.state !== 'ended') ?? calls?.[0] ?? null;

  // Fire the full-bleed takeover banner + audio cue exactly once per transition into a
  // terminal verdict state (not on every re-render / snapshot re-fire of the same state).
  useEffect(() => {
    if (!call) return;
    const prev = prevStateRef.current;
    prevStateRef.current = call.state;
    if (prev === call.state) return;

    if (TAKEOVER_BANNER[call.state]) {
      setTakeoverState(call.state);
      const timer = setTimeout(() => setTakeoverState(null), TAKEOVER_DURATION_MS);
      audioCtxRef.current &&
        beep(audioCtxRef.current, call.state === 'verified' ? 880 : 220, call.state === 'verified' ? 'sine' : 'sawtooth');
      return () => clearTimeout(timer);
    }
    if (call.state === 'verifying' && audioCtxRef.current) {
      beep(audioCtxRef.current, 550, 'triangle');
    }
  }, [call?.state, call]);

  // Auto-scroll the transcript to the latest turn as new turns stream in.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [call?.turns.length]);

  function armSound() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    setSoundArmed(true);
  }

  const takeover = takeoverState ? TAKEOVER_BANNER[takeoverState] : null;

  return (
    <div className="flex min-h-screen flex-col bg-[oklch(0.2_0.03_60)] text-white">
      {!soundArmed && (
        <button
          type="button"
          onClick={armSound}
          className="absolute top-4 right-4 z-10 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80"
        >
          Enable sound cue
        </button>
      )}

      {takeover ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
          style={{ backgroundColor: takeover.bg }}
        >
          <p className="text-7xl font-black text-black md:text-9xl">{takeover.text}</p>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
          <h1 className="text-center text-2xl font-bold opacity-70">Porchlight — stage view</h1>

          {error && <p className="text-2xl text-red-400">{error}</p>}
          {calls === null && !error && <p className="text-3xl opacity-70">Waiting for a call…</p>}
          {calls !== null && calls.length === 0 && (
            <p className="text-3xl opacity-70">No calls yet — Porchlight is watching.</p>
          )}

          {call && (
            <>
              {/* State banner: >=72px, colored per bannerStyle (green/red/blue/pulsing amber) */}
              {(() => {
                const { bg, fg, pulse } = bannerStyle(call);
                return (
                  <div
                    className={`rounded-2xl px-6 py-6 text-center text-[72px] leading-none font-black md:text-[96px]${pulse ? ' animate-pulse' : ''}`}
                    style={{ backgroundColor: bg, color: fg }}
                  >
                    {stateLabel(call)}
                  </div>
                );
              })()}

              {call.outcome === 'known' && call.verification?.name ? (
                <p className="text-center text-3xl">
                  Known caller: <span className="font-bold">{call.verification.name}</span>
                </p>
              ) : (
                call.risk.claimedIdentity && (
                  <p className="text-center text-3xl">
                    Claims to be: <span className="font-bold">{call.risk.claimedIdentity}</span>
                  </p>
                )
              )}

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-3xl">
                  <span className="opacity-70">Risk</span>
                  <span className="font-black">{call.risk.score}</span>
                </div>
                <div className="h-8 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${call.risk.score}%`, backgroundColor: riskColor(call.risk.score) }}
                  />
                </div>
              </div>

              {call.risk.tactics.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2">
                  {call.risk.tactics.map((tactic) => (
                    <span key={tactic} className="rounded-full border border-white/30 px-4 py-1 text-xl">
                      {tactic}
                    </span>
                  ))}
                </div>
              )}

              <div ref={transcriptRef} className="flex max-h-[40vh] flex-col gap-3 overflow-y-auto">
                {call.turns.map((turn, i) => (
                  <p
                    key={i}
                    className={
                      turn.role === 'caller'
                        ? 'text-left text-3xl'
                        : 'text-right text-3xl text-[oklch(0.85_0.17_75)]'
                    }
                  >
                    <span className="font-bold">{turn.role === 'caller' ? 'Caller: ' : 'Porchlight: '}</span>
                    {turn.text}
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
