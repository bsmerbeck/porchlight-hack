import type { ComponentType } from 'react';
import {
  ArrowRight,
  AudioWaveform,
  Lamp as LampIcon,
  Lock,
  PhoneIncoming,
  ShieldCheck,
  Smartphone,
  Users,
} from 'lucide-react';
import { WaitlistForm } from '@/components/WaitlistForm';
import { LiveCounter } from '@/components/LiveCounter';
import { Button } from '@/components/ui/button';
import { LampGlow, STATE_VISUALS, type StateKey } from '@/components/porch';
import { HeroLamp } from './landing/HeroLamp';
import { Reveal } from './landing/Reveal';

interface Step {
  n: number;
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
  state: StateKey;
}

const STEPS: Step[] = [
  {
    n: 1,
    icon: PhoneIncoming,
    title: 'Porchlight answers first',
    body: 'Unknown callers talk to a calm AI screener, never straight to your parent. It listens for urgency, secrecy, gift cards and bail.',
    state: 'screening',
  },
  {
    n: 2,
    icon: Smartphone,
    title: 'Family confirms in one tap',
    body: 'Claims to be your son? Your son gets a prompt on his own phone: "Is this really you?" Yes or No, secured with a passkey.',
    state: 'verifying',
  },
  {
    n: 3,
    icon: LampIcon,
    title: 'The lamp tells Mom',
    body: 'A lamp beside the phone glows green for real family and red for a scam. There is no app for her to read.',
    state: 'verified',
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <LampGlow size={22} className="text-foreground" />
            Porchlight
          </a>
          <Button asChild size="sm">
            <a href="#waitlist">Join waitlist</a>
          </Button>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[520px] bg-[radial-gradient(ellipse_at_top,var(--primary)_0%,transparent_60%)] opacity-20"
          />
          <div className="relative mx-auto grid max-w-5xl items-center gap-10 px-5 pt-10 pb-16 md:grid-cols-[1.15fr_1fr] md:pt-20 md:pb-24">
            <Reveal className="flex flex-col items-center gap-5 text-center md:items-start md:text-left">
              <span className="inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft">
                <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
                For families of aging parents
              </span>
              <h1 className="text-4xl leading-[1.05] font-bold tracking-tight text-balance md:text-6xl">
                A cloned voice can fool Mom. It can&apos;t fool her family.
              </h1>
              <p className="max-w-xl text-lg text-pretty text-muted-foreground">
                Porchlight answers unknown calls to your parent&apos;s phone, checks with real
                family in one tap, and lights a lamp beside the phone: green when it&apos;s safe,
                red when it&apos;s a scam.
              </p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button asChild size="lg" className="h-12 px-6 text-base shadow-glow">
                  <a href="#waitlist">
                    Join the waitlist <ArrowRight className="size-4" aria-hidden="true" />
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
                  <a href="#how">See how it works</a>
                </Button>
              </div>
            </Reveal>
            <Reveal delay={0.1} className="flex justify-center">
              <HeroLamp />
            </Reveal>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16 border-y border-border/60 bg-surface-2/60 py-16 md:py-24">
          <div className="mx-auto max-w-5xl px-5">
            <Reveal className="mb-10 max-w-2xl">
              <p className="text-sm font-semibold tracking-wide text-primary uppercase">
                How it works
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-balance md:text-4xl">
                Screen. Ask family. Light the lamp.
              </h2>
            </Reveal>
            <ol className="grid gap-4 md:grid-cols-3">
              {STEPS.map((s, idx) => (
                <li key={s.n}>
                  <Reveal delay={idx * 0.08} className="h-full">
                    <div className="flex h-full flex-col gap-4 rounded-2xl border bg-surface p-6 shadow-soft">
                      <div className="flex items-center justify-between">
                        <span
                          className="flex size-11 items-center justify-center rounded-xl"
                          style={{
                            backgroundColor: `color-mix(in oklch, ${STATE_VISUALS[s.state].colorVar} 18%, transparent)`,
                            color: STATE_VISUALS[s.state].colorVar,
                          }}
                        >
                          <s.icon className="size-5" />
                        </span>
                        <span className="text-sm font-semibold text-muted-foreground tabular-nums">
                          0{s.n}
                        </span>
                      </div>
                      <h3 className="text-xl font-semibold tracking-tight">{s.title}</h3>
                      <p className="text-muted-foreground">{s.body}</p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Why now */}
        <section id="why" className="py-16 md:py-24">
          <div className="mx-auto grid max-w-5xl items-center gap-10 px-5 md:grid-cols-2">
            <Reveal>
              <p className="text-sm font-semibold tracking-wide text-primary uppercase">Why now</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-balance md:text-4xl">
                Voice cloning made the &ldquo;grandparent scam&rdquo; nearly perfect.
              </h2>
              <p className="mt-4 text-lg text-pretty text-muted-foreground">
                A scammer needs under a minute of audio from a public video to sound exactly like
                your kid: panicked, in jail, begging for bail in gift cards and asking Grandma not to
                tell anyone. Phone screening apps check strangers. They can&apos;t tell whether
                &ldquo;your grandson&rdquo; is really him.
              </p>
            </Reveal>
            <Reveal delay={0.1} className="grid gap-4 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              <div className="rounded-2xl border bg-surface p-6 shadow-soft">
                <p className="text-5xl font-bold tracking-tight tabular-nums">$4.9B</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  reported stolen from Americans over 60 by fraud in 2024
                </p>
              </div>
              <div className="rounded-2xl border bg-surface p-6 shadow-soft">
                <p className="text-5xl font-bold tracking-tight tabular-nums">+43%</p>
                <p className="mt-2 text-sm text-muted-foreground">more than the year before</p>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border bg-surface p-6 shadow-soft sm:col-span-2 md:col-span-1 lg:col-span-2">
                <AudioWaveform className="mt-0.5 size-5 shrink-0 text-state-scam" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Under 60 seconds</span> of audio
                  is enough to clone a voice.
                </p>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2 md:col-span-1 lg:col-span-2">
                Source: FBI IC3 2024 Internet Crime Report (Elder Fraud).
              </p>
            </Reveal>
          </div>
        </section>

        {/* Trust */}
        <section className="pb-16 md:pb-24">
          <Reveal className="mx-auto max-w-5xl px-5">
            <div className="grid gap-6 rounded-2xl border bg-surface p-6 shadow-soft md:grid-cols-3 md:p-8">
              <div className="flex items-start gap-3">
                <Lock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Private by default.</span> Only
                  the family members you add ever see what happened on a call.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Passkey-verified family.</span>{' '}
                  A cloned voice can&apos;t tap Yes on your phone.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Known callers ring through.</span>{' '}
                  The people Mom already trusts are never screened.
                </p>
              </div>
            </div>
          </Reveal>
        </section>

        {/* Waitlist */}
        <section
          id="waitlist"
          className="scroll-mt-16 border-t border-border/60 bg-surface-2/60 py-16 md:py-24"
        >
          <div className="mx-auto grid max-w-5xl items-center gap-10 px-5 md:grid-cols-2">
            <Reveal className="flex flex-col items-center gap-4 text-center md:items-start md:text-left">
              <p className="text-sm font-semibold tracking-wide text-primary uppercase">
                Early access
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-balance md:text-4xl">
                Protect someone you love.
              </h2>
              <p className="text-lg text-muted-foreground">
                Join the families lining up for Porchlight. We&apos;ll email once, when it&apos;s
                ready for yours.
              </p>
              <div className="flex items-center gap-3">
                <span className="relative flex size-2.5" aria-hidden="true">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-state-verified opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-state-verified" />
                </span>
                <LiveCounter />
              </div>
            </Reveal>
            <Reveal delay={0.1} className="w-full">
              <div className="mx-auto w-full max-w-md [&_[data-slot=card]]:rounded-2xl [&_[data-slot=card]]:p-2 [&_[data-slot=card]]:shadow-lift [&_button[type=submit]]:h-12 [&_button[type=submit]]:w-full [&_button[type=submit]]:text-base [&_input]:h-11 [&_input]:text-base">
                <WaitlistForm />
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                No spam. No selling your data. Unsubscribe any time.
              </p>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-5 text-sm text-muted-foreground sm:flex-row">
          <p className="flex items-center gap-2">
            <LampGlow size={18} className="text-foreground" />
            <span className="font-medium text-foreground">Porchlight</span>
          </p>
          <p>Built in 24 hours at RI Startup Week, Providence 2026</p>
        </div>
      </footer>
    </div>
  );
}
