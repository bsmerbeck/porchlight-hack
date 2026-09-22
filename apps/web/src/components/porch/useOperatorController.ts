import { useCallback, useEffect, useRef, useState } from 'react';
import { ATTACK_LINES, JAIL_SCRIPT } from '@porchlight/shared';
import type { OperatorAction, OperatorStatus } from './OperatorBar';

/**
 * D-09 live operator wiring, shared by /stage and /sim (via OperatorBar's default
 * handlers). Every backend call goes through the same DEMO_TOKEN-gated callables the CLI
 * scripts use; Firebase is dynamically imported so eagerly-loaded pages stay light.
 */

export const DEMO_TOKEN_STORAGE_KEY = 'porchlight_demo_token';

/** Window event fired by "Lamp test"; /stage listens and cycles its on-screen lamp. */
export const LAMP_TEST_EVENT = 'porchlight:lamp-test';

export function getDemoToken(promptText = 'Enter the DEMO_TOKEN (asked once, saved on this device):'): string | null {
  try {
    const stored = window.localStorage.getItem(DEMO_TOKEN_STORAGE_KEY);
    if (stored) return stored;
    const entered = window.prompt(promptText)?.trim();
    if (!entered) return null;
    window.localStorage.setItem(DEMO_TOKEN_STORAGE_KEY, entered);
    return entered;
  } catch {
    return null;
  }
}

function forgetTokenIfDenied(err: unknown) {
  const code = (err as { code?: string } | null)?.code ?? '';
  if (code.includes('permission-denied')) {
    try {
      window.localStorage.removeItem(DEMO_TOKEN_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return true;
  }
  return false;
}

async function callable<Req, Res>(name: string) {
  const [{ fns }, { httpsCallable }] = await Promise.all([import('@/lib/firebase'), import('firebase/functions')]);
  return httpsCallable<Req, Res>(fns, name);
}

export interface OperatorController {
  onReset: () => void;
  onSim: () => void;
  onAttack: () => void;
  onSoundboard: () => void;
  soundboardOn: boolean;
  onLampTest: () => void;
  busy: OperatorAction | null;
  status: OperatorStatus;
}

/** Live `status/bridge` doc (D-12). Returns {} until the first snapshot. */
export function useBridgeStatus(enabled = true): OperatorStatus {
  const [status, setStatus] = useState<OperatorStatus>({});
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        const [{ db }, { doc, onSnapshot }] = await Promise.all([import('@/lib/firebase'), import('firebase/firestore')]);
        if (cancelled) return;
        unsub = onSnapshot(
          doc(db, 'status', 'bridge'),
          (snap) => {
            const d = snap.data() as { piOk?: boolean; hueReachable?: number; lastBeat?: number } | undefined;
            setStatus({ piOk: d?.piOk, hueReachable: d?.hueReachable, lastBeat: d?.lastBeat });
          },
          (err) => console.warn('OperatorBar: status/bridge unavailable', err),
        );
      } catch (err) {
        console.warn('OperatorBar: could not load Firestore', err);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [enabled]);
  return status;
}

export function useOperatorController(enabled = true): OperatorController {
  const bridge = useBridgeStatus(enabled);
  const [busy, setBusy] = useState<OperatorAction | null>(null);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [soundboardOn, setSoundboardOn] = useState(false);
  const soundboardRun = useRef(0);
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const clipCache = useRef<Record<number, HTMLAudioElement>>({});
  const simRunning = useRef(false);

  const say = useCallback((m: string) => setMessage(m), []);

  const onReset = useCallback(() => {
    const token = getDemoToken();
    if (!token) return say('Reset cancelled: no DEMO_TOKEN');
    setBusy('reset');
    say('Resetting demo…');
    void (async () => {
      try {
        const resetDemo = await callable<{ token: string }, unknown>('resetDemo');
        await resetDemo({ token });
        say(`Reset done at ${new Date().toLocaleTimeString()}`);
      } catch (err) {
        console.error('OperatorBar: resetDemo failed', err);
        say(forgetTokenIfDenied(err) ? 'Reset failed: wrong DEMO_TOKEN (cleared, try again)' : 'Reset failed, check the console');
      } finally {
        setBusy(null);
      }
    })();
  }, [say]);

  const onSim = useCallback(() => {
    if (simRunning.current) return say('Simulated scam already running');
    simRunning.current = true;
    setBusy('sim');
    say('Starting simulated scam…');
    void (async () => {
      try {
        const start = await callable<Record<string, never>, { callId: string }>('startSimulatedCall');
        const turn = await callable<{ callId: string; callerText: string }, { reply: string; endCall: boolean }>(
          'simulateTurn',
        );
        const { data } = await start({});
        // Free the buttons once the call exists; the script keeps running in the background.
        setBusy(null);
        for (let i = 0; i < JAIL_SCRIPT.length; i++) {
          say(`Simulated scam: turn ${i + 1}/${JAIL_SCRIPT.length}`);
          const { data: r } = await turn({ callId: data.callId, callerText: JAIL_SCRIPT[i] });
          if (r.endCall) break;
        }
        say('Simulated scam finished');
      } catch (err) {
        console.error('OperatorBar: simulated scam failed', err);
        say('Simulated scam failed, check the console');
      } finally {
        simRunning.current = false;
        setBusy((b) => (b === 'sim' ? null : b));
      }
    })();
  }, [say]);

  const onAttack = useCallback(() => {
    const token = getDemoToken();
    if (!token) return say('Attack cancelled: no DEMO_TOKEN');
    setBusy('attack');
    say('Launching attack call…');
    void (async () => {
      try {
        const attackCall = await callable<{ token: string }, unknown>('attackCall');
        await attackCall({ token });
        say('Attack call launched, the phone should ring');
      } catch (err) {
        console.error('OperatorBar: attackCall failed', err);
        say(forgetTokenIfDenied(err) ? 'Attack failed: wrong DEMO_TOKEN (cleared, try again)' : 'Attack call failed, check the console');
      } finally {
        setBusy(null);
      }
    })();
  }, [say]);

  const stopSoundboard = useCallback(() => {
    soundboardRun.current++;
    currentAudio.current?.pause();
    currentAudio.current = null;
    setSoundboardOn(false);
  }, []);

  const onSoundboard = useCallback(() => {
    if (soundboardOn) {
      stopSoundboard();
      return say('Soundboard stopped');
    }
    const token = getDemoToken();
    if (!token) return say('Soundboard cancelled: no DEMO_TOKEN');
    const run = ++soundboardRun.current;
    setSoundboardOn(true);
    void (async () => {
      try {
        const clips = await callable<
          { token: string; index: number },
          { clips: Array<{ index: number; text: string; audioBase64: string }> }
        >('attackClips');
        for (let i = 0; i < ATTACK_LINES.length; i++) {
          if (run !== soundboardRun.current) return;
          say(`Soundboard: line ${i + 1}/${ATTACK_LINES.length}`);
          let audio = clipCache.current[i];
          if (!audio) {
            const { data } = await clips({ token, index: i });
            audio = new Audio(`data:audio/mpeg;base64,${data.clips[0].audioBase64}`);
            clipCache.current[i] = audio;
          }
          if (run !== soundboardRun.current) return;
          currentAudio.current = audio;
          audio.currentTime = 0;
          await new Promise<void>((resolve, reject) => {
            audio.onended = () => resolve();
            audio.onpause = () => resolve();
            audio.onerror = () => reject(new Error('Audio playback failed'));
            void audio.play().catch(reject);
          });
          if (i < ATTACK_LINES.length - 1) await new Promise((r) => setTimeout(r, 2000));
        }
        if (run === soundboardRun.current) say('Soundboard finished');
      } catch (err) {
        console.error('OperatorBar: soundboard failed', err);
        say(forgetTokenIfDenied(err) ? 'Soundboard failed: wrong DEMO_TOKEN (cleared)' : 'Soundboard failed, check the console');
      } finally {
        if (run === soundboardRun.current) {
          currentAudio.current = null;
          setSoundboardOn(false);
        }
      }
    })();
  }, [say, soundboardOn, stopSoundboard]);

  const lampRunning = useRef(false);
  const onLampTest = useCallback(() => {
    // The on-screen cycle always runs, even if the physical sweep below is unavailable.
    window.dispatchEvent(new CustomEvent(LAMP_TEST_EVENT));
    if (lampRunning.current) return say('Lamp test already running');
    const token = getDemoToken();
    if (!token) return say('Lamp test: on-screen only (no DEMO_TOKEN)');
    lampRunning.current = true;
    setBusy('lamp');
    say('Lamp test: cycling on-screen lamp + physical lamp…');
    void (async () => {
      try {
        // 06-H: lampTest cycles lamp/current; the Mac bridge mirrors it to the Pi + Hue.
        const lampTest = await callable<{ token: string }, { steps: number }>('lampTest');
        await lampTest({ token });
        say('Lamp test done (screen + physical lamp)');
      } catch (err) {
        console.warn('OperatorBar: lampTest unavailable, on-screen only', err);
        const code = (err as { code?: string } | null)?.code ?? '';
        if (forgetTokenIfDenied(err)) say('Lamp test: on-screen only (wrong DEMO_TOKEN, cleared)');
        else if (code.includes('failed-precondition')) say('Lamp test: on-screen only (a live call owns the lamp)');
        else say('Lamp test: on-screen only (physical sweep unavailable, try pnpm venue:up)');
      } finally {
        lampRunning.current = false;
        setBusy((b) => (b === 'lamp' ? null : b));
      }
    })();
  }, [say]);

  // Stop any clip on unmount.
  useEffect(() => () => void (soundboardRun.current++, currentAudio.current?.pause()), []);

  return {
    onReset,
    onSim,
    onAttack,
    onSoundboard,
    soundboardOn,
    onLampTest,
    busy,
    status: { ...bridge, message },
  };
}
