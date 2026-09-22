# Porchlight

## What This Is

Porchlight is a guardian for an aging parent's phone. An AI assistant answers unknown calls, detects scam scripts and cloned voices in real time, verifies real family members with one tap, and turns a lamp beside the phone red (scam) or green (verified family) so the senior never has to read an app. The family sees every screened call, transcript, and risk reason in a shared dashboard.

This repo is the 24-hour hackathon build for the yconic hackathon at RI Startup Week (Providence). The build is scoped to exactly what the 3-minute live demo needs, plus a landing page that collects real signups during the event.

## Core Value

A scam call claiming to be family gets caught live on stage: the AI screens it, the real family member taps "No, that's not me", and the lamp turns red. If everything else fails, that one loop must work.

## Business Context

- **Customer**: Adult children (35-60) paying to protect an aging parent; later home-care agencies and senior-living operators as a channel.
- **Revenue model**: Consumer subscription (~$15-25/mo per protected phone, lamp hardware sold at cost); B2B2C pilots with RI home-care agencies.
- **Success metric**: For the hackathon — waitlist signups and customer conversations gathered inside the 24h window, shown on the final slide. Judges' proxy rubric (yconic, March 2026): Traction 30%, Innovation & AI 25%, Problem-solution fit 20%, Execution & demo 15%, Scalability 10%.
- **Strategy notes**: `../PLAN.md` (strategy, demo script, timeline, fallbacks). YC Fall 2026 RFS alignment: "Proving You're Human" + "AI for the Aging Population".

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Landing page with waitlist signup and a live signup counter, deployed publicly tonight
- [ ] A real phone number that, when called, is answered by the Porchlight AI screener ("Hi, this is Margaret's assistant, who's calling?")
- [ ] Live transcript of the screened call visible on the family dashboard while the call is in progress
- [ ] Real-time scam risk scoring by Claude with named tactics (urgency, secrecy, gift cards/wire, bail, impersonation) and a risk meter
- [ ] When the caller claims to be a family member, that family member's phone gets a prompt: "Are you calling Grandma right now?" with Yes / No
- [ ] "No" → call is dropped, marked SCAM, family alerted with transcript and reasons
- [ ] "Yes" (passkey-backed) → call marked VERIFIED and allowed through
- [ ] Raspberry Pi + Sense HAT lamp shows call state: amber idle, blue screening, green verified with scrolling name, red flashing scam
- [ ] Attack simulator: an AI caller using a consented cloned voice that runs the "grandchild in jail" script against the Porchlight number
- [ ] Call history with post-call family report (what happened, why it was flagged)
- [ ] Demo hardening: scripted reset between runs, offline/hotspot fallback, recorded backup video
- [ ] Pitch assets: 5 slides, traction numbers, quotes from customer calls

### Out of Scope

- Native mobile apps — web app on the judge's phone is enough for the demo
- Carrier-level call forwarding / number porting for real seniors — demo uses a dedicated Porchlight number and a prop phone
- Acoustic deepfake detection (audio forensics model) — not buildable or provable in 24h; Porchlight's claim is *identity verification of the claimed person*, which defeats a perfect clone anyway
- Billing, multi-tenant accounts, roles — single demo household
- Jetson Nano — JetPack setup is a multi-hour sink with no demo payoff
- Flipper Zero — no honest role in the product
- SMS as the primary verification channel — US A2P 10DLC registration takes days; unregistered traffic gets blocked (see Key Decisions)
- Cloning anyone's voice without explicit on-stage consent — own voice by default

## Context

- **Event**: yconic hackathon, RI Startup Week, Providence. 24h "coolest product" track: prizes $5k/$3k/$2k. Started ~8PM Mon 2026-09-21. **Demo 9PM Tue 2026-09-22. Feature freeze 5PM Tue.** A separate 4-month traction track exists; that is grandfinals.gg, not this repo.
- **Field**: 5-6 teams. Strongest rivals: an existing agentic property demolition/rebuild optimizer, and a free-tier ERP for nonprofits. Both demo on a screen. Porchlight wins by having judges take part: their phone buzzes, a lamp changes color, a real call happens.
- **Builder**: solo developer, strongest stack is TypeScript / React 19 / Vite / Tailwind v4 / shadcn / Firebase (same as grandfinals.gg). Embedded background (Jetson/Pi DAQ in C and Python).
- **Dev machine**: macOS, node 24, pnpm 11, firebase CLI 15 (logged in as bsmerbeck@gmail.com), gcloud, uv, python 3.14. Twilio CLI not installed (not required).
- **Accounts (2026-09-21 23:45)**: Firebase project `porchlight-hack` (Blaze, Firestore nam5, web app registered, `ANTHROPIC_API_KEY` secret set). Twilio upgraded ($20), voice number **+14015861988** (West Warwick RI). ElevenLabs Creator: agent "PorchLight screener" (voice Sarah, first message set, default LLM until Phase 2 Custom LLM), Twilio number imported + assigned; live test call 2026-09-22 00:15 confirmed greeting + multi-turn. `ELEVENLABS_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` secrets set. Originally: Anthropic API key exists. Twilio, ElevenLabs, and a Firebase project must be created in Phase 1 — user does signup/payment steps; keys go in `.env.local` / Functions secrets, never in git.
- **Demo network (2026-09-22 AM)**: Mac dongle → ethernet switch → Pi + Philips Hue Bridge; Mac Internet Sharing (Wi-Fi → USB LAN) makes the Mac 192.168.2.1 with DHCP; Pi to be moved to 192.168.2.10; Hue Bridge on DHCP, controlled via its local REST API from the Mac bridge. Attack simulator: second Twilio number +14014027950 imported to ElevenLabs as 'Attacker line' (phnum_8001m34xt3cafm8thjxmeawscq5t), agent 'Attacker' with the Brenden voice clone. Allowlist demo entry: +14014979735 Brenden Smerbeck (grandson).
- **Pi (original)**: Raspberry Pi 4 + Sense HAT, booted, direct ethernet to the Mac's USB-C dongle (`en8`). Link-local only: Pi = `raspberrypi.local` / `169.254.59.28`, Mac = `169.254.208.0`. SSH port 22 open, banner `OpenSSH_8.4p1 Raspbian-5+b1` → Raspbian 11 (Bullseye), so Python 3.9 and likely the legacy `pi` user. Username/password not yet confirmed; SSH key not yet installed. **The Pi has no internet over this link.**
- **Voice stack (to be confirmed by Phase research)**: Twilio number imported into ElevenLabs Agents. Two candidate ways to get per-turn transcript in real time: (a) ElevenLabs "custom LLM" pointed at our own OpenAI-compatible endpoint that proxies to Claude and writes each turn to Firestore, or (b) agent server-tool webhooks each turn. Post-call webhook delivers the final transcript either way. Vapi/Retell are the fallback platform.
- **Problem data (verify before slides)**: FBI IC3 2024 — ~$4.9B lost by people 60+, up ~43% YoY. Voice cloning needs under a minute of audio.
- **Competitive answer**: Apple/Google call screening screens strangers; it cannot verify *family*, does not address cloned voices of known people, gives seniors no ambient signal, and gives the family no shared view.

## Constraints

- **Timeline**: Demo 9PM Tue 2026-09-22; feature freeze 5PM; sleep 2-7AM is non-negotiable — a solo builder has to pitch well at hour 25.
- **Scope**: The demo script in `../PLAN.md` is the spec. Anything not visible in the 3-minute demo or on the traction slide is out.
- **Tech stack**: TypeScript + React 19 + Vite + Tailwind v4 + shadcn + Firebase (Firestore, Functions v2, Hosting) — fastest stack for this builder. Python 3.9-compatible code on the Pi, standard library + preinstalled `sense_hat` only (Pi cannot `pip install` without internet).
- **Models**: `claude-haiku-4-5` for in-call risk scoring (latency), `claude-sonnet-5` for the post-call family report.
- **Network**: Demo must survive bad venue Wi-Fi — Mac on phone hotspot as fallback; lamp is driven from the Mac over the ethernet cable, never over Wi-Fi.
- **Security**: API keys only in untracked env files / Firebase secrets. Twilio webhooks validated. No real senior's data; demo household only.
- **Ethics/consent**: Voice clone only of the builder or a judge who consents on stage; say so in the pitch.
- **Budget**: Small — Twilio upgrade (~$20, removes trial-call announcement), ElevenLabs Starter/Creator, Firebase Blaze (pennies at this volume), Claude API.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| New project (Porchlight) for the 24h track; grandfinals.gg reserved for the 4-month traction track | Max demo wow + double YC RFS fit vs. a niche analytics dashboard | — Pending |
| Demo script is the spec | 24h solo build; every hour must show up on stage | — Pending |
| ElevenLabs Agents + Twilio for the voice screener, 90-min timebox, Vapi/Retell fallback | Hosted voice agent avoids building STT/TTS/turn-taking; same vendor provides the consented voice clone | — Pending |
| Firebase as realtime backbone; one `calls/{id}` doc drives dashboard, verification prompt, and lamp | Builder knows it cold; realtime listeners for free | — Pending |
| Family verification prompt is an in-app realtime prompt (Firestore listener, full-screen modal) secured by a WebAuthn passkey; SMS is optional garnish only | US A2P 10DLC registration takes days, so SMS from a fresh number is unreliable; in-app prompt has zero carrier dependence. 2h timebox on WebAuthn → fallback to signed-link tap | — Pending |
| Lamp is driven by a Mac-side bridge (Firestore listener → HTTP POST to the Pi over ethernet); Pi runs a tiny stdlib HTTP server | Pi has no internet on the link-local cable; removes venue Wi-Fi as a failure point | — Pending |
| Upgrade Twilio out of trial before the demo | Trial accounts prepend a spoken trial notice to calls, which would wreck the demo | — Pending |
| Landing page + waitlist ships first, tonight | Traction is ~30% of the rubric and signups need hours to accrue | — Pending |
| Skip Jetson and Flipper | Setup cost with no demo payoff | — Pending |
| GSD: YOLO, coarse, parallel, per-phase research on, plan-check/verifier off, Vertical MVP | Hackathon speed; API specifics still deserve research | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-21 after initialization*
