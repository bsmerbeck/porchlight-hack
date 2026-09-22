import { useEffect, useState } from 'react';

export function LiveCounter() {
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    let unsub = () => {};
    import('@/lib/firebase').then(({ watchWaitlistCount }) => {
      unsub = watchWaitlistCount(setN);
    });
    return () => unsub();
  }, []);

  return <p className="text-3xl font-semibold tabular-nums">{n ?? '…'} families on the waitlist</p>;
}
