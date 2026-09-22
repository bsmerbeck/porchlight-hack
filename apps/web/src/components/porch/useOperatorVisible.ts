import { useCallback, useEffect, useState } from 'react';

export const OPERATOR_STORAGE_KEY = 'porchlight_operator';

function readInitial(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const op = new URLSearchParams(window.location.search).get('op');
    if (op === '1') {
      localStorage.setItem(OPERATOR_STORAGE_KEY, '1');
      return true;
    }
    if (op === '0') {
      localStorage.removeItem(OPERATOR_STORAGE_KEY);
      return false;
    }
    return localStorage.getItem(OPERATOR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * D-09 OperatorBar visibility: hidden by default; `?op=1` shows (and persists), `?op=0`
 * clears; pressing `o` three times within 1.5s toggles. Persisted in localStorage.
 * Keypresses inside inputs/textareas are ignored.
 */
export function useOperatorVisible(): [boolean, (v: boolean) => void] {
  const [visible, setVisibleState] = useState(readInitial);

  const setVisible = useCallback((v: boolean) => {
    setVisibleState(v);
    try {
      if (v) localStorage.setItem(OPERATOR_STORAGE_KEY, '1');
      else localStorage.removeItem(OPERATOR_STORAGE_KEY);
    } catch {
      /* storage unavailable -- in-memory only */
    }
  }, []);

  useEffect(() => {
    let presses: number[] = [];
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key !== 'o' && e.key !== 'O') return;
      const now = Date.now();
      presses = [...presses.filter((p) => now - p < 1500), now];
      if (presses.length >= 3) {
        presses = [];
        setVisibleState((prev) => {
          const next = !prev;
          try {
            if (next) localStorage.setItem(OPERATOR_STORAGE_KEY, '1');
            else localStorage.removeItem(OPERATOR_STORAGE_KEY);
          } catch {
            /* ignore */
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return [visible, setVisible];
}
