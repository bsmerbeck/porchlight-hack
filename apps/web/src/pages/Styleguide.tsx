import { useEffect, useState } from 'react';
import type { CallTurn, Tactic } from '@porchlight/shared';
import {
  CallerCard,
  LampGlow,
  OperatorBar,
  OutcomeBadge,
  ReadyState,
  RiskMeter,
  StateBanner,
  StatusDot,
  Transcript,
  STATE_VISUALS,
  type OperatorAction,
  type StateKey,
} from '@/components/porch';
import { cn } from '@/lib/utils';

const KEYS = Object.keys(STATE_VISUALS) as StateKey[];

const SCRIPT: CallTurn[] = [
  { role: 'assistant', text: "Hi, this is Porchlight answering for Margaret. Who's calling?", at: 1 },
  { role: 'caller', text: "Grandma, it's me, Brendan. I'm in trouble, I need help right now.", at: 2 },
  { role: 'assistant', text: "I'm sorry to hear that. Can you tell me what's going on?", at: 3 },
  { role: 'caller', text: "I got arrested. Please don't tell Mom. I need bail money in gift cards.", at: 4 },
  { role: 'assistant', text: "Let me check with the family before we go any further.", at: 5 },
];
const TACTIC_STEPS: Tactic[][] = [[], ['urgency'], ['urgency', 'secrecy'], ['urgency', 'secrecy', 'authority_bail', 'payment_method']];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="label-caps text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Board({ dark }: { dark: boolean }) {
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setStep((s) => (s + 1) % (SCRIPT.length + 1)), 1800);
    return () => clearInterval(id);
  }, [auto]);
  const score = [8, 22, 45, 68, 92, 92][step] ?? 0;
  const tactics = TACTIC_STEPS[Math.min(step, TACTIC_STEPS.length - 1)];

  return (
    <div className={cn(dark && 'dark', 'bg-background text-foreground')}>
      <div className="mx-auto max-w-[1400px] space-y-12 px-8 py-12">
        <header className="flex items-center justify-between">
          <h1 className="text-4xl font-bold tracking-tight">{dark ? 'Dark (Stage / Verify)' : 'Light (Landing / App)'}</h1>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> animate demo
          </label>
        </header>

        <Section title="Palette + state colors">
          <div className="flex flex-wrap gap-3">
            {['background', 'surface', 'surface-2', 'card', 'muted', 'primary', 'border'].map((n) => (
              <div key={n} className="w-28 overflow-hidden rounded-xl border shadow-soft">
                <div className="h-14" style={{ background: `var(--${n})` }} />
                <div className="px-2 py-1 text-xs">{n}</div>
              </div>
            ))}
            {KEYS.map((k) => (
              <div key={k} className="w-28 overflow-hidden rounded-xl border shadow-soft">
                <div className="h-14" style={{ background: STATE_VISUALS[k].colorVar }} />
                <div className="px-2 py-1 text-xs">state-{k}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="LampGlow (every state)">
          <div className="flex flex-wrap items-end gap-6">
            {KEYS.map((k) => (
              <div key={k} className="flex flex-col items-center gap-2">
                <LampGlow state={k} size="sm" />
                <span className="text-xs text-muted-foreground">{k}</span>
              </div>
            ))}
          </div>
          <div className="flex items-end gap-8">
            <LampGlow size="sm" />
            <LampGlow size="md" />
            <LampGlow size="lg" state="verifying" />
          </div>
        </Section>

        <Section title="StateBanner — stage">
          <div className="space-y-4">
            {KEYS.map((k) => (
              <StateBanner key={k} state={k} sub={k === 'known' ? 'Brenden — on the allowlist' : undefined} />
            ))}
          </div>
        </Section>

        <Section title="StateBanner — phone + compact">
          <div className="grid gap-4 md:grid-cols-2">
            {KEYS.map((k) => (
              <div key={k} className="space-y-2">
                <StateBanner state={k} size="phone" sub="Tap to review" />
                <StateBanner state={k} size="compact" />
              </div>
            ))}
          </div>
        </Section>

        <Section title="RiskMeter (animated)">
          <div className="grid gap-10 lg:grid-cols-2">
            <RiskMeter score={score} tactics={tactics} />
            <div className="space-y-6">
              <RiskMeter score={12} tactics={[]} size="compact" />
              <RiskMeter score={55} tactics={['urgency', 'impersonation']} size="compact" />
              <RiskMeter score={94} tactics={['urgency', 'secrecy', 'payment_method', 'authority_bail', 'impersonation']} size="compact" />
            </div>
          </div>
        </Section>

        <Section title="Transcript (auto-scroll, pending shimmer)">
          <div className="grid gap-8 lg:grid-cols-2">
            <Transcript
              turns={SCRIPT.slice(0, step)}
              pending={step < SCRIPT.length ? (SCRIPT[step]?.role ?? true) : false}
              className="h-[420px] rounded-3xl border bg-card p-6"
            />
            <Transcript turns={SCRIPT} size="compact" className="h-[420px] rounded-2xl border bg-card p-4" />
          </div>
        </Section>

        <Section title="CallerCard">
          <div className="grid gap-4 lg:grid-cols-2">
            <CallerCard name="Brenden" claimedText="Brendan" from="+14015550123" />
            <CallerCard name="Brenden" from="+14014979735" known />
            <CallerCard from="+18005550199" />
            <div className="space-y-3">
              <CallerCard size="compact" name="Brenden" claimedText="Brendan" from="+14015550123" />
              <CallerCard size="compact" name="Brenden" from="+14014979735" known />
            </div>
          </div>
        </Section>

        <Section title="OutcomeBadge + StatusDot">
          <div className="flex flex-wrap gap-3">
            {(['verified', 'known', 'scam', 'message', 'screened', undefined] as const).map((o) => (
              <OutcomeBadge key={String(o)} outcome={o} />
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {KEYS.map((k) => (
              <OutcomeBadge key={k} visual={k} size="lg" />
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {KEYS.map((k) => (
              <OutcomeBadge key={k} visual={k} size="sm" />
            ))}
          </div>
          <div className="flex flex-wrap gap-6">
            <StatusDot tone="ok" label="ok" />
            <StatusDot tone="warn" label="warn" pulse />
            <StatusDot tone="bad" label="bad" />
            <StatusDot tone="off" label="off" />
            {KEYS.map((k) => (
              <StatusDot key={k} state={k} label={k} pulse={k === 'verifying'} />
            ))}
          </div>
        </Section>

        <Section title="ReadyState">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border bg-card p-10">
              <ReadyState title="Porchlight is watching Margaret's line" subtitle="Unknown callers are screened before the phone ever rings." />
            </div>
            <div className="rounded-3xl border bg-card p-6">
              <ReadyState size="phone" lampSize="md" title="Watching for calls to Margaret" subtitle="Signed in as Brenden">
                <OutcomeBadge visual="verified" label="Passkey ready" />
              </ReadyState>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

/** /styleguide -- every porch component in every state, dark and light. */
export default function Styleguide() {
  const [busy, setBusy] = useState<OperatorAction | null>(null);
  const [sb, setSb] = useState(false);
  const [beat] = useState(() => Date.now());
  const fake = (a: OperatorAction) => () => {
    setBusy(a);
    setTimeout(() => setBusy(null), 1200);
  };
  return (
    <div className="min-h-screen">
      <Board dark />
      <Board dark={false} />
      <OperatorBar
        alwaysVisible
        connected={false}
        onReset={fake('reset')}
        onSim={fake('sim')}
        onAttack={fake('attack')}
        onSoundboard={() => setSb((v) => !v)}
        soundboardOn={sb}
        onLampTest={fake('lamp')}
        busy={busy}
        status={{ piOk: true, hueReachable: 3, lastBeat: beat, message: busy ? `Running ${busy}…` : 'Ready' }}
      />
    </div>
  );
}
