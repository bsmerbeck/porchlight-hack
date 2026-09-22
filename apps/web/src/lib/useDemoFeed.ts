import { useEffect, useState } from 'react';
import type { CallDoc } from '@porchlight/shared';

/**
 * 06-F: shared realtime readers for /app and /sim. Firebase is dynamically imported inside
 * each effect (Phase 1 lazy-Firebase convention) so importing this module never pulls the
 * Firebase SDK into the landing page's main chunk.
 */

export type FeedCall = CallDoc & { id: string; updatedAt?: number };

/** Live `households/demo/feed` (public mirror), newest first. `null` while loading. */
export function useDemoFeed(): { calls: FeedCall[] | null; error: string | null } {
  const [calls, setCalls] = useState<FeedCall[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const [{ db }, { collection, query, orderBy, onSnapshot }] = await Promise.all([
        import('@/lib/firebase'),
        import('firebase/firestore'),
      ]);
      if (cancelled) return;
      unsubscribe = onSnapshot(
        query(collection(db, 'households/demo/feed'), orderBy('startedAt', 'desc')),
        (snap) => {
          setError(null);
          setCalls(snap.docs.map((d) => ({ id: d.id, ...(d.data() as CallDoc) })));
        },
        (err) => {
          console.error('useDemoFeed: feed onSnapshot failed', err);
          setError('Could not load the call feed.');
        },
      );
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return { calls, error };
}

export interface FamilyAlert {
  id: string;
  type?: string;
  source?: string;
  createdAt: number;
}

function toMillis(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

/**
 * `households/demo/alerts` (W7 joystick "call my family"), newest first. If the rules deny
 * client reads, `available` flips false and the UI simply hides the section.
 */
export function useDemoAlerts(): { alerts: FamilyAlert[]; available: boolean } {
  const [alerts, setAlerts] = useState<FamilyAlert[]>([]);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const [{ db }, { collection, onSnapshot }] = await Promise.all([
        import('@/lib/firebase'),
        import('firebase/firestore'),
      ]);
      if (cancelled) return;
      unsubscribe = onSnapshot(
        collection(db, 'households/demo/alerts'),
        (snap) => {
          setAvailable(true);
          setAlerts(
            snap.docs
              .map((d) => {
                const data = d.data() as { type?: string; source?: string; createdAt?: unknown };
                return { id: d.id, type: data.type, source: data.source, createdAt: toMillis(data.createdAt) };
              })
              .sort((a, b) => b.createdAt - a.createdAt),
          );
        },
        (err) => {
          console.warn('useDemoAlerts: alerts not readable (rules?)', err.code ?? err);
          setAvailable(false);
        },
      );
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return { alerts, available };
}

/** D-12 `status/bridge` heartbeat doc for the OperatorBar status row. */
export interface BridgeStatus {
  piOk?: boolean;
  hueReachable?: number;
  hueTotal?: number;
  lastBeat?: number;
}

export function useBridgeStatus(): BridgeStatus | null {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const [{ db }, { doc, onSnapshot }] = await Promise.all([
        import('@/lib/firebase'),
        import('firebase/firestore'),
      ]);
      if (cancelled) return;
      unsubscribe = onSnapshot(
        doc(db, 'status/bridge'),
        (snap) => setStatus((snap.data() as BridgeStatus | undefined) ?? null),
        (err) => console.warn('useBridgeStatus: status/bridge unreadable', err.code ?? err),
      );
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);
  return status;
}

/** 1s clock tick so deriveStageState's 20s result hold expires on its own. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
