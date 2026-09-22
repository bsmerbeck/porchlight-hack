# Requirements: Porchlight

**Defined:** 2026-09-21
**Core Value:** A scam call claiming to be family gets caught live on stage: the AI screens it, the real family member taps "No, that's not me", and the lamp turns red.

## v1 Requirements

Scope = what the 3-minute demo and the traction slide need. Demo 9PM Tue 2026-09-22, feature freeze 5PM.

### Foundation

- [ ] **FND-01**: Monorepo scaffold (pnpm; `apps/web` Vite + React 19 + Tailwind v4 + shadcn; `functions` Firebase Functions v2 TypeScript; `pi/` Python; `bridge/` Node) builds and deploys with one command
- [ ] **FND-02**: Firebase project exists with Firestore, Hosting, and Functions (Blaze) enabled; secrets (Anthropic, Twilio, ElevenLabs) stored as Functions secrets / untracked `.env.local`, none in git
- [ ] **FND-03**: Shared `calls/{id}` Firestore document schema (state machine: `idle → screening → verifying → verified | scam → ended`; transcript turns; risk; claimed identity) defined once in a shared types package and used by every component

### Landing & Traction

- [ ] **LAND-01**: Visitor can read a one-screen pitch (problem, how it works, lamp photo/illustration) at a public URL
- [ ] **LAND-02**: Visitor can join the waitlist with an email and optional "who are you protecting?" answer; entry is stored in Firestore
- [ ] **LAND-03**: Page shows a live signup counter; the same number is readable for the final slide
- [ ] **LAND-04**: Signup source is attributed via `?ref=` so posts (LinkedIn, Reddit, FB groups, in-room QR) can be compared

### Call Screening

- [ ] **CALL-01**: Calling the Porchlight phone number is answered by the AI screener within ~2 rings with a short greeting on behalf of the senior ("Hi, this is Margaret's assistant, who's calling?")
- [ ] **CALL-02**: Screener holds a natural multi-turn conversation: asks who is calling and why, never reveals personal details, never agrees to payments
- [x] **CALL-03**: Each caller/assistant turn is written to the call document within ~2s of being spoken, so the transcript streams live
- [ ] **CALL-04**: Backend can end the call programmatically (scam verdict) and can let it proceed (verified verdict) with an appropriate spoken line
- [x] **CALL-05**: Post-call, the full transcript and call metadata (from, duration, outcome) are persisted

### Risk Scoring

- [x] **RISK-01**: Every caller turn triggers a Claude (`claude-haiku-4-5`) assessment returning structured JSON: `risk` 0-100, `tactics[]` (urgency, secrecy, payment method, authority/bail, impersonation), `claimed_identity`, `recommended_action`
- [x] **RISK-02**: Risk and tactics update on the call document in real time and drive the dashboard meter
- [x] **RISK-03**: When the caller claims to be a known family member, the system matches the claim to a household member and starts verification
- [ ] **RISK-04**: After the call, Claude (`claude-sonnet-5`) writes a plain-English family report: what the caller wanted, why it was flagged, what Porchlight did

### Family Verification

- [ ] **VER-01**: Family member can enroll a device by creating a passkey (WebAuthn) tied to their household identity
- [ ] **VER-02**: When a caller claims to be that member, their enrolled device shows a full-screen prompt within ~2s: "Are you calling Grandma right now?" with Yes / No (sound + vibration where supported)
- [ ] **VER-03**: "Yes" requires a passkey assertion; success marks the call `verified`
- [ ] **VER-04**: "No" (or a 20s timeout) marks the call `scam`, ends it, and alerts the household
- [ ] **VER-05**: Fallback path if WebAuthn overruns its 2h timebox: signed single-use link tap, same UI

### Family Dashboard

- [ ] **DASH-01**: Family member sees the active call live: streaming transcript, risk meter, detected tactics, claimed identity, state
- [ ] **DASH-02**: Family member sees call history with outcome badges (Verified / Scam blocked / Screened) and can open any call's transcript and report
- [ ] **DASH-03**: A projector-friendly "stage view" (large type, dark, single call) for the demo

### Lamp

- [ ] **LAMP-01**: Pi runs a dependency-free Python 3.9 service (stdlib HTTP + preinstalled `sense_hat`) that accepts a state and renders it on the 8x8 LED matrix: amber idle glow, blue pulsing while screening/verifying, green with scrolling caller name when verified, red flashing "SCAM" when blocked
- [ ] **LAMP-02**: Mac-side bridge subscribes to the active call in Firestore and POSTs state changes to the Pi over the ethernet link within ~1s
- [ ] **LAMP-03**: Lamp service starts on boot (systemd) and returns to idle after a call ends or if the bridge goes silent
- [ ] **LAMP-04**: Joystick press triggers a "call my family" alert visible on the dashboard

### Attack Simulator

- [ ] **ATK-01**: A second AI agent with a consented cloned voice can place an outbound call to the Porchlight number and run the "grandchild in jail, needs gift cards, don't tell mom" script conversationally
- [ ] **ATK-02**: Attack call can be launched with one click / one command during the demo
- [ ] **ATK-03**: Consent is recorded for whichever voice is cloned (builder's own voice by default)

### Demo & Pitch

- [ ] **DEMO-01**: One-command reset returns the system to a clean demo state (no active calls, lamp idle, seeded household)
- [ ] **DEMO-02**: Full demo script runs end-to-end 3 times in a row without intervention, on venue Wi-Fi and on phone hotspot
- [ ] **DEMO-03**: Recorded backup video of the full demo exists before 5PM
- [ ] **DEMO-04**: 5-slide deck: problem + numbers, live demo, how it works, traction (signups, quotes, pilot interest), market + ask
- [x] **DEMO-05**: Browser-based call simulator can replay the scripted scam through the same pipeline if live telephony fails on stage

## v2 Requirements

Deferred. Tracked but not in this roadmap.

### Product

- **PROD-01**: Conditional call forwarding so the senior keeps their own number
- **PROD-02**: Allowlist of known contacts that ring straight through
- **PROD-03**: Verification by outbound voice call ("Press 1 if you are calling Margaret now") for family without the app
- **PROD-04**: Acoustic synthetic-voice detection as an additional signal
- **PROD-05**: Multi-household accounts, billing, roles
- **PROD-06**: Lamp as a standalone Wi-Fi device with its own provisioning

### Go-to-market

- **GTM-01**: RI home-care agency and senior-center pilots
- **GTM-02**: Registered A2P 10DLC messaging for SMS alerts

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native mobile apps | Web app on a judge's phone is enough for the demo |
| SMS as primary verification channel | A2P 10DLC registration takes days; unregistered SMS gets blocked |
| Audio-forensics deepfake detector | Not buildable or provable in 24h; identity verification defeats a perfect clone anyway |
| Real seniors' phone lines | Demo uses a dedicated number and a prop phone; no real personal data |
| Jetson Nano / Flipper Zero | Setup cost with no demo payoff / no honest product role |
| Cloning a voice without on-stage consent | Ethics; also part of the pitch |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 | Pending |
| FND-02 | Phase 1 | Pending |
| FND-03 | Phase 1 | Pending |
| LAND-01 | Phase 1 | Pending |
| LAND-02 | Phase 1 | Pending |
| LAND-03 | Phase 1 | Pending |
| LAND-04 | Phase 1 | Pending |
| CALL-01 | Phase 2 | Pending |
| CALL-02 | Phase 2 | Pending |
| CALL-03 | Phase 2 | Complete (02-01) |
| CALL-04 | Phase 2 | Pending |
| CALL-05 | Phase 2 | Complete (02-01) |
| RISK-01 | Phase 2 | Complete (02-01) |
| RISK-02 | Phase 2 | Complete (02-01) |
| RISK-03 | Phase 2 | Complete (02-01) |
| RISK-04 | Phase 5 | Pending |
| VER-01 | Phase 4 | Pending |
| VER-02 | Phase 4 | Pending |
| VER-03 | Phase 4 | Pending |
| VER-04 | Phase 4 | Pending |
| VER-05 | Phase 4 | Pending |
| DASH-01 | Phase 4 | Pending |
| DASH-02 | Phase 4 | Pending |
| DASH-03 | Phase 4 | Pending |
| LAMP-01 | Phase 3 | Pending |
| LAMP-02 | Phase 3 | Pending |
| LAMP-03 | Phase 3 | Pending |
| LAMP-04 | Phase 3 | Pending |
| ATK-01 | Phase 5 | Pending |
| ATK-02 | Phase 5 | Pending |
| ATK-03 | Phase 5 | Pending |
| DEMO-01 | Phase 5 | Pending |
| DEMO-02 | Phase 5 | Pending |
| DEMO-03 | Phase 5 | Pending |
| DEMO-04 | Phase 5 | Pending |
| DEMO-05 | Phase 2 | Complete (02-01) |

**Coverage:**
- v1 requirements: 36 total
- Mapped to phases: 36
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-21*
*Last updated: 2026-09-21 after roadmap creation (traceability mapped)*
