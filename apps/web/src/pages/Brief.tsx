import { useEffect, type ReactNode } from 'react';
import { LampGlow } from '@/components/porch';
import { cn } from '@/lib/utils';
import {
  ASSUMPTIONS,
  B2B_BUYERS,
  B2B_PRICING,
  BENEFITS,
  BLENDED_ARPU,
  CITATIONS,
  citationById,
  citationNumber,
  type CitationId,
  COMPS,
  CONSUMER_PRICING,
  CUSTOMER_FACTS,
  type Fact,
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
  THREAT_STATS,
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

// Inline citation: small superscript [n] that opens the source in a new tab.
// Inline padding enlarges the tap target (~24px) without changing line height.
function Cite({ ids }: { ids: CitationId[] }) {
  return (
    <sup className="ml-0.5 whitespace-nowrap align-baseline text-[0.7em] leading-none">
      {ids.map((id) => {
        const c = citationById(id);
        const n = citationNumber(id);
        return (
          <a
            key={id}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`${c.publisher}: ${c.stat}`}
            aria-label={`Source ${n}: ${c.publisher}, ${c.label}`}
            className="relative -top-[0.5em] rounded px-[5px] py-[7px] font-semibold text-amber no-underline hover:underline focus-visible:outline-2 focus-visible:outline-amber"
          >
            [{n}]
          </a>
        );
      })}
    </sup>
  );
}

// Marks our own forecast / valuation numbers, linking to the Assumptions note instead of a source.
function Projection() {
  return (
    <a
      href="#assumptions"
      className="ml-1.5 inline-block rounded-full border border-dashed border-border px-2 align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground no-underline hover:bg-accent"
      title="Our projection; see Assumptions"
    >
      Projection
    </a>
  );
}

function Stat({
  value,
  label,
  className,
  cite,
  projection,
}: {
  value: string;
  label: string;
  className?: string;
  cite?: CitationId[];
  projection?: boolean;
}) {
  return (
    <Card className={className}>
      <div className="text-3xl font-bold tracking-tight tabular sm:text-4xl">
        {value}
        {cite && <Cite ids={cite} />}
      </div>
      <div className="mt-1 text-base text-muted-foreground">
        {label}
        {projection && <Projection />}
      </div>
    </Card>
  );
}

function FactGrid({ facts, accent }: { facts: Fact[]; accent?: string }) {
  return (
    <div className={cn('grid gap-4', facts.length === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3')}>
      {facts.map((f) => (
        <Stat key={f.label} value={f.value} label={f.label} cite={f.cite} className={accent} />
      ))}
    </div>
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
      <div className="mb-3 text-base font-semibold">
        Monthly revenue ramp, months 1–12 (High case)
        <Projection />
      </div>
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
              <Projection />
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
          <FactGrid facts={CUSTOMER_FACTS} />
          <div>
            <div className="label-caps mb-3 text-sm text-muted-foreground">Secondary B2B2C buyers</div>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
              {B2B_BUYERS.map((b) => (
                <li key={b.who} className="p-4 sm:flex sm:gap-4">
                  <span className="font-semibold sm:w-60 sm:shrink-0">{b.who}</span>
                  <span className="text-muted-foreground">
                    {b.why}
                    {b.cite && <Cite ids={b.cite} />}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section index={2}>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {HEADLINE_STATS.map((s, i) => (
              <Stat key={s.label} value={s.value} label={s.label} cite={s.cite} className={i < 2 ? 'border-t-4 border-t-state-scam' : ''} />
            ))}
          </div>
          <FactGrid facts={THREAT_STATS} accent="border-t-4 border-t-state-screening" />
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
                {g.fact && (
                  <p className="mt-3 border-t border-border pt-2 text-base text-muted-foreground">
                    {g.fact.text}
                    <Cite ids={g.fact.cite} />
                  </p>
                )}
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
          <div className="label-caps text-sm text-muted-foreground">
            High case breakdown
            <Projection />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {Y1_SPLIT.map((s) => (
              <Stat key={s.label} value={s.value} label={s.label} projection />
            ))}
          </div>
          <RampChart />
        </Section>

        <Section index={6}>
          <ScenarioCards year="y2" />
          <div className="label-caps text-sm text-muted-foreground">
            High case: drivers and math
            <Projection />
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {Y2_DRIVERS.map((d) => (
              <li key={d} className="rounded-xl border border-border bg-surface p-4 text-base">
                {d}
              </li>
            ))}
          </ul>
          <div className="grid gap-4 sm:grid-cols-3">
            {Y2_REVENUE.map((r) => (
              <Stat key={r.label} value={r.value} label={`${r.label}: ${r.math}`} projection />
            ))}
          </div>
          <p className="text-base text-muted-foreground">Exit ARR {Y2_ARR.total}: {Y2_ARR.math}.</p>
          <ScenarioTable />
        </Section>

        <Section index={7}>
          <div className="space-y-4">
            {(['y1', 'y2'] as const).map((y) => (
              <div key={y}>
                <div className="label-caps mb-3 text-sm text-muted-foreground">
                  {y === 'y1' ? 'Month 12' : 'Month 24'}
                  <Projection />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {SCENARIO_SET.map((sc) => (
                    <Card key={sc.key} className={cn('border-t-4', SCENARIO_BORDER[sc.key], sc.key === 'high' && 'shadow-lift')}>
                      <div className="text-base font-semibold text-muted-foreground">{sc.name}</div>
                      <div className="text-4xl font-bold tabular sm:text-5xl">{sc[y].valuation}</div>
                      <div className="mt-2 text-base">
                        {sc[y].valuationMath}
                        {sc.key === 'high' && y === 'y1' && <Cite ids={['aura', 'finro']} />}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {COMPS.map((c) => (
              <Stat key={c.name} value={c.value} label={`${c.name}: ${c.note}`} cite={c.cite} />
            ))}
          </div>
          <div>
            <div className="label-caps mb-3 text-sm text-muted-foreground">
              Financing path
              <Projection />
            </div>
            <ol className="divide-y divide-border rounded-2xl border border-border bg-surface">
              {[...FINANCING, { stage: 'Month 24 (High)', detail: `${VALUATION_M24.financing} at ~$140M` }].map((f) => (
                <li key={f.stage} className="p-4 sm:flex sm:gap-4">
                  <span className="font-semibold sm:w-60 sm:shrink-0">{f.stage}</span>
                  <span>{f.detail}</span>
                </li>
              ))}
            </ol>
          </div>
          <Card className="scroll-mt-20 bg-surface-2">
            <div id="assumptions" className="scroll-mt-20 label-caps text-sm text-muted-foreground">
              Assumptions (our projections, not sourced facts)
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-base">
              {ASSUMPTIONS.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Card>
        </Section>

        <Section index={8}>
          <p className="text-base text-muted-foreground">
            Numbered citations <span className="font-semibold text-amber">[n]</span> mark sourced facts. Items tagged{' '}
            <span className="font-semibold">Projection</span> are our own forecasts; see Assumptions.
          </p>
          <ol className="space-y-3 text-base">
            {CITATIONS.map((c, i) => (
              <li key={c.id} id={`src-${c.id}`} className="scroll-mt-20 flex gap-3">
                <span className="w-8 shrink-0 font-semibold text-amber tabular">[{i + 1}]</span>
                <div className="min-w-0">
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline decoration-amber underline-offset-4 break-words">
                    {c.publisher} ({c.year}): {c.label}
                  </a>
                  <div className="text-muted-foreground">{c.stat}</div>
                  <a
                    href={`#${c.usedIn}`}
                    className="inline-block py-1 text-sm text-muted-foreground underline underline-offset-4"
                    aria-label={`Back to ${SECTIONS.find((s) => s.id === c.usedIn)?.chip ?? 'section'}`}
                  >
                    ↑ Back to {SECTIONS.find((s) => s.id === c.usedIn)?.chip}
                  </a>
                </div>
              </li>
            ))}
          </ol>
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
