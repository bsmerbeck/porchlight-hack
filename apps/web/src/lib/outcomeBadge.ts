export type OutcomeTone = 'success' | 'danger' | 'neutral';

export interface OutcomeBadgeInfo {
  label: string;
  tone: OutcomeTone;
}

/**
 * Maps a D-05 `CallDoc.outcome` (`'verified' | 'scam' | 'screened' | undefined`) to the
 * DASH-02 badge language from REQUIREMENTS.md. `undefined` means the call has not ended
 * yet -- an active call, not an unlabeled outcome -- so it gets a neutral "In progress"
 * badge rather than a misleading default.
 */
export function outcomeBadge(outcome?: string): OutcomeBadgeInfo {
  switch (outcome) {
    case 'verified':
      return { label: 'Verified', tone: 'success' };
    case 'scam':
      return { label: 'Scam blocked', tone: 'danger' };
    case 'screened':
      return { label: 'Screened', tone: 'neutral' };
    default:
      return { label: 'In progress', tone: 'neutral' };
  }
}
