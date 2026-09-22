# Roadmap: Porchlight

## Overview

Porchlight is a 24-hour solo hackathon build (yconic, RI Startup Week). Demo is 9PM Tue 2026-09-22, feature freeze 5PM, sleep 2-7AM is non-negotiable. The roadmap is ordered by wall clock, not architecture: the landing page ships first so waitlist signups accrue for ~20 hours; the call → transcript → Claude risk loop is the highest technical risk and goes next with a browser simulator as its fallback; the lamp runs in parallel on the ethernet-tethered Pi; family verification and the dashboard fill Tuesday morning and complete the core value (judge taps "No", lamp turns red); the cloned-voice attacker, post-call report, demo hardening, and pitch close it out. Every phase ends in something demoable on its own.

**Target windows (Eastern):** Phase 1 Mon 8:30-10PM · Phase 2 Mon 10PM-2AM · Phase 3 Mon ~1-2AM (parallel with Phase 2) · sleep 2-7AM · Phase 4 Tue 7-11AM · Phase 5 Tue 11AM-8PM (feature freeze 5PM, pitch prep 5-8PM).

**Human actions** are called out per phase. They are checkpoints the builder performs by hand (account signups, payments, consent recording, customer calls, posting), not tasks to automate.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation and Landing Page Live** - Monorepo deploys with one command; public landing page collects attributed waitlist signups with a live counter (Mon 8:30-10PM)
- [ ] **Phase 2: Core Screening Loop** - Calling the Porchlight number reaches the AI screener; each turn streams to the call doc with a live Claude risk score; browser simulator drives the same pipeline (Mon 10PM-2AM)
- [ ] **Phase 3: Lamp** - Pi + Sense HAT mirrors call state within ~1s over the ethernet cable via a Mac-side bridge (Mon ~1-2AM, parallel with Phase 2)
- [ ] **Phase 4: Family Verification and Dashboard** - Family member's phone prompts "Are you calling Grandma right now?"; Yes/No decides the call and the lamp; live dashboard, history, stage view (Tue 7-11AM)
- [ ] **Phase 5: Attack Simulator, Demo Hardening, and Pitch** - Consented cloned-voice attacker, post-call family report, one-command reset, 3 clean rehearsals, backup video, 5-slide deck (Tue 11AM-8PM, freeze 5PM)

## Phase Details

### Phase 1: Foundation and Landing Page Live

**Goal:** The Porchlight monorepo builds and deploys with one command, vendor secrets are wired without touching git, the shared `calls/{id}` schema exists once, and the public landing page is collecting attributed waitlist signups with a live counter so traction accrues for the next ~20 hours.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, LAND-01, LAND-02, LAND-03, LAND-04
**Success Criteria** (what must be TRUE):

  1. A visitor at the public URL can read the one-screen pitch (problem, how it works, lamp illustration) on a phone and on a desktop.
  2. A visitor can submit an email plus an optional "who are you protecting?" answer; the entry lands in Firestore tagged with its `?ref=` source, and the on-page signup counter increments live without a reload.
  3. One command (`pnpm deploy` or equivalent) builds `apps/web` and `functions` and deploys both to Firebase Hosting/Functions from a clean checkout.
  4. Anthropic, Twilio, and ElevenLabs secrets are readable by Functions and absent from git; the shared `calls/{id}` types package (state machine `idle → screening → verifying → verified | scam → ended`, transcript turns, risk, claimed identity) compiles and is imported by both web and functions.

**Plans**: TBD
**UI hint**: yes

**Target window:** Mon 8:30-10PM. Landing page must be public and posted by ~10PM.

**Human actions (checkpoints, not automated tasks):**

- Create the Firebase project, enable Firestore + Hosting + Functions, upgrade to Blaze.
- Create Twilio account, buy a US number, upgrade out of trial (~$20) so calls have no trial announcement.
- Create ElevenLabs account (Starter/Creator tier).
- Put the existing Anthropic key into `.env.local` / Functions secrets.
- Post the landing page with distinct `?ref=` tags: LinkedIn, r/RhodeIsland, local FB groups, friends with aging parents; prepare an in-room QR code with its own ref.

### Phase 2: Core Screening Loop

**Goal:** Calling the Porchlight number reaches an AI screener whose conversation streams turn-by-turn into the call document with a live `claude-haiku-4-5` risk score, a family-name claim moves the call into `verifying`, verdicts end or release the call, and a browser simulator drives the identical pipeline when live telephony is unavailable.
**Mode:** mvp
**Depends on**: Phase 1 (FND-02 secrets, FND-03 schema, deployed Functions)
**Requirements**: CALL-01, CALL-02, CALL-03, CALL-04, CALL-05, RISK-01, RISK-02, RISK-03, DEMO-05
**Success Criteria** (what must be TRUE):

  1. Calling the Porchlight number from any phone is answered within ~2 rings with "Hi, this is Margaret's assistant, who's calling?" and the screener holds a natural multi-turn conversation that asks who is calling and why, never reveals personal details, and never agrees to a payment.
  2. Each caller and assistant turn appears on the `calls/{id}` document within ~2s of being spoken (observable in the Firestore console or a raw debug view).
  3. After every caller turn the call document's `risk`, `tactics[]`, `claimed_identity`, and `recommended_action` update from Claude; the "grandchild in jail, needs gift cards, don't tell mom" script produces a climbing risk with urgency, secrecy, payment-method, authority/bail, and impersonation tactics named.
  4. A caller saying "it's Brenden" is matched to the seeded household member and the call moves to `verifying`; forcing a scam verdict ends the call with a spoken line, forcing a verified verdict lets it proceed, and after hangup the full transcript plus from/duration/outcome are persisted.
  5. The browser call simulator can play the scripted scam (typed or pre-recorded turns) through the same turn → risk → state pipeline with no telephony, producing a call document indistinguishable from a live call.

**Plans**: 3 plans

- [ ] 02-01-PLAN.md — runTurn() screening core (Claude risk scoring, identity match, AI-initiated end) + simulateTurn + /sim browser simulator
- [ ] 02-02-PLAN.md — elevenlabsCustomLlm + personalization webhook + Twilio-backed end/release + ElevenLabs dashboard wiring + first live test call
- [ ] 02-03-PLAN.md — Twilio/ElevenLabs account + secrets checkpoint + full live phone test script

**Target window:** Mon 10PM-2AM. Highest technical risk in the project.

**Timeboxes and fallback:**

- 90 minutes on Twilio number → ElevenLabs Agents (per-turn transcript via custom-LLM endpoint or server-tool webhook; post-call webhook for the final transcript). If no call is answered by then, switch to Vapi/Retell.
- **1AM go/no-go:** if live telephony is still not answering calls, DEMO-05 (browser simulator) becomes the primary demo path and Phases 4-5 build on it; telephony becomes a stretch goal.
- Seed the demo household (Margaret + family members, including the builder) in Firestore as part of this phase so RISK-03 has something to match against.

**Human actions:** import the Twilio number into ElevenLabs Agents (account-side clicks); confirm Twilio is out of trial by placing a test call; place test calls from your own phone.

### Phase 3: Lamp

**Goal:** The lamp beside the phone mirrors call state within about a second, driven from the Mac over the direct ethernet link, so a senior gets an ambient blue/green/red signal without reading anything, and a joystick press lets her call for her family.
**Mode:** mvp
**Depends on**: Phase 1 (FND-03 call-doc schema). Runs in parallel with Phase 2; does not need telephony. **Pending human action:** SSH key installed on the Pi (username/password confirmed). The Pi has no internet on this link, so every file is pushed over `raspberrypi.local` / `169.254.59.28`.
**Requirements**: LAMP-01, LAMP-02, LAMP-03, LAMP-04
**Success Criteria** (what must be TRUE):

  1. The Pi shows an amber idle glow at rest; POSTing `screening`, `verifying`, `verified` (with a name), or `scam` to the Pi's HTTP service renders blue pulsing, blue pulsing, green with the name scrolling, and red flashing "SCAM" respectively.
  2. Changing the active call's state in Firestore (by hand or via the Phase 2 simulator) changes the lamp within ~1s through the Mac-side bridge, with the Mac on Wi-Fi or hotspot and the Pi only on the cable.
  3. Power-cycling the Pi brings the lamp service back to amber idle with no manual step (systemd); the lamp returns to idle after a call ends or when the bridge stops sending.
  4. Pressing the Sense HAT joystick raises a "call my family" alert that the family can see (alert record on the household; rendered on the dashboard once Phase 4 lands).

**Plans**: TBD

**Target window:** Mon ~1-2AM (1-2h). Python 3.9, standard library plus preinstalled `sense_hat` only; no `pip install`.

**Human actions:** confirm Pi login, install the SSH public key on the Pi; keep the Pi on the ethernet dongle (`en8`) for the demo, never Wi-Fi.

### Phase 4: Family Verification and Dashboard

**Goal:** When a caller claims to be a family member, that member's phone prompts them within ~2s and their answer decides the call: Yes with a passkey marks it verified and the lamp goes green; No or a timeout marks it scam, drops the call, alerts the household, and the lamp goes red. Meanwhile the family watches the live transcript, risk meter, and history on a dashboard, and a projector-friendly stage view carries the demo.
**Mode:** mvp
**Depends on**: Phase 2 (call states, RISK-03 `verifying` trigger, or the simulator if telephony fell back), Phase 3 (lamp reacts to `verified`/`scam` end to end)
**Requirements**: VER-01, VER-02, VER-03, VER-04, VER-05, DASH-01, DASH-02, DASH-03
**Success Criteria** (what must be TRUE):

  1. A family member can enroll their phone by creating a passkey tied to their household identity; when a caller claims to be them, that phone shows a full-screen "Are you calling Grandma right now?" prompt within ~2s with sound and vibration where supported.
  2. Tapping No (or letting 20s elapse) marks the call `scam`, ends it, alerts the household with transcript and reasons, and the lamp flashes red; tapping Yes requires a passkey assertion, marks the call `verified`, lets it proceed, and the lamp turns green with the caller's name.
  3. The dashboard shows the active call live: streaming transcript, risk meter, detected tactics, claimed identity, and state, updating as the call runs.
  4. The dashboard shows call history with Verified / Scam blocked / Screened badges and opens any call's transcript (and its family report once Phase 5 generates one).
  5. A stage view renders the single active call in large type on a dark background, readable from the back of the room on a projector.

**Plans**: TBD
**UI hint**: yes

**Target window:** Tue 7-11AM. This phase completes the core value: the judge taps "No" and the lamp turns red.

**Timebox:** 2 hours on WebAuthn (SimpleWebAuthn). If it overruns, ship VER-05 (signed single-use link tap with the same Yes/No UI) and treat the passkey as a stretch. The in-app realtime prompt (Firestore listener + full-screen modal) is the primary channel; SMS is optional garnish only.

**Human actions:** enroll a passkey on the phone that will be handed to a judge; add that person to the seeded household.

### Phase 5: Attack Simulator, Demo Hardening, and Pitch

**Goal:** A consented cloned voice attacks the Porchlight number on command and is caught by the full loop, every call ends with a plain-English family report, the 3-minute demo runs clean three times in a row on venue Wi-Fi and on hotspot with a recorded backup, and the deck carries real traction numbers gathered during the event.
**Mode:** mvp
**Depends on**: Phase 4 (full verification loop), Phase 3 (lamp reset)
**Requirements**: ATK-01, ATK-02, ATK-03, RISK-04, DEMO-01, DEMO-02, DEMO-03, DEMO-04
**Success Criteria** (what must be TRUE):

  1. One click or one command places an outbound call from the attacker agent, in the consented cloned voice, to the Porchlight number; it runs the "grandchild in jail, needs gift cards, don't tell mom" script conversationally and triggers the full loop (screening → verifying → No → scam → red lamp).
  2. Within ~30s of any call ending, a `claude-sonnet-5` family report (what the caller wanted, why it was flagged, what Porchlight did) appears on that call in the dashboard history.
  3. One command resets the system to a clean demo state (no active calls, lamp idle, seeded household), and the full demo script then runs end to end three times in a row without intervention, on venue Wi-Fi and on phone hotspot.
  4. A recorded backup video of the full demo exists before 5PM, and the 5-slide deck (problem + verified numbers, live demo, how it works, traction with live waitlist count + quotes + pilot interest, market + ask) is ready with the counter number from the landing page.
  5. Consent for whichever voice was cloned is recorded (builder's own voice by default) and stated in the pitch.

**Plans**: TBD

**Target windows:** Tue 11AM-1PM attack simulator + rehearsal x3 · 1-3PM traction push (human) · 3-5PM polish, failure handling, backup video · **5PM feature freeze** · 5-8PM slides, rehearse pitch x3, test on venue Wi-Fi + hotspot.

**Human actions:** record ~30-60s of your own voice and sign/record consent; five short calls with people who have elderly parents; call 2-3 RI senior centers / home-care agencies for a pilot "yes"; collect quotes; verify the FBI IC3 2024 figures before they go on a slide; record the backup video; build and rehearse the deck.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5. Phase 3 may run in parallel with Phase 2 once Phase 1 is complete.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and Landing Page Live | 0/TBD | Not started | - |
| 2. Core Screening Loop | 0/TBD | Not started | - |
| 3. Lamp | 0/TBD | Not started | - |
| 4. Family Verification and Dashboard | 0/TBD | Not started | - |
| 5. Attack Simulator, Demo Hardening, and Pitch | 0/TBD | Not started | - |

### Phase 6: Demo Polish and Workflow Hardening
**Goal:** Transform Porchlight from a working-but-hacked-together demo into the most polished product it can be by 4PM Tue 2026-09-22 (demo 5PM): every screen looks designed rather than scaffolded, and every demo workflow is crisp, refresh-safe, and resettable in one tap.
**Mode:** mvp
**Depends on:** Phase 5
**Requirements:** POL-01, POL-02, POL-03, POL-04, POL-05
**Success Criteria** (what must be TRUE):
  1. `/`, `/stage`, `/verify`, `/app`, `/sim` share one coherent visual system (type scale, palette, spacing, motion) and read as a finished product on a projector and a phone.
  2. Each workflow — simulated scam, live call blocked, live call approved, known caller, message taken — has a defined before / during / after state on every screen, survives a browser refresh mid-call, and settles into a clear "ready for next call" state instead of sticking on BLOCKED or VERIFIED.
  3. A one-tap operator control resets the whole system (calls, prompts, lamp, bulbs) and is reachable from the demo screens.
  4. On arrival at the venue, one command discovers and reports the Pi, the Hue Bridge, and every reachable bulb (including newly powered ones) and brings them all to idle.
  5. `scripts/demo-check.sh` stays GO and all tests pass at 4PM.
**Target window:** Tue 1:35–4:00PM. Hard stop 4PM.
**Plans:** TBD

