// 06-E: presentational screens for the /verify family phone. All protocol logic (passkey
// ceremonies, answerVerification calls, answered-call guard, countdown) stays in Verify.tsx;
// these components only render. Dark theme, phone scale (D-03: 34px question, >=72px buttons).
import { motion, useReducedMotion } from 'motion/react';
import {
  BellRing,
  Check,
  Fingerprint,
  KeyRound,
  Link2,
  Loader2,
  ShieldCheck,
  ShieldX,
  Smartphone,
  X,
} from 'lucide-react';
import { CallerCard, LampGlow, ReadyState, StatusDot } from '@/components/porch';
import { cn } from '@/lib/utils';

/** The protected person whose line this phone is guarding (single-household demo build). */
export const PROTECTED_NAME = 'Margaret';
export const VERIFY_WINDOW_SECONDS = 45;

export { memberDisplayName } from './memberName';

/** Phone shell: dark, full-height, 390px-friendly column with safe-area padding. */
export function PhoneShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="dark min-h-dvh bg-background text-foreground antialiased">
      <div
        className={cn(
          'mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-5',
          'pt-[max(env(safe-area-inset-top),16px)] pb-[max(env(safe-area-inset-bottom),20px)]',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

function TopBar({ right }: { right?: React.ReactNode }) {
  return (
    <header className="flex h-12 items-center justify-between">
      <div className="flex items-center gap-2">
        <LampGlow size={22} className="text-foreground" />
        <span className="text-[17px] font-semibold tracking-tight">Porchlight</span>
      </div>
      {right}
    </header>
  );
}

const BIG_BUTTON =
  'flex h-[76px] w-full items-center justify-center gap-3 rounded-2xl text-[22px] font-semibold ' +
  'transition-[transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-60 ' +
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/50';

// ---------------------------------------------------------------------------------------------
// Unpaired: enroll a passkey
// ---------------------------------------------------------------------------------------------

export function EnrollScreen({
  targetName,
  enrolling,
  error,
  onEnroll,
}: {
  targetName: string;
  enrolling: boolean;
  error: string | null;
  onEnroll: () => void;
}) {
  return (
    <PhoneShell>
      <TopBar />
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <LampGlow size="md" className="text-foreground" />
        <h1 className="text-[34px] leading-tight font-bold tracking-tight text-balance">
          Pair this phone with {PROTECTED_NAME}'s line
        </h1>
        <p className="max-w-[320px] text-[17px] text-muted-foreground text-balance">
          When someone calls {PROTECTED_NAME} claiming to be {targetName}, this phone confirms it's
          really you with Face ID or Touch ID.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onEnroll}
          disabled={enrolling}
          className={cn(BIG_BUTTON, 'bg-primary text-primary-foreground shadow-glow')}
        >
          {enrolling ? <Loader2 className="size-7 animate-spin" /> : <Fingerprint className="size-7" />}
          {enrolling ? 'Pairing…' : `Pair as ${targetName}`}
        </button>
        {error && (
          <p role="alert" className="text-center text-[15px] text-state-scam">
            {error}
          </p>
        )}
      </div>
    </PhoneShell>
  );
}

// ---------------------------------------------------------------------------------------------
// Before: armed idle
// ---------------------------------------------------------------------------------------------

function InfoRow({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: 'ok' | 'warn' }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted-foreground">{icon}</span>
      <span className="flex-1 text-[16px] text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 text-[16px] font-medium">
        {tone && <StatusDot tone={tone} size={8} />}
        {value}
      </span>
    </div>
  );
}

export function ArmedScreen({
  memberName,
  passkeyEnrolled,
  alertsEnabled,
  connected,
  onEnableAlerts,
}: {
  memberName: string;
  passkeyEnrolled: boolean;
  alertsEnabled: boolean;
  connected: boolean;
  onEnableAlerts: () => void;
}) {
  return (
    <PhoneShell>
      <TopBar
        right={
          <StatusDot
            tone={connected ? 'ok' : 'warn'}
            pulse={connected}
            size={8}
            label={<span className="text-[13px] text-muted-foreground">{connected ? 'Armed' : 'Connecting…'}</span>}
          />
        }
      />
      <div className="flex flex-1 flex-col items-center justify-center py-4">
        <ReadyState
          size="phone"
          lampSize="md"
          title={`Watching for calls to ${PROTECTED_NAME}`}
          subtitle={`If a caller says they're ${memberName}, you'll be asked to confirm here.`}
        />
      </div>
      <div className="flex flex-col gap-3">
        <div className="divide-y divide-border overflow-hidden rounded-2xl border bg-card shadow-soft">
          <InfoRow icon={<Smartphone className="size-[18px]" />} label="Signed in as" value={memberName} />
          <InfoRow
            icon={passkeyEnrolled ? <KeyRound className="size-[18px]" /> : <Link2 className="size-[18px]" />}
            label="Confirm with"
            value={passkeyEnrolled ? 'Passkey' : 'Secure link'}
            tone={passkeyEnrolled ? 'ok' : 'warn'}
          />
          <InfoRow
            icon={<BellRing className="size-[18px]" />}
            label="Sound & vibration"
            value={alertsEnabled ? 'On' : 'Off'}
            tone={alertsEnabled ? 'ok' : 'warn'}
          />
        </div>
        {!alertsEnabled && (
          <button type="button" onClick={onEnableAlerts} className={cn(BIG_BUTTON, 'border bg-surface-2 text-foreground')}>
            <BellRing className="size-6" /> Turn on alerts
          </button>
        )}
      </div>
    </PhoneShell>
  );
}

// ---------------------------------------------------------------------------------------------
// During: full-screen "Is this you calling?"
// ---------------------------------------------------------------------------------------------

function CountdownRing({ secondsLeft }: { secondsLeft: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, secondsLeft / VERIFY_WINDOW_SECONDS));
  const urgent = secondsLeft <= 5;
  const color = urgent ? 'var(--state-scam)' : 'var(--state-verifying)';
  return (
    <div className="relative grid size-[76px] place-items-center" aria-label={`${secondsLeft} seconds left`}>
      <svg viewBox="0 0 72 72" className="absolute inset-0 -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={5} />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 250ms linear, stroke 300ms' }}
        />
      </svg>
      <span className="tabular text-[26px] font-bold" style={{ color }}>
        {secondsLeft}
      </span>
    </div>
  );
}

export function PromptScreen({
  name,
  claimedText,
  secondsLeft,
  answering,
  answeringChoice,
  error,
  hasFallbackToken,
  onYes,
  onNo,
}: {
  name?: string;
  claimedText?: string;
  secondsLeft: number;
  answering: boolean;
  answeringChoice: 'yes' | 'no' | 'timeout' | null;
  error: string | null;
  hasFallbackToken: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="verify-question"
      initial={reduce ? false : { opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="fixed inset-0 z-50"
    >
      <PhoneShell>
        {/* Amber verifying wash behind the prompt */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 h-[55vh] animate-breathe"
          style={{
            background:
              'radial-gradient(120% 70% at 50% 0%, color-mix(in oklch, var(--state-verifying) 22%, transparent), transparent 70%)',
          }}
        />
        <div className="relative flex h-12 items-center justify-between">
          <StatusDot
            state="verifying"
            pulse
            size={10}
            label={<span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-amber">Verification request</span>}
          />
          <CountdownRing secondsLeft={secondsLeft} />
        </div>

        <div className="relative flex flex-1 flex-col justify-center gap-6 py-6">
          <div className="flex flex-col gap-3">
            <p className="text-[17px] text-muted-foreground">
              Someone is calling {PROTECTED_NAME} right now and says they're:
            </p>
            <CallerCard name={name} claimedText={claimedText} size="compact" className="bg-surface" />
          </div>
          <h1 id="verify-question" className="text-[34px] leading-[1.1] font-bold tracking-tight text-balance">
            Is this you calling?
          </h1>
        </div>

        <div className="relative flex flex-col gap-3">
          {error && (
            <p role="alert" className="text-center text-[15px] text-state-scam">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={onYes}
            disabled={answering}
            className={cn(BIG_BUTTON, 'bg-state-verified text-background')}
          >
            {answering && answeringChoice === 'yes' ? (
              <Loader2 className="size-7 animate-spin" />
            ) : (
              <Fingerprint className="size-7" />
            )}
            {answering && answeringChoice === 'yes' ? 'Confirming…' : "Yes, it's me"}
          </button>
          <button
            type="button"
            onClick={onNo}
            disabled={answering}
            className={cn(BIG_BUTTON, 'border-2 border-state-scam/70 bg-state-scam/15 text-state-scam')}
          >
            {answering && answeringChoice === 'no' ? <Loader2 className="size-7 animate-spin" /> : <X className="size-7" />}
            {answering && answeringChoice === 'no' ? 'Blocking…' : 'No, block this call'}
          </button>
          <p className="pt-1 text-center text-[13px] text-muted-foreground">
            {hasFallbackToken
              ? "Yes uses Face ID / Touch ID, with a secure link if it isn't available."
              : 'Yes uses Face ID / Touch ID.'}{' '}
            No answer in {VERIFY_WINDOW_SECONDS}s blocks the call.
          </p>
        </div>
      </PhoneShell>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------------------------
// After: result card (6s), then back to armed idle
// ---------------------------------------------------------------------------------------------

export function ResultScreen({
  verified,
  answer,
  method,
  name,
}: {
  verified: boolean;
  answer: 'yes' | 'no' | 'timeout' | null;
  method: 'passkey' | 'link' | null;
  name?: string;
}) {
  const reduce = useReducedMotion();
  const color = verified ? 'var(--state-verified)' : 'var(--state-scam)';
  const Icon = verified ? ShieldCheck : ShieldX;
  const title = verified ? 'Verified' : 'Call blocked';
  const body = verified
    ? `Thanks${name ? `, ${name}` : ''}. ${PROTECTED_NAME}'s call is going through.`
    : answer === 'timeout'
      ? `No answer in time, so Porchlight ended the call to ${PROTECTED_NAME}.`
      : answer === 'yes'
        ? `We couldn't confirm it was you, so Porchlight ended the call to ${PROTECTED_NAME}.`
        : `Porchlight ended the call and told ${PROTECTED_NAME} it was a scam.`;

  return (
    <motion.div
      role="status"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50"
    >
      <PhoneShell>
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0"
          style={{ background: `radial-gradient(90% 60% at 50% 40%, color-mix(in oklch, ${color} 26%, transparent), transparent 75%)` }}
        />
        <div className="relative flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <motion.div
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
            className="grid size-32 place-items-center rounded-full"
            style={{ color, backgroundColor: `color-mix(in oklch, ${color} 18%, transparent)`, boxShadow: `0 0 80px ${color}` }}
          >
            <Icon className="size-16" strokeWidth={2.2} />
          </motion.div>
          <div className="flex flex-col gap-2">
            <h1 className="text-[40px] leading-tight font-bold tracking-tight" style={{ color }}>
              {title}
            </h1>
            <p className="max-w-[320px] text-[18px] text-muted-foreground text-balance">{body}</p>
          </div>
          {verified && method && (
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-[13px] text-muted-foreground">
              {method === 'passkey' ? <Check className="size-4" /> : <Link2 className="size-4" />}
              {method === 'passkey' ? 'Confirmed with passkey' : 'Confirmed via secure link (passkey unavailable)'}
            </span>
          )}
        </div>
        <p className="relative text-center text-[13px] text-muted-foreground">Returning to watch mode…</p>
      </PhoneShell>
    </motion.div>
  );
}
