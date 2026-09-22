---
phase: 05-attack-simulator-demo-hardening-and-pitch
plan: 02
subsystem: infra
tags: [firebase-functions, elevenlabs, twilio, demo-tooling, react]

# Dependency graph
requires:
  - phase: 05-attack-simulator-demo-hardening-and-pitch
    provides: "resetDemo's DEMO_TOKEN timingSafeEqual gate pattern (05-01), reused verbatim by attackCall"
  - phase: 02-core-screening-loop
    provides: "elevenlabsPersonalization/elevenlabsCustomLlm inbound pipeline that treats any inbound call, real or simulated, identically -- attackCall's outbound call rides this unmodified"
provides:
  - "attackCall onCall Function (DEMO_TOKEN-gated, timingSafeEqual) -- places a real ElevenLabs Twilio outbound call in the consented cloned-voice 'Attacker' agent, hardcoded to dial only the Porchlight demo number"
  - "pnpm demo:attack CLI + a 'Launch attack call (cloned voice)' button on /sim, both invoking the same attackCall callable"
  - "ATTACKER_CONSENT.md -- recorded consent for the cloned voice and the on-stage disclosure line"
affects: [05-03, pitch-day runbook, rehearsal plans]

# Actuals (#2632)
actuals:
  tokens: 4690
  tasks: 3
  commits: 3
  plan_head_before: 5fffd7bd96dd07add3599803b8628d95e900f865

tech-stack:
  added: []
  patterns:
    - "Second onCall Function (attackCall) reuses resetDemo's exact DEMO_TOKEN timingSafeEqual gate function body (not imported, duplicated verbatim per file, matching the existing per-file pattern) -- checked as the first statement before any network call"
    - "Outbound-attack destination is a module-level string literal with zero request-shaped fields anywhere in the zod input schema, so the T-05-06 mitigation is enforced by the type itself, not just runtime logic"

key-files:
  created:
    - functions/src/attack/attackCall.ts
    - functions/src/attack/attackCall.test.ts
    - scripts/demo-attack.mjs
    - ATTACKER_CONSENT.md
  modified:
    - functions/src/secrets.ts
    - functions/src/index.ts
    - package.json
    - apps/web/src/pages/Sim.tsx

key-decisions:
  - "Secret name is ELEVENLABS_ATTACKER_PHONE_ID, not the plan's literal ELEVENLABS_ATTACKER_PHONE_NUMBER_ID -- confirmed against what the human checkpoint had already set in Secret Manager via `firebase functions:secrets:access` before writing secrets.ts, rather than trusting the plan text."
  - "ATTACKER_CONSENT.md was written in this execution pass, after the Instant Voice Clone/Attacker agent/secrets were already created by the human checkpoint that preceded this pass -- the plan's intended ordering (consent file predates the clone) is satisfied in substance (the spoken consent statement opens the voice sample itself, predating the clone), not in this repo's commit-timestamp ordering. Documented as a deviation note inside the file itself."
  - "Added a 'Launch attack call (cloned voice)' button to /sim calling attackCall directly via httpsCallable (not shelling out to the CLI script) so the button and pnpm demo:attack exercise the identical server-side code path -- not in the plan's literal files_modified list, added per this plan's dispatched objective (Rule 2)."

requirements-completed: [ATK-01, ATK-02, ATK-03]

coverage:
  - id: D1
    description: "attackCall onCall (DEMO_TOKEN-gated, timingSafeEqual) places an ElevenLabs outbound Twilio call to a hardcoded Porchlight number only -- no code path accepts a caller-supplied destination"
    requirement: "ATK-01"
    verification:
      - kind: unit
        ref: "functions/src/attack/attackCall.test.ts (4 tests: wrong token never calls fetch, missing token never calls fetch, correct token calls fetch once with the hardcoded number regardless of req.data, non-2xx surfaces HttpsError('internal') with response body)"
        status: pass
      - kind: integration
        ref: "live against deployed porchlight-hack: `pnpm demo:attack` returned 200 with {conversation_id, callSid}; ElevenLabs' own outbound-call API accepted the request and dialed +14015861988"
        status: fail
    human_judgment: true
    rationale: "The live outbound call was placed and accepted by ElevenLabs, but the conversation itself failed with ElevenLabs error code 3000 ('Agent ... is unsafe', error_type call_initialization_error) before any turns were exchanged -- the receiving screening/verification/lamp loop was never exercised end-to-end. This is a vendor-side content-moderation block on the Attacker agent, not a bug in this repo's code, and requires a human to resolve in the ElevenLabs dashboard (see Issues Encountered) before Task 3's full-loop verification can pass."
  - id: D2
    description: "pnpm demo:attack (CLI) and a 'Launch attack call (cloned voice)' button on /sim both invoke attackCall via the callable protocol"
    requirement: "ATK-02"
    verification:
      - kind: unit
        ref: "functions/src/attack/attackCall.test.ts (attackCall's own contract, exercised identically by both callers)"
        status: pass
      - kind: integration
        ref: "`pnpm demo:attack` executed live against deployed porchlight-hack and returned a 200 JSON result"
        status: pass
    human_judgment: false
  - id: D3
    description: "ATTACKER_CONSENT.md records whose voice was cloned, the consent statement, and the on-stage disclosure line"
    requirement: "ATK-03"
    verification:
      - kind: other
        ref: "test -s ATTACKER_CONSENT.md && grep -qi consent ATTACKER_CONSENT.md"
        status: pass
    human_judgment: true
    rationale: "Consent recording is an ethics/compliance artifact -- a human should confirm the wording and ordering rationale (documented as a deviation in the file) are acceptable before the pitch, not just that the file exists."

duration: 55min
completed: 2026-09-22
status: complete
---

# Phase 5 Plan 2: Attack simulator (attackCall + pnpm demo:attack + /sim button + consent) Summary

**`attackCall` onCall (DEMO_TOKEN-gated, hardcoded Porchlight destination) wired to `pnpm demo:attack` and a `/sim` button; live-tested against deployed infra, where it surfaced a vendor-side ElevenLabs content-moderation block on the Attacker agent that stops the demo script from actually running yet.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-09-22T12:09:00Z
- **Completed:** 2026-09-22T16:22:00Z
- **Tasks:** 3 (Task 1 code, Task 2 consent doc, Task 3 live verification -- blocked)
- **Files modified:** 8

## Accomplishments
- `attackCall` onCall Function: identical DEMO_TOKEN timingSafeEqual gate to `resetDemo`, checked before any network call; input schema has no number-shaped field at all, so `to_number` is always the hardcoded `+14015861988` literal regardless of `req.data`
- `scripts/demo-attack.mjs` (`pnpm demo:attack`) mirrors `demo-reset.mjs`'s callable-protocol POST exactly
- `/sim` now has a "Launch attack call (cloned voice)" button calling `attackCall` directly via `httpsCallable`, sharing the exact code path the CLI uses
- `ATTACKER_CONSENT.md` records whose voice was cloned (the builder's own), the consent statement, and the on-stage disclosure line
- Deployed `attackCall` + hosting to `porchlight-hack`; confirmed both new secrets (`ELEVENLABS_ATTACKER_AGENT_ID`, `ELEVENLABS_ATTACKER_PHONE_ID`) are bound
- Live-fired `pnpm demo:attack` once: `attackCall` returned 200 with a real `conversation_id`/`callSid`, and a `calls/*` doc (`from: +14014027950`, `provider: 'elevenlabs'`) appeared within seconds -- proving the outbound trigger and the receiving personalization webhook both work
- Discovered the call itself never progressed past initialization: ElevenLabs' conversation record shows `status: "failed"`, `error.code: 3000`, `error.reason: "Agent agent_9901m34xbzw5fnc8hmz0zf3j39j9 is unsafe"`; the Twilio leg lasted 1 second; no `elevenlabsCustomLlm` turns were ever generated; the lamp never left `screening`
- Ran `pnpm demo:reset` to clear the failed test call and confirm the lamp is back to `idle`

## Task Commits

Each task was committed atomically:

1. **Task 1: attackCall callable + pnpm demo:attack** - `c35ca22` (feat)
2. **Task 1 extension: /sim launch button** - `c3fdce9` (feat) -- see Deviations
3. **Task 2: Record consent** - `50a3a49` (docs)

_Task 3 (live verification) produced no code changes -- see Issues Encountered._

## Files Created/Modified
- `functions/src/attack/attackCall.ts` - DEMO_TOKEN-gated onCall, hardcoded outbound destination
- `functions/src/attack/attackCall.test.ts` - gate + destination + error-surfacing tests
- `functions/src/secrets.ts` - added `elevenLabsAttackerAgentId`, `elevenLabsAttackerPhoneId`
- `functions/src/index.ts` - exported `attackCall`
- `scripts/demo-attack.mjs` - `pnpm demo:attack` CLI
- `package.json` - added `demo:attack` script
- `apps/web/src/pages/Sim.tsx` - "Launch attack call (cloned voice)" button
- `ATTACKER_CONSENT.md` - consent record + on-stage disclosure line

## Decisions Made
- Used the Secret Manager's actual secret name (`ELEVENLABS_ATTACKER_PHONE_ID`) rather than the plan's literal `ELEVENLABS_ATTACKER_PHONE_NUMBER_ID`, confirmed via `firebase functions:secrets:access` before writing code.
- Wrote `ATTACKER_CONSENT.md` in this pass, after the vendor-side voice clone/agent/secrets already existed from the prior human checkpoint -- documented as an explicit deviation note inside the file, since the plan's literal file-precedes-clone git-history ordering could not be retroactively satisfied, though the substantive requirement (spoken consent predating the clone, captured on the sample itself) was already met.
- Added the `/sim` button as part of Task 1's commit set even though it wasn't in the plan's `files_modified` list, because the dispatched objective explicitly required it (Rule 2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected the second secret's name**
- **Found during:** Task 1
- **Issue:** Plan frontmatter specifies `ELEVENLABS_ATTACKER_PHONE_NUMBER_ID`, but the human checkpoint had already created the secret in Secret Manager as `ELEVENLABS_ATTACKER_PHONE_ID`.
- **Fix:** Verified via `firebase functions:secrets:access` before writing `secrets.ts`; used the name that actually exists.
- **Files modified:** functions/src/secrets.ts, functions/src/attack/attackCall.ts, functions/src/attack/attackCall.test.ts
- **Verification:** `firebase functions:secrets:access ELEVENLABS_ATTACKER_PHONE_ID` returns a value; deploy succeeded with the secret bound.
- **Committed in:** c35ca22

**2. [Rule 2 - Missing Critical] Added the /sim launch button**
- **Found during:** Task 1
- **Issue:** The plan's `files_modified` list omits `apps/web/src/pages/Sim.tsx`, but the dispatched objective explicitly requires "a button on /sim" as part of ATK-02's "one command" (this plan interprets that as one callable, reachable two ways).
- **Fix:** Added a button that calls `attackCall` via `httpsCallable`, token from `localStorage` (prompted once via `window.prompt`).
- **Files modified:** apps/web/src/pages/Sim.tsx
- **Verification:** `pnpm --filter @porchlight/web typecheck` and `build` both pass.
- **Committed in:** c3fdce9

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both necessary for the plan's literal deliverables to exist and be deployable/usable. No scope creep beyond what the dispatched objective required.

## Issues Encountered

**Live call blocked by ElevenLabs agent-safety moderation (unresolved -- requires human action in the ElevenLabs dashboard):**

`pnpm demo:attack` was run once against the deployed project, per the live-verify instructions. `attackCall` itself worked correctly end-to-end on our side:
- Returned HTTP 200 with `{"success":true,"conversation_id":"conv_7901m34yg8x5f0k9a58gqak9nfaz","callSid":"CA70ed0b2b61dc3bf955d3c1b97a225ff5"}`
- ElevenLabs' outbound-call API accepted the request and dialed the Porchlight number
- Twilio placed a real inbound call (`CA58bf519f49f287e577c57fe1f8a8fc3f`, `from: +14014027950`, `to: +14015861988`)
- `elevenlabsPersonalization` fired correctly and created `calls/P0ojywK1WBrCOpXdkprv` (`provider: 'elevenlabs'`, `state: 'screening'`)

But the call itself never produced any conversational turns. Investigation via ElevenLabs' `GET /v1/convai/conversations/{id}` API showed:
```json
"status": "failed",
"metadata": { "call_duration_secs": 0, "error": { "code": 3000, "reason": "Agent agent_9901m34xbzw5fnc8hmz0zf3j39j9 is unsafe", "error_type": "call_initialization_error" } }
```
The Twilio leg confirms this: `duration: "1"` second, `status: "completed"` -- the call connected and was immediately torn down. No `elevenlabsCustomLlm` invocations appear in the function logs for this call at all. The lamp never left `screening`; no verdict, no report.

This is a vendor-side content-moderation flag on the "Attacker" agent itself (created per the plan's Task 2 system prompt, which describes a grandchild-in-jail gift-card scam -- almost certainly the trigger for ElevenLabs' automated safety review), not a bug in `attackCall`, the personalization webhook, or the screening pipeline. It cannot be fixed by changing code in this repo. `pnpm demo:reset` was run afterward and confirmed the test call doc was deleted and the lamp returned to `idle`.

**Recommended next step (human, in the ElevenLabs dashboard):**
1. Open the "Attacker" agent in the ElevenLabs dashboard and look for a safety/review banner or status indicator.
2. If the block is content-based, consider softening the system prompt's most scam-pattern-matching phrases (e.g., "bail money as gift cards") while keeping the scenario recognizable, and re-test.
3. If the block is not content-based (e.g., new outbound-agent accounts require manual approval, or a phone-number-verification step), contact ElevenLabs support, citing this is a disclosed, consented security-demo simulation dialing only the builder's own test number.
4. After any dashboard-side change, re-run `pnpm demo:attack` (this counts toward the "no more than twice" real-telephony budget noted in this plan's dispatch) and re-check `calls/{id}` for turns growing before the pitch.

Per this plan's `human_setup`/checkpoint structure, this falls into Task 2/3's territory (vendor-side agent configuration) rather than anything `attackCall`'s code can route around, and per this plan's ethics constraints it would be inappropriate to attempt working around ElevenLabs' safety system programmatically.

## User Setup Required

None beyond what Task 2's human checkpoint already did (voice clone, Attacker agent, second Twilio number, secrets) -- see Issues Encountered above for the one remaining ElevenLabs-dashboard action needed before Task 3 can pass live.

## Next Phase Readiness

- Code deliverables (ATK-01 code path, ATK-02, ATK-03) are complete, tested, deployed, and committed.
- The demo is NOT yet stage-ready: the live attacker call currently fails at ElevenLabs' agent-safety layer before any conversation happens. This must be resolved (see recommended next step) and re-verified before the 05-03 pitch plan can rely on a working live attack call.
- `functions/src/attack/attackCall.ts` is otherwise a solid foundation -- once the Attacker agent passes ElevenLabs' safety review, no code changes should be needed here.

---
*Phase: 05-attack-simulator-demo-hardening-and-pitch*
*Completed: 2026-09-22*

## Self-Check: PASSED

All created files confirmed present on disk (functions/src/attack/attackCall.ts,
functions/src/attack/attackCall.test.ts, scripts/demo-attack.mjs, ATTACKER_CONSENT.md,
apps/web/src/pages/Sim.tsx, this SUMMARY.md). All three task commits (c35ca22, 50a3a49,
c3fdce9) confirmed present in `git log`.
