import { useEffect, useState } from 'react';
import type { CallDoc, CallState, Tactic } from '@porchlight/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { outcomeBadge, type OutcomeTone } from '@/lib/outcomeBadge';

/**
 * DASH-01 family dashboard — `/app` (D-08's reserved route). Reads ONLY the public
 * `households/demo/feed/{callId}` mirror (04-01) via a single onSnapshot(list); never
 * `calls/{id}` directly (D-10 closed-rules design). Firebase is dynamically imported
 * inside useEffect (matching Sim.tsx's convention) so this eagerly-imported page
 * (App.tsx renders it without lazy()) never bloats the landing page's main chunk.
 */

type FeedCall = CallDoc & { id: string };

const ACTIVE_STATES = new Set<CallState>(['idle', 'screening', 'verifying']);

// The Badge component (apps/web/src/components/ui/badge.tsx) has no native green/amber/blue
// variant -- these are layered on top of the 'secondary' variant via className, same
// convention as Verify.tsx's/Stage.tsx's own plain-Tailwind-palette one-off state colors.
// 04-POLISH: kept in sync with Stage.tsx's bannerStyle palette so a call's color means the
// same thing on the projector and in the family dashboard.
const BADGE_TONE_CLASS = {
  green: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
} as const;

// 04-POLISH: 'verified' used to render via the Badge's 'default' variant, which resolves to
// the brand amber (--primary), not green -- inconsistent with Stage.tsx's green "VERIFIED"
// banner. Now both surfaces agree: green for verified, amber for verifying, red (native
// 'destructive' variant) for scam.
const STATE_BADGE_VARIANT: Record<CallState, 'outline' | 'secondary' | 'destructive'> = {
  idle: 'outline',
  screening: 'outline',
  verifying: 'secondary',
  verified: 'secondary',
  scam: 'destructive',
  ended: 'outline',
};

const STATE_BADGE_CLASS: Partial<Record<CallState, string>> = {
  verifying: BADGE_TONE_CLASS.amber,
  verified: BADGE_TONE_CLASS.green,
};

const TONE_VARIANT: Record<OutcomeTone, 'default' | 'destructive' | 'secondary'> = {
  success: 'secondary',
  danger: 'destructive',
  neutral: 'secondary',
  info: 'secondary',
};

// 04-POLISH: 'success' (verified/known) used to fall through to the 'default' Badge variant
// (brand amber) with no override -- same Stage.tsx-vs-dashboard color mismatch as above.
const TONE_CLASS: Partial<Record<OutcomeTone, string>> = {
  success: BADGE_TONE_CLASS.green,
  info: BADGE_TONE_CLASS.blue,
};

function riskColor(score: number): string {
  if (score >= 70) return 'oklch(0.65 0.22 25)'; // red — matches Lamp.tsx GLOW_COLOR.red
  if (score >= 40) return 'oklch(0.85 0.17 75)'; // amber — matches Lamp.tsx GLOW_COLOR.amber
  return 'oklch(0.75 0.19 145)'; // green — matches Lamp.tsx GLOW_COLOR.green
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

function Transcript({ turns }: { turns: CallDoc['turns'] }) {
  return (
    <div className="flex flex-col gap-2">
      {turns.map((turn, i) => (
        <p key={i} className={turn.role === 'caller' ? 'text-left' : 'text-right text-primary'}>
          <span className="font-medium">{turn.role === 'caller' ? 'Caller: ' : 'Porchlight: '}</span>
          {turn.text}
        </p>
      ))}
    </div>
  );
}

// Mirrors Stage.tsx's OUTCOME_STATE_LABEL override: 'known' keeps state:'verified' (green)
// but shows its own label, and 'message' ends as state:'ended' but shows a distinct blue
// label -- same outcome-aware naming, on both surfaces.
function liveCallBadge(call: FeedCall): { label: string; variant: 'outline' | 'secondary' | 'destructive'; className?: string } {
  if (call.outcome === 'known') {
    return { label: 'Known caller', variant: 'secondary', className: BADGE_TONE_CLASS.green };
  }
  if (call.outcome === 'message') {
    return { label: 'Message taken', variant: 'secondary', className: BADGE_TONE_CLASS.blue };
  }
  return { label: call.state, variant: STATE_BADGE_VARIANT[call.state], className: STATE_BADGE_CLASS[call.state] };
}

function LiveCallPanel({ call, isActive }: { call: FeedCall; isActive: boolean }) {
  const badge = liveCallBadge(call);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{isActive ? 'Live call' : 'Most recent call'}</span>
          <Badge variant={badge.variant} className={badge.className}>
            {badge.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {call.outcome === 'known' && call.verification?.name ? (
          // 05-ALLOWLIST: an allowlisted caller_id -- show the known name, not a "claims
          // to be" line (nothing was claimed; it was resolved before the call even rang).
          <p className="text-sm text-muted-foreground">
            Known caller: <span className="font-medium text-foreground">{call.verification.name}</span>
          </p>
        ) : (
          call.risk.claimedIdentity && (
            <p className="text-sm text-muted-foreground">
              Claims to be: <span className="font-medium text-foreground">{call.risk.claimedIdentity}</span>
            </p>
          )
        )}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Risk score</span>
            <span className="font-bold text-foreground">{call.risk.score}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${call.risk.score}%`, backgroundColor: riskColor(call.risk.score) }}
            />
          </div>
        </div>
        {call.risk.tactics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {call.risk.tactics.map((tactic: Tactic) => (
              <Badge key={tactic} variant="outline">
                {tactic}
              </Badge>
            ))}
          </div>
        )}
        <Transcript turns={call.turns} />
      </CardContent>
    </Card>
  );
}

function HistoryRow({ call, expanded, onToggle }: { call: FeedCall; expanded: boolean; onToggle: () => void }) {
  const badge = outcomeBadge(call.outcome);
  return (
    <div className="rounded-lg ring-1 ring-foreground/10">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
      >
        <div className="flex flex-col">
          <span className="font-medium">{call.from}</span>
          <span className="text-sm text-muted-foreground">{formatTime(call.startedAt)}</span>
        </div>
        <Badge variant={TONE_VARIANT[badge.tone]} className={TONE_CLASS[badge.tone]}>
          {badge.label}
        </Badge>
      </button>
      {expanded && (
        <div className="flex flex-col gap-4 border-t border-border px-4 py-3">
          <Transcript turns={call.turns} />
          {call.message && (
            <p className="text-sm">
              <span className="font-medium">Message: </span>
              {call.message.text}
              {call.message.callback && ` (callback: ${call.message.callback})`}
            </p>
          )}
          <p className="text-sm text-muted-foreground">{call.report ? call.report : 'Report pending'}</p>
        </div>
      )}
    </div>
  );
}

export default function AppPlaceholder() {
  const [calls, setCalls] = useState<FeedCall[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

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
          console.error('AppPlaceholder: feed onSnapshot failed', err);
          setError('Could not load the call feed — check the console.');
        },
      );
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const activeCall = calls?.find((c) => ACTIVE_STATES.has(c.state)) ?? calls?.[0] ?? null;
  const isActive = activeCall ? ACTIVE_STATES.has(activeCall.state) : false;
  // 04-POLISH (verified): `calls` is already ordered newest-first (orderBy('startedAt',
  // 'desc') above) and .filter() preserves order, so history stays newest-first with no
  // extra sort needed here.
  const historyCalls = calls ? (isActive ? calls.filter((c) => c.id !== activeCall?.id) : calls) : [];

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Family dashboard</h1>
        <p className="text-muted-foreground">
          Every screened call, live transcript, and risk reason for your household.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {calls === null && !error && <p className="text-muted-foreground">Loading calls…</p>}

      {calls !== null && calls.length === 0 && (
        <p className="text-muted-foreground">No calls yet — Porchlight is watching.</p>
      )}

      {activeCall && <LiveCallPanel call={activeCall} isActive={isActive} />}

      {historyCalls.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">History</h2>
          {historyCalls.map((call) => (
            <HistoryRow
              key={call.id}
              call={call}
              expanded={expandedCallId === call.id}
              onToggle={() => setExpandedCallId((cur) => (cur === call.id ? null : call.id))}
            />
          ))}
        </div>
      )}

      <a href="/" className="text-primary underline underline-offset-4">
        Back to Porchlight
      </a>
    </div>
  );
}
