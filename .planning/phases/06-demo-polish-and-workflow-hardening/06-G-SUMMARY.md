---
phase: 06-demo-polish-and-workflow-hardening
plan: G
subsystem: web/landing
tags: [landing, waitlist, motion, polish]
status: complete
key-files:
  created:
    - apps/web/src/pages/landing/HeroLamp.tsx
    - apps/web/src/pages/landing/Reveal.tsx
  modified:
    - apps/web/src/pages/Landing.tsx
commits: 1
---

# Phase 6 Plan G: Landing Page Summary

Rebuilt `/` as a light "porch light at dusk" startup landing page. It has a sticky nav, a hero with the promise "A cloned voice can fool Mom. It can't fool her family.", and an animated LampGlow that plays one scam call (watching, screening, asking family, scam blocked). Below the hero are three how-it-works cards tinted with the D-02 state colours, a "why now" block (IC3 2024: $4.9B, +43%, clones from under 60s of audio), a trust row (private, passkey-verified family, known callers ring through) and the waitlist.

## Waitlist / counter / ref: preserved
- `WaitlistForm` and `LiveCounter` are reused unmodified. Only descendant utility classes on a wrapper change their look (taller inputs, full-width submit).
- `?ref=` capture still runs in `main.tsx` via `captureRef()` (`sessionStorage['porchlight:ref']`). Not touched.
- `#waitlist` anchor kept (nav and hero CTAs link to it).

## Motion
`Reveal` (whileInView fade/rise, 400ms) and the HeroLamp beat cycle both switch off under `prefers-reduced-motion`. The lamp then shows a steady idle. LampGlow handles its own reduced motion.

## Deviations
- The old "live demo Tue 9PM" badge is gone (the demo moved to 5PM). The footer now says "Built in 24 hours at RI Startup Week".
- No porch component changes. The old `components/Lamp.tsx` is no longer used by Landing but was left in place.

## Verification
typecheck pass, test 37/37 pass, build pass. Checked visually with headless Chrome at 1400px and 500px (mobile layout wraps correctly).

## Self-Check: PASSED
