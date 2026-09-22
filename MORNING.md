# Porchlight — morning summary (written 2026-09-22 ~02:00 EDT)

## What works right now (all deployed from `main` @ c998023, pushed)

**The whole demo loop, verified end to end at 1:50 AM without a phone:**
`/sim` scam script → Claude risk scoring → `verifying` → member prompt doc → answered "No" via the real callable → `scam` → **lamp red** → Sonnet family report written in ~15 s. Then `pnpm demo:reset` → everything idle.

| Piece | Status | Where |
|---|---|---|
| Landing page + waitlist + live counter | live | https://porchlight-hack.web.app (counter = 1, the test signup) |
| Real phone → ElevenLabs → our Claude endpoint | live; your 12:14 AM call scored risk 95 | +1 401 586 1988 |
| One call doc per call, family claim → `verifying`, single farewell | fixed + deployed after your call | needs one confirming call (below) |
| Family dashboard / projector stage | live, untested on a real screen | /app, /stage |
| Member phone page (passkey enroll + Yes/No prompt) | live, untested on a real phone | /verify?member=brenden |
| Lamp on the Pi + Firestore bridge | working; joystick demo mode + `--selftest` added | Pi 169.254.10.2; bridge tab `lamp bridge` (must stay running) |
| `pnpm demo:reset`, auto family report (Sonnet) | working | scripts/.demo.env holds DEMO_TOKEN (gitignored) |
| Tests | 51 functions + 11 web, all green | `pnpm -r test` |

## Your morning, in order (all human-only)

1. **Confirm the fixed call flow (5 min).** Call +1 401 586 1988. Say: "Hi grandma, it's me, Brenden." → then the jail/gift-card line. Expected: it says it's checking with the family and keeps you on the line; Firestore shows ONE `calls/*` doc going `verifying`; lamp turns blue. (If the bridge tab died overnight: `pnpm lamp:bridge` in `cool/`.)
2. **Enroll your phone (5 min).** On your phone open https://porchlight-hack.web.app/verify?member=brenden → Enroll → Face ID/fingerprint → tap Arm. Leave it open. Then run `/sim` on the laptop: your phone should buzz with "Are you calling Grandma right now?" → tap No → lamp red. Then Yes on a second run → lamp green with your name. This is the judge's moment; rehearse it 3×.
3. **Look at /stage on the projector/TV** and /app on a laptop during a sim run; tell me anything that reads badly.
4. **Press the joystick**: directions cycle idle→screening→verifying→verified→scam on the LEDs (people like buttons); center = family alert.
5. **Attack simulator (Phase 5 plan 05-02, human-gated):** record ~60 s of your voice, Instant Voice Clone in ElevenLabs, create an "Attacker" agent, buy a second Twilio number (~$1) and import it. I'll dispatch the executor for the `attackCall` function once you say the clone + agent exist. Write consent into `ATTACKER_CONSENT.md` (the plan has the text).
6. **Traction:** text 5–10 friends with older parents (`?ref=friends`), call 2–3 RI senior centers/home-care agencies after 9 AM, collect quotes. QR (`?ref=qr`) goes on the last slide and a printed sheet.
7. **Pitch:** Phase 5 plan 05-03 = DEMO.md runbook + `scripts/demo-check.sh` + PITCH.md outline; dispatchable any time, it's autonomous except rehearsals.

## Open items / known rough edges
- "1 families on the waitlist" grammar; agent voice still a bit robotic (enable Expressive Mode on Sarah); personalization webhook works but CallSid capture for hanging up a *real* call on "No" is unverified until step 1.
- GSD phase-complete gating wants verifier reports; skipped to save tokens. Phases 1–4 are functionally done; Phase 5 has 1/3 plans done.
- Usage budget: heavy overnight (≈10 Sonnet executor runs). Keep Fable to orchestration only today.

Wake me by saying "morning" with the result of step 1.
