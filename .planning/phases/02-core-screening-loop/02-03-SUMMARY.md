---
phase: 02
plan: 03
status: complete
completed: 2026-09-22
requirements-completed: []
duration: human checkpoints, ~2h of dashboard work (2026-09-21 22:30 – 2026-09-22 00:15 EDT)
---

# Phase 2 Plan 3: Accounts, Secrets, and Live Phone Test Summary

Human-executed checkpoint plan. All steps were performed by the builder with the orchestrator guiding; evidence is in Firestore and Secret Manager.

## What happened

- Twilio: account upgraded ($20), voice number **+14015861988** (West Warwick RI) purchased, Standard API key created for the ElevenLabs import. `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` stored as Functions secrets (corrected once after the API-key pair was stored by mistake).
- ElevenLabs: Creator plan, `ELEVENLABS_API_KEY` secret set, agent "PorchLight screener" created (voice Sarah, first message set, Custom LLM → `elevenlabsCustomLlm` with the shared `ELEVENLABS_LLM_TOKEN`, personalization webhook → `elevenlabsPersonalization`, Custom LLM extra body override on, `end_call` system tool on, max 120 s, 3 concurrent, 200/day). Twilio number imported and assigned.
- Anthropic: original org-scoped key rejected by the API ("anthropic-workspace-id" 400); replaced with a workspace-scoped key as `ANTHROPIC_API_KEY` version 2 and redeployed.
- **Live phone test 2026-09-22 04:13 UTC**: real call to +14015861988 answered with the greeting, multi-turn screening, Claude risk 95 with tactics `urgency, secrecy, payment_method, authority_bail`, `outcome: scam`, call ended by the agent. Transcript and metadata persisted (CALL-05 proven). Defects found (per-turn doc splitting, family claim ending instead of verifying, double farewell) were fixed in 02-FIX and re-verified by curl.

## Human follow-up
- One more live call in the morning to confirm the 02-FIX behaviour (`verifying` on "it's Brenden").

*Recorded by the orchestrator on behalf of the builder.*
