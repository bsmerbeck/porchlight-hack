import { useMemo, useRef, useState } from 'react';
import {
  Check,
  FlaskConical,
  Loader2,
  PhoneIncoming,
  PhoneOutgoing,
  Play,
  RotateCcw,
  ShieldCheck,
  Volume2,
} from 'lucide-react';
import { ATTACK_LINES, JAIL_SCRIPT } from '@porchlight/shared';
import { Button } from '@/components/ui/button';
import {
  CallerCard,
  OperatorBar,
  OutcomeBadge,
  RiskMeter,
  StateBanner,
  StatusDot,
  Transcript,
  deriveStageState,
  formatPhone,
  stateKey,
  type OperatorAction,
} from '@/components/porch';
import { useBridgeStatus, useDemoFeed, useNow } from '@/lib/useDemoFeed';
import { cn } from '@/lib/utils';

type RunStatus = 'idle' | 'running' | 'done' | 'error';
type ClipStatus = 'idle' | 'loading' | 'playing' | 'ready' | 'error';

const DEMO_TOKEN_STORAGE_KEY = 'porchlight_demo_token';

function getDemoToken(): string | null {
  const stored = window.localStorage.getItem(DEMO_TOKEN_STORAGE_KEY);
  if (stored) return stored;
  const entered = window.prompt('Enter the DEMO_TOKEN to launch a real attack call:');
  if (!entered) return null;
  window.localStorage.setItem(DEMO_TOKEN_STORAGE_KEY, entered);
  return entered;
}

// Cheat sheet for the operator (06-CONTEXT W1-W7). The allowlisted number is the one
// resetDemo seeds into households/demo.allowlist (functions/src/demo/resetDemo.ts).
const WORKFLOWS: Array<{ id: string; text: string }> = [
  { id: 'W1', text: 'Simulated scam: "Run scam script" (no phone needed).' },
  { id: 'W2', text: 'Live call claiming to be Brenden, family taps "No" on /verify: SCAM BLOCKED.' },
  { id: 'W3', text: 'Live call, family taps "Yes" + passkey on /verify: VERIFIED.' },
  { id: 'W4', text: `Call from the allowlisted ${formatPhone('+14014979735')}: KNOWN CALLER.` },
  { id: 'W5', text: 'Benign caller (dentist, delivery): MESSAGE TAKEN.' },
  { id: 'W6', text: 'Attack call button or pnpm demo:attack; soundboard is the fallback.' },
  { id: 'W7', text: 'Joystick press on the lamp: "call my family" alert on /app.' },
];

function Panel({
  title,
  icon,
  children,
  className,
  aside,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  aside?: React.ReactNode;
}) {
  return (
    <section className={cn('flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-foreground/10', className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function RunNote({ status, done, error }: { status: RunStatus; done: string; error: string | null }) {
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (status === 'done')
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-state-verified">
        <Check size={14} aria-hidden /> {done}
      </p>
    );
  return null;
}

/**
 * /sim operator console (06-F, dark). DEMO-05 browser call simulator steps JAIL_SCRIPT
 * through the exact same runTurn() path a real call uses, with zero telephony; plus the
 * ATK-02 attack-call launcher, ATK-01 soundboard fallback, DEMO-01 reset and a live preview
 * of what /stage shows (deriveStageState over the public households/demo/feed mirror; the
 * old calls/{id} listener was denied by the closed rules). Firebase is lazy-imported
 * (Phase 1 pattern); this page is itself a lazy route.
 */
export default function Sim() {
  const [callId, setCallId] = useState<string | null>(null);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [attackStatus, setAttackStatus] = useState<RunStatus>('idle');
  const [attackError, setAttackError] = useState<string | null>(null);
  const [clipStatus, setClipStatus] = useState<Record<number, ClipStatus>>({});
  const [soundboardError, setSoundboardError] = useState<string | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const [resetStatus, setResetStatus] = useState<RunStatus>('idle');
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [showSoundboard, setShowSoundboard] = useState(true);
  const clipAudioRef = useRef<Record<number, HTMLAudioElement>>({});
  const soundboardRef = useRef<HTMLDivElement>(null);

  const { calls, error: feedError } = useDemoFeed();
  const bridge = useBridgeStatus();
  const now = useNow();
  const stage = useMemo(() => deriveStageState(calls ?? [], now), [calls, now]);
  // Preview: what /stage shows right now; otherwise the call this console just started;
  // otherwise the most recent call (dimmed as "last call").
  const simCall = callId ? calls?.find((c) => c.id === callId) : undefined;
  const previewCall = stage.call ?? simCall ?? calls?.[0];
  const previewIsCurrent = Boolean(stage.call) || (simCall !== undefined && status === 'running');
  const previewKey = stage.mode === 'ready' ? 'idle' : stateKey(stage.call);

  async function handleRun() {
    setStatus('running');
    setError(null);
    setCallId(null);

    try {
      const [{ fns }, { httpsCallable }] = await Promise.all([
        import('@/lib/firebase'),
        import('firebase/functions'),
      ]);

      const startSimulatedCall = httpsCallable<Record<string, never>, { callId: string }>(
        fns,
        'startSimulatedCall',
      );
      const simulateTurn = httpsCallable<
        { callId: string; callerText: string },
        { reply: string; endCall: boolean }
      >(fns, 'simulateTurn');

      const { data: started } = await startSimulatedCall({});
      setCallId(started.callId);

      for (const callerText of JAIL_SCRIPT) {
        const { data: turnResult } = await simulateTurn({ callId: started.callId, callerText });
        if (turnResult.endCall) break;
      }

      setStatus('done');
    } catch (err) {
      console.error('Sim: failed to run scam script', err);
      setError('Something went wrong running the scam script — check the console.');
      setStatus('error');
    }
  }

  /**
   * ATK-02: launches the real cloned-voice attacker call by invoking `attackCall`
   * directly (same DEMO_TOKEN-gated callable `pnpm demo:attack` posts to), so the button
   * and the CLI script exercise the exact same server-side code path. The token is read
   * from localStorage, prompting once if absent -- never hardcoded in this file.
   */
  async function handleLaunchAttack() {
    const token = getDemoToken();
    if (!token) return;

    setAttackStatus('running');
    setAttackError(null);

    try {
      const [{ fns }, { httpsCallable }] = await Promise.all([
        import('@/lib/firebase'),
        import('firebase/functions'),
      ]);

      const attackCall = httpsCallable<{ token: string }, unknown>(fns, 'attackCall');
      await attackCall({ token });

      setAttackStatus('done');
    } catch (err) {
      console.error('Sim: failed to launch attack call', err);
      setAttackError('Something went wrong launching the attack call — check the console.');
      setAttackStatus('error');
    }
  }

  /**
   * ATK-01 fallback: the ElevenLabs conversational "Attacker" agent is blocked by vendor
   * moderation, so this fetches (once, then caches per index in clipAudioRef) a single
   * line's pre-generated cloned-voice clip from `attackClips` and plays it through the
   * laptop speaker. Reuses the same DEMO_TOKEN localStorage prompt as the attack button.
   */
  async function getOrFetchClipAudio(index: number): Promise<HTMLAudioElement> {
    const cached = clipAudioRef.current[index];
    if (cached) return cached;

    const token = getDemoToken();
    if (!token) throw new Error('DEMO_TOKEN required to fetch attack clips');

    const [{ fns }, { httpsCallable }] = await Promise.all([
      import('@/lib/firebase'),
      import('firebase/functions'),
    ]);

    const attackClips = httpsCallable<
      { token: string; index: number },
      { clips: Array<{ index: number; text: string; audioBase64: string }> }
    >(fns, 'attackClips');
    const { data } = await attackClips({ token, index });
    const clip = data.clips[0];

    const audio = new Audio(`data:audio/mpeg;base64,${clip.audioBase64}`);
    clipAudioRef.current[index] = audio;
    return audio;
  }

  function playAudioElement(audio: HTMLAudioElement): Promise<void> {
    return new Promise((resolve, reject) => {
      audio.currentTime = 0;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('Audio playback failed'));
      void audio.play().catch(reject);
    });
  }

  async function handlePlayLine(index: number) {
    setSoundboardError(null);
    setClipStatus((s) => ({ ...s, [index]: 'loading' }));

    try {
      const audio = await getOrFetchClipAudio(index);
      setClipStatus((s) => ({ ...s, [index]: 'playing' }));
      await playAudioElement(audio);
      setClipStatus((s) => ({ ...s, [index]: 'ready' }));
    } catch (err) {
      console.error('Sim: failed to play attack clip', index, err);
      setSoundboardError('Something went wrong playing that line — check the console.');
      setClipStatus((s) => ({ ...s, [index]: 'error' }));
    }
  }

  async function handlePlayAllClips() {
    setSoundboardError(null);
    setPlayingAll(true);

    try {
      for (let i = 0; i < ATTACK_LINES.length; i++) {
        setClipStatus((s) => ({ ...s, [i]: 'loading' }));
        const audio = await getOrFetchClipAudio(i);
        setClipStatus((s) => ({ ...s, [i]: 'playing' }));
        await playAudioElement(audio);
        setClipStatus((s) => ({ ...s, [i]: 'ready' }));

        if (i < ATTACK_LINES.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    } catch (err) {
      console.error('Sim: failed to play attack soundboard', err);
      setSoundboardError('Something went wrong playing the soundboard — check the console.');
    } finally {
      setPlayingAll(false);
    }
  }

  /** DEMO-01 / D-10: same DEMO_TOKEN-gated callable as `pnpm demo:reset`. */
  async function handleReset() {
    const token = getDemoToken();
    if (!token) return;
    setResetStatus('running');
    setResetMessage(null);
    try {
      const [{ fns }, { httpsCallable }] = await Promise.all([
        import('@/lib/firebase'),
        import('firebase/functions'),
      ]);
      const resetDemo = httpsCallable<
        { token: string },
        { callsDeleted: number; promptsCleared: number; alertsCleared: number }
      >(fns, 'resetDemo');
      const { data } = await resetDemo({ token });
      setCallId(null);
      setStatus('idle');
      setAttackStatus('idle');
      setResetMessage(
        `Reset ✓ (${data.callsDeleted} calls, ${data.promptsCleared} prompts, ${data.alertsCleared} alerts cleared)`,
      );
      setResetStatus('done');
    } catch (err) {
      console.error('Sim: resetDemo failed', err);
      setResetMessage('Reset failed — check the console (wrong DEMO_TOKEN? clear localStorage porchlight_demo_token).');
      setResetStatus('error');
    }
  }

  function toggleSoundboard() {
    setShowSoundboard((v) => {
      const next = !v;
      if (next) setTimeout(() => soundboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      return next;
    });
  }

  const busy: OperatorAction | null =
    resetStatus === 'running'
      ? 'reset'
      : status === 'running'
        ? 'sim'
        : attackStatus === 'running'
          ? 'attack'
          : playingAll
            ? 'soundboard'
            : null;

  return (
    <div className="dark min-h-screen bg-background pb-40 text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="size-2.5 rounded-full bg-amber shadow-glow" aria-hidden />
            <div>
              <h1 className="text-base font-semibold leading-tight">Porchlight operator console</h1>
              <p className="text-xs text-muted-foreground">Drives the same pipeline as a real call</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs">
              <StatusDot state={previewKey} pulse={stage.mode === 'live'} />
              <span className="font-medium uppercase tracking-wide">
                {stage.mode === 'ready' ? 'Ready' : stage.mode === 'live' ? 'Live' : 'Result (20s hold)'}
              </span>
            </span>
            <nav className="hidden gap-3 text-xs text-muted-foreground sm:flex">
              <a className="hover:text-foreground" href="/stage" target="_blank" rel="noreferrer">
                /stage
              </a>
              <a className="hover:text-foreground" href="/verify" target="_blank" rel="noreferrer">
                /verify
              </a>
              <a className="hover:text-foreground" href="/app" target="_blank" rel="noreferrer">
                /app
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-6">
        {/* ---- Controls column ---- */}
        <div className="flex flex-col gap-4">
          <Panel title="Simulated scam (W1)" icon={<FlaskConical size={14} aria-hidden />}>
            <p className="text-sm text-muted-foreground">
              Runs the {JAIL_SCRIPT.length}-line grandchild-in-jail script through the real runTurn() screening core,
              with no phone call involved.
            </p>
            <Button
              onClick={() => void handleRun()}
              disabled={status === 'running'}
              size="lg"
              className="h-12 w-full text-base sm:w-fit"
            >
              {status === 'running' ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
              {status === 'running' ? 'Running…' : 'Run scam script'}
            </Button>
            <RunNote status={status} done="Script finished. The verdict is on /stage." error={error} />
          </Panel>

          <Panel title="Attack call (W6)" icon={<PhoneOutgoing size={14} aria-hidden />}>
            <p className="text-sm text-muted-foreground">
              Places a real outbound call in a consented cloned voice, to the Porchlight demo number only.
            </p>
            <Button
              onClick={() => void handleLaunchAttack()}
              disabled={attackStatus === 'running'}
              variant="destructive"
              size="lg"
              className="h-12 w-full text-base sm:w-fit"
            >
              {attackStatus === 'running' ? <Loader2 className="animate-spin" aria-hidden /> : <PhoneIncoming aria-hidden />}
              {attackStatus === 'running' ? 'Calling…' : 'Launch attack call (cloned voice)'}
            </Button>
            <RunNote
              status={attackStatus}
              done="Attack call launched. Watch /stage and the lamp for the incoming call."
              error={attackError}
            />
          </Panel>

          <div ref={soundboardRef} className="scroll-mt-20">
            <Panel
              title="Attacker soundboard (fallback)"
              icon={<Volume2 size={14} aria-hidden />}
              aside={
                <button
                  type="button"
                  onClick={toggleSoundboard}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {showSoundboard ? 'Hide' : 'Show'}
                </button>
              }
            >
              {showSoundboard && (
                <>
                  <p className="text-sm text-muted-foreground">
                    The ElevenLabs conversational "Attacker" agent is blocked by vendor safety moderation ("Agent … is
                    unsafe"), so these lines are pre-generated Text-to-Speech clips in the same consented cloned voice.
                    Hold the calling phone's mic near the speaker.
                  </p>
                  <ol className="flex flex-col gap-2">
                    {ATTACK_LINES.map((line, i) => {
                      const cs = clipStatus[i];
                      return (
                        <li key={i}>
                          <button
                            type="button"
                            onClick={() => void handlePlayLine(i)}
                            disabled={playingAll || cs === 'loading' || cs === 'playing'}
                            className={cn(
                              'flex w-full items-start gap-3 rounded-xl bg-surface px-3 py-2.5 text-left text-sm ring-1 ring-foreground/5 transition-colors hover:bg-surface-2 disabled:opacity-70',
                              cs === 'playing' && 'ring-amber/60',
                              cs === 'error' && 'ring-destructive/60',
                            )}
                          >
                            <span className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold">
                              {cs === 'loading' || cs === 'playing' ? (
                                <Loader2 size={12} className="animate-spin" aria-hidden />
                              ) : (
                                i + 1
                              )}
                            </span>
                            <span className="flex-1">
                              {line}
                              {cs === 'loading' && <span className="text-muted-foreground"> (loading…)</span>}
                              {cs === 'playing' && <span className="text-amber"> (playing…)</span>}
                              {cs === 'error' && <span className="text-destructive"> (failed — see console)</span>}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  <Button
                    onClick={() => void handlePlayAllClips()}
                    disabled={playingAll}
                    variant="secondary"
                    size="lg"
                    className="w-full sm:w-fit"
                  >
                    {playingAll ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
                    {playingAll ? 'Playing all…' : 'Play all (2s gaps)'}
                  </Button>
                  {soundboardError && <p className="text-sm text-destructive">{soundboardError}</p>}
                </>
              )}
            </Panel>
          </div>

          <Panel title="Between runs" icon={<RotateCcw size={14} aria-hidden />}>
            <p className="text-sm text-muted-foreground">
              Clears calls, prompts and alerts, restores the household + allowlist, and sets the lamp to idle. Same
              as <code className="rounded bg-surface px-1">pnpm demo:reset</code>.
            </p>
            <Button
              onClick={() => void handleReset()}
              disabled={resetStatus === 'running'}
              variant="outline"
              size="lg"
              className="w-full sm:w-fit"
            >
              {resetStatus === 'running' ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
              {resetStatus === 'running' ? 'Resetting…' : 'Reset everything'}
            </Button>
            {resetMessage && (
              <p className={cn('text-sm', resetStatus === 'error' ? 'text-destructive' : 'text-state-verified')}>
                {resetMessage}
              </p>
            )}
          </Panel>

          <Panel title="Workflow cheat sheet" icon={<ShieldCheck size={14} aria-hidden />}>
            <ul className="flex flex-col gap-1.5 text-sm">
              {WORKFLOWS.map((w) => (
                <li key={w.id} className="flex gap-2">
                  <span className="tabular w-7 shrink-0 font-semibold text-amber">{w.id}</span>
                  <span className="text-muted-foreground">{w.text}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* ---- Live preview column ---- */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <Panel
            title={stage.mode === 'ready' && previewCall ? 'Last call' : 'Live preview'}
            aside={
              previewCall ? <OutcomeBadge outcome={previewCall.outcome} state={previewCall.state} size="sm" /> : undefined
            }
          >
            <StateBanner
              state={previewKey}
              size="compact"
              sub={stage.mode === 'ready' ? 'What /stage shows now' : undefined}
            />
            {feedError && <p className="text-sm text-destructive">{feedError}</p>}
            {previewCall ? (
              <div className={cn('flex flex-col gap-4', !previewIsCurrent && 'opacity-70')}>
                <CallerCard
                  size="compact"
                  name={previewCall.verification?.name ?? previewCall.risk.claimedIdentity}
                  claimedText={previewCall.verification?.claimedText}
                  from={previewCall.from}
                  known={previewCall.outcome === 'known'}
                />
                <RiskMeter score={previewCall.risk.score} tactics={previewCall.risk.tactics} size="compact" />
                <Transcript
                  turns={previewCall.turns}
                  size="compact"
                  pending={stage.mode === 'live'}
                  className="max-h-[22rem] rounded-xl bg-surface p-3"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {calls === null ? 'Connecting to the feed…' : 'No calls yet. Run the scam script or place a call.'}
              </p>
            )}
          </Panel>

          {calls && calls.length > 1 && (
            <Panel title={`Feed (${calls.length})`}>
              <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto text-sm">
                {calls.slice(0, 12).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface">
                    <span className="min-w-0 flex-1 truncate">
                      {c.verification?.name ?? c.risk.claimedIdentity ?? formatPhone(c.from)}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {new Date(c.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        {c.provider === 'simulator' && ' · sim'}
                      </span>
                    </span>
                    <span className="tabular text-xs text-muted-foreground">{c.risk.score}</span>
                    <OutcomeBadge outcome={c.outcome} state={c.state} size="sm" />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </main>

      {/* D-09: always visible on the operator console (this page IS the operator surface). */}
      <OperatorBar
        onReset={() => void handleReset()}
        onSim={() => void handleRun()}
        onAttack={() => void handleLaunchAttack()}
        onSoundboard={toggleSoundboard}
        soundboardOn={showSoundboard}
        busy={busy}
        defaultCollapsed
        status={{
          piOk: bridge?.piOk,
          hueReachable: bridge?.hueReachable,
          lastBeat: bridge?.lastBeat,
          message:
            resetMessage ?? (stage.mode === 'ready' ? 'Ready' : stage.mode === 'live' ? 'Call live' : 'Result showing'),
        }}
      />
    </div>
  );
}
