# Porchlight — Pitch Deck

5 slides, speaker notes under each, each note timed to **60 seconds or less** (5 slides
× 60s = 5 minutes ceiling; the live demo itself is the 3-minute centerpiece inside
slide 2's runtime, so total pitch + demo should land close to 5-6 minutes — confirm
against the actual yconic slot length on the day).

Judges' rubric proxy (yconic, March 2026): Traction 30% · Innovation & AI 25% ·
Problem-solution fit 20% · Execution & demo 15% · Scalability 10%. This deck is
ordered to hit Traction and Problem-fit early and often, since together they're more
than half the score.

---

## Slide 1 — The Problem

**On slide:**

> Scammers clone a voice from under a minute of audio, call an aging parent claiming to
> be their grandchild in trouble, and walk away with thousands in gift cards before
> anyone in the family even knows the call happened.
>
> **Older Americans reported nearly $4.9 billion stolen to fraud in 2024 — up ~43% over
> 2023.** *(FBI/IC3 2024 Internet Crime Report, ic3.gov/AnnualReport/Reports/2024_IC3Report.pdf;
> figure re-verified against AARP's summary of the same report at
> aarp.org/money/scams-fraud/fbi-report-fraud-2024/ on 2026-09-22 — "Older Americans
> reported nearly $4.9 billion stolen through fraud last year... a stunning 43 percent
> more than last year." Cite the primary IC3 PDF on the slide; the AARP link is the
> verification trail, not the citation.)*

**Speaker notes (~55s):**

"Imagine your mom's phone rings. It's your kid's voice — panicked, says they're in
jail, needs bail money in gift cards right now, begs her not to tell anyone. Except
it's not your kid. It's an AI clone built from thirty seconds of a public Instagram
video. This isn't hypothetical — the FBI's own numbers say older Americans lost nearly
five billion dollars to fraud last year, up over forty percent. And the tools that make
this possible got dramatically better and cheaper in the last twelve months.

You might say: doesn't my phone already screen calls? Apple and Google screen
*strangers* — they ask 'who's calling and why' and let you decide. They cannot verify
that a caller claiming to be family actually *is* family, they have no idea a voice has
been cloned, and they give your mom zero ambient signal and your family zero shared
visibility into what almost happened. Porchlight does all three."

---

## Slide 2 — Live Demo

**On slide:**

> Cue: run the full 7-beat script now. **Do not re-describe it here** — see `DEMO.md`
> for the literal run sheet (roles, exact lines, reset, fallbacks).
>
> **Voice-clone disclosure (state this out loud before the attack call plays):**
> "The attacker's voice you're about to hear is a consented cloned voice — [name /
> 'my own', per `ATTACKER_CONSENT.md`] — cloned with explicit written and on-stage
> consent. That consent, recorded before the clone was ever created, is part of the
> story: identity verification beats voice authentication precisely because a perfect
> clone doesn't fool it."

**Speaker notes (~10s intro, then hand off to the live run):**

"Rather than tell you how it works, let's just watch it happen — live, on my
grandmother's actual phone number, to a real judge's actual phone." *(Then execute
DEMO.md's 7 beats. This slide's only job is the cue and the consent line — the demo
itself is the content.)*

---

## Slide 3 — How It Works

**On slide (architecture, judge-friendly):**

```
  Unknown call arrives
         |
         v
  [ Screener ]  <- ElevenLabs voice agent, Twilio number
   "Who's calling?"        |
         |                 v
         |          [ Claude risk scoring ]
         |           tactics: urgency, secrecy,
         |           gift cards, impersonation
         v                 |
  Caller claims family? ---+--- No -> benign? take a message : keep screening
         | Yes
         v
  [ Family Verification ]  -> real family member's phone buzzes:
   held, live risk keeps      "Are you calling Grandma right now?"
   updating on screen              |  Yes           |  No
         |                         v                v
         |                  VERIFIED, connect   SCAM, call dropped,
         |                                       family alerted w/ transcript
         v
  [ Lamp ]  <- amber idle / blue screening / green verified / red scam
   Raspberry Pi + Sense HAT, next to the phone -- no app for grandma to read
```

**Speaker notes (~50s):**

"Every unknown call gets picked up by a voice agent that asks who's calling, while
Claude scores the conversation in real time for scam tactics — urgency, secrecy,
gift-card asks, someone claiming to be family. If the caller claims to be family, we
don't take their word for it: a real family member's phone gets a one-tap prompt,
right now, while the call is still live. Yes connects the call. No drops it, marks it a
scam, and alerts the whole family with the transcript and the reasons. And the one
thing grandma actually has to look at isn't a dashboard — it's a lamp next to the
phone. Amber means idle, blue means we're checking, green means verified family, red
means we caught a scam. She never opens an app."

---

## Slide 4 — Traction

**On slide:**

> **Live waitlist signups:** pull this number as close to the pitch as possible, not
> hours earlier. Command (also documented in `README.md`):
> ```bash
> curl -s "https://firestore.googleapis.com/v1/projects/porchlight-hack/databases/(default)/documents/stats/waitlist"
> ```
> **As of 2026-09-22T15:58Z (11:58AM ET), this read: `count: 1`.** This is a placeholder
> from early in the 24h window, well before the outreach push (MORNING.md items 6-7:
> texting friends with older parents, calling RI senior centers/home-care agencies
> after 9AM) — **re-run this command immediately before printing/presenting slide 4 and
> replace this number.** Do not present this slide with a number older than a few hours.
>
> **Quotes from calls during the 24h window:**
> - [QUOTE 1 — fill in after outreach: who, relation to an aging parent, what they said]
> - [QUOTE 2 — fill in after outreach]
>
> **Pilot interest:**
> - [RI senior center / home-care agency name — fill in after calls made 1-3PM Tue per
>   PLAN.md's timeline; note whether it's a soft "yes," a "call us back," or a "no"]

**Speaker notes (~50s):**

"In the twenty-four hours since this started, we put up a landing page, posted it
everywhere we could reach adult children of aging parents, and started calling Rhode
Island senior centers and home-care agencies. [State the live signup count out loud —
pulled right before this slide, not memorized from this morning.] [State the strongest
quote gathered, if any.] [State pilot interest gathered, if any — even a warm 'call us
back' from a local agency is a real signal this problem is felt, not assumed.] This is
twenty-four hours of a solo builder reaching real people with real aging parents — not
a survey, not a focus group."

---

## Slide 5 — Market + What's Next

**On slide:**

> **Market:** ~$15-25/mo per protected phone (consumer subscription), lamp hardware at
> cost; B2B2C channel through home-care agencies and senior-living operators. YC Fall
> 2026 RFS fit: "Proving You're Human" + "AI for the Aging Population."
>
> **What's next:** true call-bridging for known callers, SMS/carrier-independent
> verification once A2P 10DLC registration clears, a real senior-center pilot in Rhode
> Island, and a hardware lamp that ships instead of a Pi on a breadboard.
>
> **Ask:** join the waitlist right now — scan the QR below, or go to
> `https://porchlight-hack.web.app?ref=qr`. If you know someone protecting an aging
> parent, this is for them.
>
> `[QR CODE PLACEHOLDER — generate from https://porchlight-hack.web.app?ref=qr and
> place it here before printing/presenting; also print a standalone QR sheet per
> MORNING.md item 6]`

**Speaker notes (~50s):**

"This isn't a subscription for grandma to manage — it's one her kids pay for, because
they're the ones who lie awake worrying about this call. Consumer subscription today,
senior-living and home-care partnerships as the channel that scales it. What's next:
real call-bridging instead of a goodbye-and-hang-up, carrier-grade verification once
the SMS registration clears, and an actual pilot with a Rhode Island senior center. But
right now, tonight, the ask is simple: scan this QR, join the waitlist. If everyone in
this room who has an aging parent signs up right now, that's real traction before you
even leave your seat."

---

**Feature freeze:** not yet declared — the builder adds the exact timestamp here at
5PM Tue 2026-09-22, after which no further code changes go into this repo before the
9PM demo (see `DEMO.md`'s "5PM Freeze Checklist" for the steps to run first).
