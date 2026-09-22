import { Phone, UserCheck, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

/** "+14014979735" -> "+1 (401) 497-9735"; anything else is returned unchanged. */
export function formatPhone(from?: string): string {
  if (!from) return '';
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(from.replace(/[^\d+]/g, ''));
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : from;
}

export interface CallerCardProps {
  /** Resolved display name (e.g. `verification.name` or `risk.claimedIdentity`). Falls back to "Unknown caller". */
  name?: string;
  /** Raw ASR claim (`verification.claimedText`); shown as "Says: ..." only when it differs from `name`. */
  claimedText?: string;
  /** Caller ID in E.164; formatted for display. */
  from?: string;
  /** Allowlisted/known caller -> green "Known caller" badge. */
  known?: boolean;
  /** 'stage' = projector scale (default), 'compact' = cards/phone. */
  size?: 'stage' | 'compact';
  className?: string;
}

/** Who is calling: avatar, name, what they claim, formatted number, known-caller badge. */
export function CallerCard({ name, claimedText, from, known, size = 'stage', className }: CallerCardProps) {
  const stage = size === 'stage';
  const display = name?.trim() || 'Unknown caller';
  const showClaim = !!claimedText && claimedText.trim().toLowerCase() !== name?.trim().toLowerCase();
  const Avatar = known ? UserCheck : UserRound;
  const tint = known ? 'var(--state-known)' : 'var(--amber)';

  return (
    <div
      className={cn(
        'flex items-center rounded-3xl border bg-card text-card-foreground shadow-soft',
        stage ? 'gap-6 p-6' : 'gap-3 p-3.5',
        className,
      )}
    >
      <div
        className={cn('grid shrink-0 place-items-center rounded-full', stage ? 'size-24' : 'size-12')}
        style={{ color: tint, backgroundColor: `color-mix(in oklch, ${tint} 16%, transparent)` }}
      >
        <Avatar size={stage ? 48 : 24} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={cn('truncate font-bold', stage ? 'text-[44px] leading-tight' : 'text-lg')}>{display}</span>
          {known && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full font-semibold uppercase tracking-[0.12em]',
                stage ? 'px-3 py-1 text-[16px]' : 'px-2 py-0.5 text-[10px]',
              )}
              style={{
                color: 'var(--state-known)',
                backgroundColor: 'color-mix(in oklch, var(--state-known) 15%, transparent)',
              }}
            >
              <UserCheck size={stage ? 16 : 12} /> Known caller
            </span>
          )}
        </div>
        {showClaim && (
          <div className={cn('text-muted-foreground', stage ? 'text-[22px]' : 'text-sm')}>
            Says: <span className="font-medium text-foreground/90">"{claimedText}"</span>
          </div>
        )}
        {from && (
          <div className={cn('tabular flex items-center gap-1.5 text-muted-foreground', stage ? 'text-[22px]' : 'text-sm')}>
            <Phone size={stage ? 18 : 13} /> {formatPhone(from)}
          </div>
        )}
      </div>
    </div>
  );
}
