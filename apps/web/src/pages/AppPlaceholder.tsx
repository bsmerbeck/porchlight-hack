import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BellRing, ChevronDown, ShieldCheck } from 'lucide-react';
import type { Tactic } from '@porchlight/shared';
import {
  CallerCard,
  LampGlow,
  OutcomeBadge,
  RiskMeter,
  StateBanner,
  StatusDot,
  TACTIC_META,
  Transcript,
  deriveFreshStageState,
  formatPhone,
  riskColor,
  stateKey,
} from '@/components/porch';
import { useDemoAlerts, useDemoFeed, useNow, type FeedCall, type FamilyAlert } from '@/lib/useDemoFeed';
import { cn } from '@/lib/utils';

/**
 * DASH-01 family dashboard — `/app` (light theme, D-01). Reads ONLY the public
 * `households/demo/feed/{callId}` mirror (never `calls/{id}`, D-10 closed rules) plus the
 * W7 `households/demo/alerts` collection. What's "live" comes from deriveStageState (D-06)
 * so a refresh rebuilds exactly the same view. Firebase is lazy-imported inside the hooks.
 */

const SENIOR = 'Margaret';

function callerName(call: FeedCall): string {
  return call.verification?.name ?? call.risk.claimedIdentity ?? (formatPhone(call.from) || 'Unknown caller');
}

function relTime(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function TacticChips({ tactics }: { tactics: readonly string[] }) {
  if (tactics.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tactics.map((t) => {
        const meta = TACTIC_META[t as Tactic];
        const Icon = meta?.icon;
        return (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground"
          >
            {Icon && <Icon size={12} aria-hidden />}
            {meta?.label ?? t.replace(/_/g, ' ')}
          </span>
        );
      })}
    </div>
  );
}

function AlertsPanel({ alerts, now }: { alerts: FamilyAlert[]; now: number }) {
  if (alerts.length === 0) return null;
  const [latest, ...rest] = alerts;
  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-amber/40 bg-amber/10 p-5 shadow-soft"
      role="alert"
    >
      <div className="flex items-start gap-4">
        <span className="relative mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full bg-amber text-background">
          <BellRing size={22} aria-hidden />
          <span className="absolute inset-0 animate-pulse-ring rounded-full" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-lg font-semibold leading-tight">{SENIOR} asked you to call her</p>
          <p className="text-sm text-muted-foreground">
            She pressed the button on her Porchlight lamp · {relTime(latest.createdAt, now)} ({clockTime(latest.createdAt)})
          </p>
          {rest.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {rest.length} earlier request{rest.length === 1 ? '' : 's'} today
            </p>
          )}
        </div>
      </div>
    </motion.section>
  );
}

function ProtectionHero({ call, calls }: { call?: FeedCall; calls: FeedCall[] }) {
  const key = stateKey(call);
  const blocked = calls.filter((c) => c.outcome === 'scam' || c.state === 'scam').length;
  return (
    <section className="flex flex-col items-center gap-5 rounded-3xl bg-card p-6 text-center shadow-soft ring-1 ring-foreground/5 sm:flex-row sm:p-8 sm:text-left">
      <LampGlow state={key} size="md" className="shrink-0 text-foreground" />
      <div className="flex flex-col gap-3">
        <div className="inline-flex items-center justify-center gap-2 sm:justify-start">
          <StatusDot tone="ok" pulse />
          <span className="label-caps !text-xs text-muted-foreground">Protection on</span>
        </div>
        <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
          Porchlight is watching {SENIOR}&rsquo;s line
        </h1>
        <p className="text-muted-foreground">
          Unknown callers are screened before her phone rings. You&rsquo;ll be asked to confirm anyone claiming to be
          family.
        </p>
        <dl className="mt-1 flex justify-center gap-6 sm:justify-start">
          <div>
            <dt className="text-xs text-muted-foreground">Calls screened</dt>
            <dd className="tabular text-2xl font-semibold">{calls.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Scams blocked</dt>
            <dd className="tabular text-2xl font-semibold text-state-scam">{blocked}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function LiveCallCard({ call, mode }: { call: FeedCall; mode: 'live' | 'result' }) {
  const key = stateKey(call);
  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex flex-col gap-5 rounded-3xl bg-card p-5 shadow-lift ring-1 ring-foreground/5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <StatusDot state={key} pulse={mode === 'live'} />
          {mode === 'live' ? 'Live call right now' : 'Call just finished'}
        </span>
        <span className="tabular text-sm text-muted-foreground">{clockTime(call.startedAt)}</span>
      </div>
      <StateBanner state={key} size="compact" />
      <CallerCard
        size="compact"
        name={call.verification?.name ?? call.risk.claimedIdentity}
        claimedText={call.verification?.claimedText}
        from={call.from}
        known={call.outcome === 'known'}
      />
      {call.outcome !== 'known' && <RiskMeter score={call.risk.score} tactics={call.risk.tactics} size="compact" />}
      {call.turns.length > 0 && (
        <Transcript
          turns={call.turns}
          size="compact"
          pending={mode === 'live'}
          className="max-h-72 rounded-2xl bg-surface p-3"
        />
      )}
      {call.message && (
        <p className="rounded-2xl bg-surface p-3 text-sm">
          <span className="font-medium">Message: </span>
          {call.message.text}
          {call.message.callback && ` · callback ${call.message.callback}`}
        </p>
      )}
    </motion.section>
  );
}

function HistoryRow({
  call,
  now,
  expanded,
  onToggle,
}: {
  call: FeedCall;
  now: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isKnown = call.outcome === 'known';
  return (
    <li className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full flex-col gap-2 px-4 py-3.5 text-left transition-colors hover:bg-surface/60 sm:px-5"
      >
        <div className="flex w-full items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{callerName(call)}</span>
            <span className="truncate text-xs text-muted-foreground">
              {formatPhone(call.from)} · {relTime(call.startedAt, now)}
            </span>
          </div>
          {!isKnown && (
            <div className="flex flex-col items-end">
              <span className="tabular text-lg font-semibold leading-none" style={{ color: riskColor(call.risk.score) }}>
                {call.risk.score}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">risk</span>
            </div>
          )}
          <OutcomeBadge outcome={call.outcome} state={call.state} size="sm" />
          <ChevronDown
            size={16}
            aria-hidden
            className={cn('shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
          />
        </div>
        <TacticChips tactics={call.risk.tactics} />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:px-5">
              {call.turns.length > 0 ? (
                <Transcript turns={call.turns} size="compact" className="max-h-80" />
              ) : (
                <p className="text-sm text-muted-foreground">No transcript for this call.</p>
              )}
              {call.message && (
                <p className="text-sm">
                  <span className="font-medium">Message: </span>
                  {call.message.text}
                  {call.message.callback && ` · callback ${call.message.callback}`}
                </p>
              )}
              <div className="rounded-xl bg-surface p-3 text-sm">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Porchlight report
                </p>
                <p className={cn(!call.report && 'text-muted-foreground')}>
                  {call.report ?? 'Report is being written…'}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export default function AppPlaceholder() {
  const { calls, error } = useDemoFeed();
  const { alerts, available: alertsAvailable } = useDemoAlerts();
  const now = useNow();
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  const stage = useMemo(() => deriveFreshStageState(calls ?? [], now), [calls, now]);
  const current = stage.mode === 'ready' ? undefined : stage.call;
  const history = (calls ?? []).filter((c) => c.id !== current?.id);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <a href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight">
            <span className="size-2.5 rounded-full bg-amber shadow-glow" aria-hidden />
            Porchlight
          </a>
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <ShieldCheck size={16} className="text-state-verified" aria-hidden />
            {SENIOR}&rsquo;s line
          </span>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8">
        {alertsAvailable && <AlertsPanel alerts={alerts} now={now} />}

        <ProtectionHero call={current} calls={calls ?? []} />

        <AnimatePresence mode="popLayout">
          {current && stage.mode !== 'ready' && <LiveCallCard key={current.id} call={current} mode={stage.mode} />}
        </AnimatePresence>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Recent calls</h2>
            {calls && calls.length > 0 && (
              <span className="text-xs text-muted-foreground">Tap a call for the transcript</span>
            )}
          </div>

          {error && <p className="rounded-2xl bg-card p-4 text-sm text-destructive shadow-soft">{error}</p>}

          {calls === null && !error && (
            <ul className="flex flex-col gap-2" aria-busy>
              {[0, 1, 2].map((i) => (
                <li key={i} className="porch-shimmer h-16 rounded-2xl bg-card shadow-soft" />
              ))}
            </ul>
          )}

          {calls !== null && history.length === 0 && (
            <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
              {calls.length === 0
                ? `No calls yet. When someone calls ${SENIOR}, you'll see it here as it happens.`
                : 'No earlier calls.'}
            </p>
          )}

          {history.length > 0 && (
            <ul className="flex flex-col gap-2">
              {history.map((call) => (
                <HistoryRow
                  key={call.id}
                  call={call}
                  now={now}
                  expanded={expandedCallId === call.id}
                  onToggle={() => setExpandedCallId((cur) => (cur === call.id ? null : call.id))}
                />
              ))}
            </ul>
          )}
        </section>

        <footer className="pb-6 pt-2 text-center text-xs text-muted-foreground">
          Porchlight screens calls with AI and asks family before anyone gets through.
        </footer>
      </main>
    </div>
  );
}
