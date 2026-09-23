import { useEffect, type ReactNode } from 'react';
import { LampGlow } from '@/components/porch';
import { cn } from '@/lib/utils';
import {
  ASSUMPTIONS,
  B2B_BUYERS,
  B2B_PRICING,
  BENEFITS,
  BLENDED_ARPU,
  COMPS,
  CONSUMER_PRICING,
  FINANCING,
  HEADLINE_STATS,
  HOW_IT_WORKS,
  INTEGRATIONS,
  INTENT,
  MONTHLY_RAMP,
  PAYER,
  SCENARIO_SET,
  type ScenarioKey,
  type ScenarioYear,
  SECTIONS,
  SOURCES,
  USER,
  VALUATION_M24,
  Y1_SPLIT,
  Y2_ARR,
  Y2_DRIVERS,
  Y2_REVENUE,
} from './brief/briefData';

// Unlisted investor brief (/brief-p7k3). Not linked anywhere; noindex while mounted.

const TONE_BORDER: Record<string, string> = {
  verified: 'border-t-state-verified',
  idle: 'border-t-state-idle',
  screening: 'border-t-state-screening',
};

function Section({ index, children }: { index: number; children: ReactNode }) {
  const s = SECTIONS[index];
  return (
    <section id={s.id} className="scroll-mt-20 space-y-6 border-t border-border pt-10">
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
        <span className="mr-3 text-amber tabular">{String(index + 1).padStart(2, '0')}</span>
        {s.title}
      </h2>
      {children}
    </section>
  );
}

function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-2xl border border-border bg-surface p-5 shadow-soft', className)}>{children}</div>;
}

function Stat({ value, label, className }: { value: string; label: string; className?: string }) {
  return (
    <Card className={className}>
      <div className="text-3xl font-bold tracking-tight tabular sm:text-4xl">{value}</div>
      <div className="mt-1 text-base text-muted-foreground">{label}</div>
    </Card>
  );
}

function RampChart() {
  const max = Math.max(...MONTHLY_RAMP.map((m) => m.total));
  const W = 600;
  const H = 220;
  const pad = 24;
  const bw = (W - pad) / MONTHLY_RAMP.length;
  return (
    <Card>
      <div className="mb-3 text-base font-semibold">Monthly revenue ramp, months 1–12</div>
      <svg viewBox={`0 0 ${W} ${H + 40}`} className="h-auto w-full" role="img" aria-label="Monthly revenue from $8.9K in month 1 to $300K in month 12">
        {MONTHLY_RAMP.map((m, i) => {
          const h = (m.total / max) * H;
          const x = pad / 2 + i * bw + 4;
          return (
            <g key={m.month}>
              <rect x={x} y={H - h + 16} width={bw - 8} height={h} rx={4} fill="var(--state-idle)" opacity={0.35 + 0.65 * (m.total / max)} />
              <text x={x + (bw - 8) / 2} y={H + 36} textAnchor="middle" fontSize="14" fill="var(--muted-foreground)">
                {m.month}
              </text>
              {(i === 0 || i === 5 || i === 11) && (
                <text x={x + (bw - 8) / 2} y={H - h + 10} textAnchor="middle" fontSize="14" fontWeight="600" fill="var(--foreground)">
                  ${Math.round(m.total / 1000)}K
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Card>
  );
}

export default function Brief() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Porchlight: Brief';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex,nofollow';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
      document.title = prevTitle;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 py-3">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="shrink-0 rounded-full border border-border bg-surface px-4 py-1.5 text-base font-medium hover:bg-accent"
            >
              {s.chip}
            </a>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-5xl space-y-14 px-4 pb-24 pt-8 text-lg sm:px-6">
        <header className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
          <div className="flex shrink-0 text-foreground">
            <LampGlow state="verified" size={110} />
            <LampGlow state="scam" size={110} />
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Porchlight</h1>
            <p className="text-xl text-muted-foreground">
              AI scam guardian for an aging parent's phone. <span className="font-semibold text-foreground">$1.43M</span> year-1
              revenue, <span className="font-semibold text-foreground">$2.85M</span> exit ARR, <span className="font-semibold text-foreground">~$35M</span> at
              month 12 (High case). Waitlist live.
            </p>
          </div>
        </header>

        <Section index={0}>
          <p className="text-xl leading-relaxed">{INTENT}</p>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((h, i) => (
              <li key={h.step}>
                <Card className="h-full">
                  <div className="text-amber text-2xl font-bold tabular">{i + 1}</div>
                  <div className="mt-1 text-xl font-semibold">{h.step}</div>
                  <div className="mt-1 text-base text-muted-foreground">{h.detail}</div>
                </Card>
              </li>
            ))}
          </ol>
        </Section>

        <Section index={1}>
          <div className="grid gap-4 sm:grid-cols-2">
            {[PAYER, USER].map((p) => (
              <Card key={p.label} className="border-t-4 border-t-state-idle">
                <div className="label-caps text-sm text-muted-foreground">{p.label}</div>
                <div className="mt-2 text-xl font-semibold">{p.who}</div>
                <div className="mt-2 text-base text-muted-foreground">{p.why}</div>
              </Card>
            ))}
          </div>
          <div>
            <div className="label-caps mb-3 text-sm text-muted-foreground">Secondary B2B2C buyers</div>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
              {B2B_BUYERS.map((b) => (
                <li key={b.who} className="p-4 sm:flex sm:gap-4">
                  <span className="font-semibold sm:w-60 sm:shrink-0">{b.who}</span>
                  <span className="text-muted-foreground">{b.why}</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section index={2}>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {HEADLINE_STATS.map((s, i) => (
              <Stat key={s.label} value={s.value} label={s.label} className={i < 2 ? 'border-t-4 border-t-state-scam' : ''} />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {BENEFITS.map((b) => (
              <Card key={b.who} className={cn('border-t-4', TONE_BORDER[b.tone])}>
                <div className="text-xl font-semibold">{b.who}</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-base">
                  {b.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </Section>

        <Section index={3}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INTEGRATIONS.map((g) => (
              <Card key={g.group}>
                <div className="text-xl font-semibold">{g.group}</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-base">
                  {g.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </Section>

        <Section index={4}>
          <div className="grid gap-4 sm:grid-cols-3">
            {CONSUMER_PRICING.map((p) => (
              <Card key={p.name}>
                <div className="text-base text-muted-foreground">{p.name}</div>
                <div className="text-4xl font-bold tabular">{p.price}</div>
                <div className="mt-2 text-base">{p.detail}</div>
              </Card>
            ))}
          </div>
          <p className="text-base text-muted-foreground">{BLENDED_ARPU}</p>
          <div>
            <div className="label-caps mb-3 text-sm text-muted-foreground">B2B2C</div>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
              {B2B_PRICING.map((b) => (
                <li key={b.who} className="p-4 sm:flex sm:gap-4">
                  <span className="font-semibold sm:w-72 sm:shrink-0">{b.who}</span>
                  <span className="tabular">{b.price}</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section index={5}>
          <ScenarioCards year="y1" />
          <div className="label-caps text-sm text-muted-foreground">High case breakdown</div>
          <div className="grid gap-4 sm:grid-cols-3">
            {Y1_SPLIT.map((s) => (
              <Stat key={s.label} value={s.value} label={s.label} />
            ))}
          </div>
          <RampChart />
        </Section>

        <Section index={6}>
          <ScenarioCards year="y2" />
          <div className="label-caps text-sm text-muted-foreground">High case: drivers and math</div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {Y2_DRIVERS.map((d) => (
              <li key={d} className="rounded-xl border border-border bg-surface p-4 text-base">
                {d}
              </li>
            ))}
          </ul>
          <div className="grid gap-4 sm:grid-cols-3">
            {Y2_REVENUE.map((r) => (
              <Stat key={r.label} value={r.value} label={`${r.label}: ${r.math}`} />
            ))}
          </div>
          <p className="text-base text-muted-foreground">Exit ARR {Y2_ARR.total}: {Y2_ARR.math}.</p>
          <ScenarioTable />
        </Section>

        <Section index={7}>
          <div className="space-y-4">
            {(['y1', 'y2'] as const).map((y) => (
              <div key={y}>
                <div className="label-caps mb-3 text-sm text-muted-foreground">{y === 'y1' ? 'Month 12' : 'Month 24'}</div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {SCENARIO_SET.map((sc) => (
                    <Card key={sc.key} className={cn('border-t-4', SCENARIO_BORDER[sc.key], sc.key === 'high' && 'shadow-lift')}>
                      <div className="text-base font-semibold text-muted-foreground">{sc.name}</div>
                      <div className="text-4xl font-bold tabular sm:text-5xl">{sc[y].valuation}</div>
                      <div className="mt-2 text-base">{sc[y].valuationMath}</div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {COMPS.map((c) => (
              <Stat key={c.name} value={c.value} label={`${c.name}: ${c.note}`} />
            ))}
          </div>
          <div>
            <div className="label-caps mb-3 text-sm text-muted-foreground">Financing path</div>
            <ol className="divide-y divide-border rounded-2xl border border-border bg-surface">
              {[...FINANCING, { stage: 'Month 24 (High)', detail: `${VALUATION_M24.financing} at ~$140M` }].map((f) => (
                <li key={f.stage} className="p-4 sm:flex sm:gap-4">
                  <span className="font-semibold sm:w-60 sm:shrink-0">{f.stage}</span>
                  <span>{f.detail}</span>
                </li>
              ))}
            </ol>
          </div>
          <Card className="bg-surface-2">
            <div className="label-caps text-sm text-muted-foreground">Assumptions</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-base">
              {ASSUMPTIONS.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Card>
        </Section>

        <Section index={8}>
          <ul className="space-y-2 text-base">
            {SOURCES.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="underline decoration-amber underline-offset-4 break-words">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      </main>
    </div>
  );
}

const SCENARIO_BORDER: Record<ScenarioKey, string> = {
  low: 'border-t-state-screening',
  mid: 'border-t-state-idle',
  high: 'border-t-state-verified',
};

function ScenarioCards({ year }: { year: 'y1' | 'y2' }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {SCENARIO_SET.map((sc) => {
        const d: ScenarioYear = sc[year];
        return (
          <Card key={sc.key} className={cn('border-t-4', SCENARIO_BORDER[sc.key], sc.key === 'high' && 'shadow-lift')}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xl font-semibold">{sc.name}</span>
              {sc.key === 'high' && <span className="text-sm font-semibold text-muted-foreground">HEADLINE</span>}
            </div>
            <div className="mt-2 text-3xl font-bold tabular">{d.revenue}</div>
            <div className="text-base text-muted-foreground">revenue</div>
            <div className="mt-2 text-2xl font-bold tabular">{d.arr}</div>
            <div className="text-base text-muted-foreground">exit ARR: {d.arrMath}</div>
            <div className="mt-3 border-t border-border pt-2 text-base">{sc.driver}</div>
          </Card>
        );
      })}
    </div>
  );
}

function ScenarioTable() {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[560px] text-left text-base tabular">
        <thead className="text-muted-foreground">
          <tr>
            <th className="p-3">Scenario</th>
            <th className="p-3">Y1 revenue</th>
            <th className="p-3">Y1 exit ARR</th>
            <th className="p-3">Month-12 value</th>
            <th className="p-3">Y2 revenue</th>
            <th className="p-3">Y2 exit ARR</th>
            <th className="p-3">Month-24 value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {SCENARIO_SET.map((sc) => (
            <tr key={sc.key} className={sc.key === 'high' ? 'font-semibold' : ''}>
              <td className="p-3">{sc.name}</td>
              <td className="p-3">{sc.y1.revenue}</td>
              <td className="p-3">{sc.y1.arr}</td>
              <td className="p-3">{sc.y1.valuation}</td>
              <td className="p-3">{sc.y2.revenue}</td>
              <td className="p-3">{sc.y2.arr}</td>
              <td className="p-3">{sc.y2.valuation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
