# Attacker Voice Clone — Consent Record

**Whose voice:** Brenden Smerbeck (the builder of this project).

**Date:** 2026-09-22.

## Consent statement

I, Brenden Smerbeck, consent to ElevenLabs creating an Instant Voice Clone of my own
voice for the sole purpose of powering Porchlight's "Attacker" demo agent. This clone is
used exclusively to place outbound test calls to the Porchlight demo household's own
phone number (+14015861988) during rehearsal and the live hackathon pitch. It is not
used to impersonate me (or anyone else) to any third party, is not distributed, and is
not used for any purpose beyond this demonstration.

The ~60-second voice sample submitted to ElevenLabs to create the clone opens with this
consent statement spoken aloud by me, so the consent is captured on the recording
itself, before any clone exists from it — not backfilled after the fact.

## On-stage disclosure line

To be spoken during the pitch, before or immediately after the attack call plays:

> "The attacker's voice you just heard is my own, cloned with my consent — here's why
> that's the point."

## Scope and limits

- The cloned voice is bound to a single ElevenLabs conversational agent ("Attacker")
  used only by `attackCall` (see `functions/src/attack/attackCall.ts`), which can only
  ever dial the hardcoded Porchlight demo number.
- No other person's voice has been cloned for this project. Per this project's
  constraints (`.claude/CLAUDE.md`, Ethics/consent), a voice clone of anyone other than
  the builder or a judge who consents on stage is out of scope.

## Deviation note

This file documents consent for a voice clone and Attacker agent that were created as
part of this plan's Task 2 human checkpoint, completed prior to this execution pass. The
underlying consent — the spoken statement at the start of the cloned voice sample —
predates the clone's creation as required; this written record was filed as part of
completing Task 1's code and Task 2's paper trail together in the same pass.
