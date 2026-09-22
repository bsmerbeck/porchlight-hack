// 'info' (05-ALLOWLIST): a distinct blue tone for the "Message taken" outcome, which is
// neither a success verdict (green) nor a danger verdict (red) -- it's neutral-but-
// notable information the family should read.
export type OutcomeTone = 'success' | 'danger' | 'neutral' | 'info';

export interface OutcomeBadgeInfo {
  label: string;
  tone: OutcomeTone;
}

/**
 * Maps a D-05 `CallDoc.outcome` (`'verified' | 'scam' | 'screened' | 'known' | 'message'
 * | undefined`) to the DASH-02 badge language from REQUIREMENTS.md. `undefined` means the
 * call has not ended yet -- an active call, not an unlabeled outcome -- so it gets a
 * neutral "In progress" badge rather than a misleading default.
 */
export function outcomeBadge(outcome?: string): OutcomeBadgeInfo {
  switch (outcome) {
    case 'verified':
      return { label: 'Verified', tone: 'success' };
    // 05-ALLOWLIST: an allowlisted caller_id skipped screening entirely -- distinct
    // language from a family-member 'verified' verdict, same green tone.
    case 'known':
      return { label: 'Known caller', tone: 'success' };
    case 'scam':
      return { label: 'Scam blocked', tone: 'danger' };
    // 05-ALLOWLIST: a benign unknown caller who left a message instead of being held for
    // verification or ended as a scam.
    case 'message':
      return { label: 'Message taken', tone: 'info' };
    case 'screened':
      return { label: 'Screened', tone: 'neutral' };
    default:
      return { label: 'In progress', tone: 'neutral' };
  }
}
