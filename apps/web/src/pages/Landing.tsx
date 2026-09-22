import { Lamp } from '@/components/Lamp';
import { WaitlistForm } from '@/components/WaitlistForm';
import { LiveCounter } from '@/components/LiveCounter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function Landing() {
  return (
    <div className="mx-auto max-w-3xl px-5">
      {/* Hero */}
      <section className="flex flex-col items-center gap-8 py-12 text-center md:flex-row md:gap-12 md:py-20 md:text-left">
        <div className="flex flex-col items-center gap-4 md:items-start">
          <Badge variant="secondary">Built in 24h — live demo Tue 9PM</Badge>
          <h1 className="text-4xl font-bold text-balance md:text-6xl">
            Porchlight — a guardian for your parent's phone.
          </h1>
          <p className="text-lg text-muted-foreground">
            An AI answers unknown calls, catches scams and cloned voices live, verifies real
            family with one tap, and turns a lamp beside the phone red or green — so your parent
            never has to read an app.
          </p>
          <Button asChild size="lg">
            <a href="#waitlist">Join the waitlist</a>
          </Button>
        </div>
        <Lamp />
      </section>

      {/* Problem */}
      <section id="problem" className="py-12 md:py-16">
        {/* TODO(human): verify IC3 figure */}
        <p className="text-lg">
          In 2024, Americans over 60 reported an estimated $4.9 billion in losses to scams and
          fraud (FBI IC3 — verify). Voice cloning that convincingly fakes "Grandma, it's me" now
          takes less than a minute of audio to pull off.
        </p>
      </section>

      {/* How it works */}
      <section id="how" className="py-12 md:py-16">
        <h2 className="mb-6 text-2xl font-semibold md:text-3xl">How it works</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <Badge>1</Badge>
              <CardTitle>Screens</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Unknown callers talk to Porchlight first — never straight to your parent.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Badge>2</Badge>
              <CardTitle>Verifies family</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                A real family member gets a prompt on their own phone and taps Yes or No.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Badge>3</Badge>
              <CardTitle>Lights the lamp</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Green for family, red for scam — no screen for your parent to read.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Waitlist */}
      <section id="waitlist" className="py-12 md:py-16">
        <h2 className="mb-6 text-center text-2xl font-semibold md:text-3xl">
          Protect someone you love
        </h2>
        <div className="mx-auto flex max-w-md flex-col items-center gap-4">
          <WaitlistForm />
          <LiveCounter />
          <p className="text-center text-sm text-muted-foreground">
            No spam. We'll email once when Porchlight is ready for your family.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>Built in 24h at RI Startup Week</p>
        <p>Providence, 2026</p>
      </footer>
    </div>
  );
}
