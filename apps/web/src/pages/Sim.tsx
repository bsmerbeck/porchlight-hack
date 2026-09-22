import { useEffect, useRef, useState } from 'react';
import { ATTACK_LINES, JAIL_SCRIPT, type CallDoc, type Tactic } from '@porchlight/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

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

const STATE_BADGE_VARIANT: Record<CallDoc['state'], 'outline' | 'secondary' | 'destructive' | 'default'> = {
  idle: 'outline',
  screening: 'outline',
  verifying: 'secondary',
  verified: 'default',
  scam: 'destructive',
  ended: 'outline',
};

/**
 * DEMO-05 browser call simulator — steps through JAIL_SCRIPT against the exact same
 * runTurn() path a real call uses, with zero telephony. Lazy-loads Firebase (dynamic
 * import, matching the Phase 1 pattern) so this debug page never bloats the landing
 * page's main chunk — this whole page is itself only reached via a lazy route import
 * (see App.tsx), so even these dynamic imports only ever load once the page is visited.
 */
export default function Sim() {
  const [callId, setCallId] = useState<string | null>(null);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [callDoc, setCallDoc] = useState<CallDoc | null>(null);
  const [attackStatus, setAttackStatus] = useState<RunStatus>('idle');
  const [attackError, setAttackError] = useState<string | null>(null);
  const [clipStatus, setClipStatus] = useState<Record<number, ClipStatus>>({});
  const [soundboardError, setSoundboardError] = useState<string | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const clipAudioRef = useRef<Record<number, HTMLAudioElement>>({});

  useEffect(() => {
    if (!callId) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const [{ db }, { doc, onSnapshot }] = await Promise.all([
        import('@/lib/firebase'),
        import('firebase/firestore'),
      ]);
      if (cancelled) return;
      unsubscribe = onSnapshot(doc(db, 'calls', callId), (snap) => {
        setCallDoc((snap.data() as CallDoc | undefined) ?? null);
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [callId]);

  async function handleRun() {
    setStatus('running');
    setError(null);
    setCallDoc(null);
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

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Porchlight call simulator</h1>
        <p className="text-muted-foreground">
          Runs the grandchild-in-jail scam script end-to-end with zero telephony — the same
          runTurn() screening core a real call uses.
        </p>
      </div>

      <Button onClick={() => void handleRun()} disabled={status === 'running'} size="lg" className="w-fit">
        {status === 'running' ? 'Running…' : 'Run scam script'}
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-2 border-t pt-6">
        <p className="text-sm text-muted-foreground">
          ATK-01/ATK-02 — places a real outbound call, in a consented cloned voice, to the
          Porchlight demo number only.
        </p>
        <Button
          onClick={() => void handleLaunchAttack()}
          disabled={attackStatus === 'running'}
          variant="destructive"
          size="lg"
          className="w-fit"
        >
          {attackStatus === 'running' ? 'Calling…' : 'Launch attack call (cloned voice)'}
        </Button>
        {attackStatus === 'done' && (
          <p className="text-sm text-muted-foreground">
            Attack call launched — watch the household feed / lamp for the incoming call.
          </p>
        )}
        {attackError && <p className="text-sm text-destructive">{attackError}</p>}
      </div>

      <div className="flex flex-col gap-2 border-t pt-6">
        <h2 className="font-semibold">Attacker soundboard (cloned voice)</h2>
        <p className="text-sm text-muted-foreground">
          The ElevenLabs conversational "Attacker" agent is blocked by vendor safety
          moderation ("Agent … is unsafe"), so these five lines are pre-generated as plain
          Text-to-Speech clips in the same consented cloned voice and played back here
          instead of a live agent call.
        </p>
        <p className="text-xs text-muted-foreground">Hold the calling phone's mic near the speaker.</p>

        <div className="flex flex-col gap-2">
          {ATTACK_LINES.map((line, i) => (
            <Button
              key={i}
              onClick={() => void handlePlayLine(i)}
              disabled={playingAll || clipStatus[i] === 'loading' || clipStatus[i] === 'playing'}
              variant="outline"
              size="lg"
              className="h-auto w-full justify-start whitespace-normal text-left"
            >
              {i + 1} · {line}
              {clipStatus[i] === 'loading' && ' (loading…)'}
              {clipStatus[i] === 'playing' && ' (playing…)'}
              {clipStatus[i] === 'error' && ' (failed — see console)'}
            </Button>
          ))}
        </div>

        <Button onClick={() => void handlePlayAllClips()} disabled={playingAll} size="lg" className="w-fit">
          {playingAll ? 'Playing all…' : 'Play all (2s gaps)'}
        </Button>

        {soundboardError && <p className="text-sm text-destructive">{soundboardError}</p>}
      </div>

      {callDoc && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Live call</span>
              <Badge variant={STATE_BADGE_VARIANT[callDoc.state]}>{callDoc.state}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Risk score</span>
              <span className="text-xl font-bold">{callDoc.risk.score}</span>
            </div>
            {callDoc.risk.tactics.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {callDoc.risk.tactics.map((tactic: Tactic) => (
                  <Badge key={tactic} variant="outline">
                    {tactic}
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {callDoc.turns.map((turn, i) => (
                <p key={i} className={turn.role === 'caller' ? 'text-left' : 'text-right text-primary'}>
                  <span className="font-medium">{turn.role === 'caller' ? 'Caller: ' : 'Porchlight: '}</span>
                  {turn.text}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
