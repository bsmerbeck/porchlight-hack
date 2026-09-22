import { useState, type FormEvent } from 'react';
import { WaitlistPayload } from '@porchlight/shared';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [protecting, setProtecting] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const parsed = WaitlistPayload.safeParse({
      email,
      protecting: protecting || undefined,
      ref: sessionStorage.getItem('porchlight:ref') ?? 'direct',
    });

    if (!parsed.success) {
      setStatus('error');
      return;
    }

    setStatus('submitting');
    try {
      const { joinWaitlist } = await import('@/lib/firebase');
      await joinWaitlist(parsed.data);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <Card>
        <CardContent>
          <p>You're on the list — we'll email you when Porchlight is ready for your family.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join the waitlist</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === 'submitting'}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="protecting">Who are you protecting? (optional)</Label>
            <Input
              id="protecting"
              type="text"
              value={protecting}
              onChange={(e) => setProtecting(e.target.value)}
              disabled={status === 'submitting'}
            />
          </div>
          {status === 'error' && (
            <p className="text-sm text-destructive">Something went wrong — try again in a minute.</p>
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? 'Joining…' : 'Join waitlist'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
