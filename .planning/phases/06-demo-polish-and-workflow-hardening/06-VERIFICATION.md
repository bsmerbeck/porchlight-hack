---
phase: 06-demo-polish-and-workflow-hardening
status: passed
verified: 2026-09-22T14:30:00-04:00
deployed_commit: c82a50b
human_verification:
  - "W2 live call to +14015861988 → family taps No on real phone → BLOCKED, lamp + Hue red, stage settles to ready after 20s"
  - "W3 live call → family taps Yes + passkey on real phone → VERIFIED, lamp green"
  - "W4 call from allowlisted +14014979735 → Known caller"
  - "W5 benign caller → message taken"
  - "W6 attack via OperatorBar/`pnpm demo:attack` + soundboard fallback"
  - "W7 Pi joystick 'call my family' → alert visible on /app"
  - "Projector look of /stage at 1920x1080 (incl. call-start header/body sync)"
  - "At venue: `pnpm venue:up` finds Pi + Hue + all bulbs; OperatorBar Lamp test drives the physical lamp"
---

# Phase 6 Verification

Automated checks: web tests 50/50, functions tests 95/95, typecheck + build green; `scripts/demo-check.sh` GO (12/12) at 14:10 after the deploy.

| # | Success criterion | Evidence | Status |
|---|---|---|---|
| 1 | One coherent visual system across `/`, `/stage`, `/verify`, `/app`, `/sim` | 06-A tokens and components are used on all pages (06-D/E/F/G). 06-H screenshot pass at phone and desktop sizes. Live /stage checked in the browser pane. | ✓ (projector look → human) |
| 2 | Workflows have before/during/after states, survive a refresh, settle to ready | `deriveStageState`, now with newer-call supersede and a 10-min stale cutoff. A live W1 run on production went ready → SCREENING → VERIFYING → server timeout → SCAM BLOCKED (red lamp) → ready after 20s, with no phone open. Refreshing /verify mid-prompt fired the timeout correctly. | ✓ W1; W2–W7 → human |
| 3 | One-tap reset from the demo screens | OperatorBar Reset on /stage and /sim. `resetDemo` now also ends stale live feed docs (`feedEnded`). `pnpm demo:reset` confirmed stage → ready. | ✓ |
| 4 | Venue bring-up command | `pnpm venue:up` / `venue:search` (06-B). demo-check found the Pi, Hue Bridge, and 1/7 bulbs reachable off-venue. | ✓ (at venue → human) |
| 5 | demo-check GO, all tests pass | GO 12/12; all suites green | ✓ |

## Fixes found by live testing (06-I)
- An abandoned live call outranked a newer result on /stage. Fixed: a newer call now supersedes older live calls.
- Reset left stale live docs in the feed. Fixed: reset now ends them.
- The verify timeout ran only on the phone. Fixed: added the `expireVerification` server backstop, called from /stage and /sim.
- `index.html` was cached for 1h, so open screens kept old bundles after a deploy. Fixed: SPA routes are now `no-cache`.

## Operator notes
- Stay on /sim while "Run scam script" runs. The browser drives each turn, so navigating away aborts the call.

## Human validation (16:35 EDT): passed
The user confirmed on the real phone and the live attack call: the approval path works, "Yes" + Face ID verifies and hangs up, "No" and timeouts block, and the line pill tracks the call.

Late fixes found during human validation (06-J / 06-K):
- Verdict is written before Twilio call control; verified calls speak a confirmation and hang up.
- Verify window 45s (phone), 50s server backstop.
- Later ElevenLabs turns join the live call instead of minting a duplicate doc (the double prompt).
- Passkey auth requests `userVerification: 'required'` (iOS returned UV=false under 'preferred').
- Twilio secrets corrected (AC Account SID + primary Auth Token).
- `lineStatus` pill ("On call · m:ss" / "Line free") in the OperatorBar, plus self-heal of orphaned live docs.
