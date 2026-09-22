import { useEffect, useState } from 'react';
import { JAIL_SCRIPT, type CallDoc, type Tactic } from '@porchlight/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

type RunStatus = 'idle' | 'running' | 'done' | 'error';

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
