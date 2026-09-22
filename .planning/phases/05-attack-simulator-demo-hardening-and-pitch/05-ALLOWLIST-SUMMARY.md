---
phase: 05-attack-simulator-demo-hardening-and-pitch
plan: ALLOWLIST
subsystem: telephony
tags: [firebase-functions, firestore-triggers, elevenlabs, anthropic, zod, react, vitest]

# Dependency graph
requires:
  - phase: 02-core-screening-loop (Plan FIX2)
    provides: "runTurn()'s state:'verifying' hold flow, elevenlabsCustomLlm's Tier 1/3 call_doc_id resolution and webhook-doc adoption, the RiskTurn structured-output shape"
  - phase: 04-family-verification-and-dashboard
    provides: "mirrorActiveCallToLamp's calls/{id} -> lamp/current + households/{id}/feed/{callId} fan-out, which this phase's new outcomes ride unmodified"
provides:
  - "households/{id}.allowlist: Array<{number,name,relation}> -- an E.164 caller_id allowlist, seeded live in production households/demo and in the resetDemo/runTurn baseline seeds"
  - "elevenlabsPersonalization.ts + matchAllowlist.ts: an allowlisted caller_id skips the whole screening/risk-scoring flow -- the call doc is created already state:'verified'/outcome:'known', with dynamic_variables for the ElevenLabs dashboard"
  - "elevenlabsCustomLlm.ts: first-turn known-caller finalize (personalized goodbye + end_call), and Tier 3 webhook-doc adoption extended to accept a fresh state:'verified' doc, not just state:'screening'"
  - "runTurn.ts 'message' action: a benign unknown caller (pharmacy, delivery, neighbor, etc.) gets a message taken and the call ended with outcome:'message', instead of being held for verification or scored as a scam"
  - "runTurn.ts: Claude is invoked again on every turn while state:'verifying', to keep risk.score/risk.tactics live for the dashboard/stage view -- its reply is never spoken and it can never move state away from 'verifying'"
  - "CallDoc.outcome gains 'known'/'message'; CallDoc.message; RiskTurn.recommendedAction gains 'message'; runTurn's RunTurnResult gains endReason so a message-taking end_call is never mislabeled 'scam_detected'"
  - "outcomeBadge/AppPlaceholder/Stage: 'Known caller' (green) and 'Message taken' (new blue 'info' tone) outcome language, plus a Stage banner override and an /app known-caller name line"
affects: ["05-02", "05-03", "pitch-day runbook", "any future phase touching runTurn.ts's recommendedAction union"]

actuals:
  tokens: 16550
  tasks: 6
  commits: 5
  plan_head_before: 5ee26b24d05eef28eeada2eccfd6a5857e9c6328

tech-stack:
  added: []
  patterns:
    - "Allowlist pass-through resolves BEFORE the call doc is even created (in elevenlabsPersonalization.ts, at ring time) rather than as a risk-scoring outcome -- a known caller never enters the screening/risk-scoring path at all."
    - "slugifyName() (packages/shared/households.ts) derives a verification.memberId for an allowlist entry that can never collide with a real household member's id, so the allowlist path can never accidentally clear or overwrite a real member's prompts/{memberId} doc."
    - "'message' is an in-progress recommendedAction (like 'continue') until the model's structured output actually populates a nullable `message` object on the SAME turn -- finalization (state:'ended', outcome:'message', endedAt) only happens once that object is non-null, mirroring the existing claimedIdentity carry-forward pattern."
    - "Scoring-while-holding: once state:'verifying', Claude is called again every turn but ONLY its risk/tactics fields are trusted -- state and the spoken reply are hardcoded, so a live-call freelancing bug (02-FIX2) can't recur even with the model back in the loop."
    - "endCall boolean split into endCall + endReason on RunTurnResult, so elevenlabsCustomLlm.ts's end_call tool call can label a scam-block end and a message-taking end distinctly instead of a single hardcoded 'scam_detected' string."

key-files:
  created:
    - functions/src/screening/matchAllowlist.ts
    - functions/src/screening/elevenlabsPersonalization.test.ts
    - scripts/seed-allowlist.mjs
  modified:
    - packages/shared/src/calls.ts
    - packages/shared/src/households.ts
    - functions/src/demo/resetDemo.ts
    - functions/src/screening/runTurn.ts
    - functions/src/screening/runTurn.test.ts
    - functions/src/screening/elevenlabsPersonalization.ts
    - functions/src/screening/elevenlabsCustomLlm.ts
    - functions/src/screening/elevenlabsCustomLlm.test.ts
    - functions/src/lamp.ts
    - functions/src/screening/riskSchema.ts
    - functions/src/screening/prompt.ts
    - apps/web/src/lib/outcomeBadge.ts
    - apps/web/src/lib/outcomeBadge.test.ts
    - apps/web/src/pages/AppPlaceholder.tsx
    - apps/web/src/pages/Stage.tsx

key-decisions:
  - "Allowlist matching is case-sensitive/exact E.164 string equality against households/{id}.allowlist -- no normalization, no fuzzy match -- mirroring matchIdentity.ts's own plain-string-match philosophy for RISK-03."
  - "The allowlist entry's memberId is a slug of its name (slugifyName), deliberately distinct from a real household member's id, so it can never collide with -- and accidentally clear or overwrite -- a real member's prompts/{memberId} doc via mirrorActiveCallToLamp's PROMPT_CLEAR_STATES write."
  - "Since ElevenLabs' dashboard-configured first message is static and cannot itself be personalized per-call, the known-caller greeting is spoken from elevenlabsCustomLlm.ts's own first turn (via a direct calls/{id} read for outcome:'known' + no endedAt) rather than attempting to template the dashboard's first message -- true call-bridging to a real family member is explicitly out of scope for tonight's demo."
  - "'message' finalization requires the model to have ALREADY produced non-null message content on this turn -- it is not finalized on the SAME turn it is first recommended, so the screener always gets at least one turn to ask for/confirm the content before the call ends. Verified live: a caller who stated content + callback in one utterance was finalized in a single turn (the model chose to confirm inline); a caller who did not get a confirmation question first, then finalized on the next turn once they confirmed."
  - "No separate server-side verification timeout was added to runTurn.ts. Per the task's own explicit alternative, the /verify page's existing 20s client-side countdown (verifyCountdown.ts / Verify.tsx) already auto-answers 'timeout' on expiry, and answerVerification.ts already treats a 'timeout' answer identically to 'no' (state:'scam'). State only ever leaves 'verifying' via that real family verdict -- runTurn's own Claude re-invocation while verifying is scoring-only and structurally cannot change state."
  - "RunTurnResult gained an optional `endReason` ('scam_detected' | 'message_taken') discovered as a Rule 1 bug during live verification: elevenlabsCustomLlm.ts's end_call tool call originally hardcoded reason:'scam_detected' for EVERY endCall:true, which would have mislabeled a benign message-taking end. Fixed in the same plan rather than deferred, since it directly affects DEMO-01's/RISK-04's transcript accuracy."

requirements-completed: []

coverage:
  - id: D1
    description: "households/{id}.allowlist schema (E.164/name/relation) is seeded live in production households/demo (via scripts/seed-allowlist.mjs, Firestore REST + ADC) and restored by resetDemo's baseline and runTurn's fallback seed"
    verification:
      - kind: other
        ref: "Live: `node scripts/seed-allowlist.mjs` PATCHed households/demo.allowlist on porchlight-hack; a follow-up GET confirmed the entry present AND members[] untouched. After `pnpm demo:reset`, a second GET confirmed households/demo.allowlist survived the reset (baseline now includes it)."
        status: pass
    human_judgment: false
  - id: D2
    description: "An allowlisted caller_id short-circuits screening: the call doc is created already state:'verified'/outcome:'known' with verification.method:'allowlist', dynamic_variables.caller_name/known_caller are returned, and the ElevenLabs agent's first Custom LLM turn speaks a personalized goodbye + end_call instead of ever invoking runTurn; the lamp mirror shows green with the caller's first name"
    verification:
      - kind: unit
        ref: "functions/src/screening/elevenlabsPersonalization.test.ts (5 tests: allowlist match creates verified/known doc with slugified memberId, no collision with a real member id, exact-match-only, no-allowlist household falls back to screening); functions/src/screening/elevenlabsCustomLlm.test.ts (5 new tests: known-caller finalize with end_call + personalized goodbye, name-lookup fallback via households.allowlist, Tier 3 adoption of a state:'verified' webhook doc, no double-finalize once endedAt is set)"
        status: pass
      - kind: other
        ref: "Live against porchlight-hack: POST to elevenlabsPersonalization with caller_id:+14014979735 returned known_caller:true/caller_name:'Brenden' and created a calls/{id} doc with state:'verified'/outcome:'known'; the feed mirror and lamp/current (state:'verified', name:'Brenden') matched; a follow-up POST to elevenlabsCustomLlm with that call_doc_id returned an end_call tool call with message \"Hi Brenden, Margaret's family knows you — I'll let her know you called. Goodbye for now.\" and the transcript + endedAt landed on the same doc. Test docs deleted after."
        status: pass
    human_judgment: false
  - id: D3
    description: "A benign unknown caller (pharmacy, delivery, neighbor, etc. -- no family claim, no urgency/secrecy/payment) gets a message taken (text + optional callback) instead of being held for verification or scored as a scam; the call ends with state:'ended'/outcome:'message' once the message is confirmed"
    verification:
      - kind: unit
        ref: "functions/src/screening/runTurn.test.ts (3 new tests: stays in-progress while message content is still being gathered, finalizes state/outcome/message+callback in the same write once confirmed, omits the callback key entirely -- never null/undefined -- when the caller had none); functions/src/screening/elevenlabsCustomLlm.test.ts (1 new test: end_call reason is 'message_taken', never 'scam_detected')"
        status: pass
      - kind: other
        ref: "Live against porchlight-hack: a scripted Walgreens-prescription caller was asked a confirming question on turn 1 (not finalized), then finalized on turn 2 with end_call reason:'message_taken' after confirming; the resulting doc held state:'ended', outcome:'message', message:{text:\"Walgreens has a prescription ready for pickup.\", callback:\"401-555-0100\"}, and endedAt -- confirmed on both calls/{id} and the feed mirror. Test doc deleted after."
        status: pass
    human_judgment: false
  - id: D4
    description: "While a call is state:'verifying' (held for family verification), risk.score/risk.tactics keep refreshing from Claude on every further caller turn, but the spoken reply stays the fixed hold line and recommendedAction/state can never change except via answerVerification's real yes/no/timeout verdict"
    verification:
      - kind: unit
        ref: "functions/src/screening/runTurn.test.ts: rewrote the 02-FIX2 regression test to mock a SECOND Claude turn during verification (higher risk score, a different recommendedAction, and a reply that must never be spoken) and assert Claude WAS invoked (mockParse called twice), the spoken reply stayed 'Still checking, please hold.', state stayed 'verifying', recommendedAction stayed locked at 'verify', and risk.score/tactics updated to the new mocked values"
        status: pass
    human_judgment: false
  - id: D5
    description: "Dashboard (/app) and stage (/stage) surface the new outcomes: outcomeBadge maps 'known'->green \"Known caller\" and 'message'->a new blue 'info' tone \"Message taken\"; /app's live panel and the stage banner both name the allowlisted caller instead of a generic \"Claims to be\" line; the stage's persistent state banner reads 'KNOWN CALLER'/'MESSAGE TAKEN' for those outcomes; the existing green 'verified' full-bleed takeover is unchanged"
    verification:
      - kind: unit
        ref: "apps/web/src/lib/outcomeBadge.test.ts (2 new tests: known -> success/'Known caller', message -> info/'Message taken')"
        status: pass
      - kind: manual_procedural
        ref: "Not visually screenshotted this session (backend-focused plan, no preview server running) -- code paths verified by type-checking + the badge/label unit tests above; recommend a quick /app + /stage visual pass ahead of the live demo to confirm the blue badge and banner text render as intended."
        status: unknown
    human_judgment: true
    rationale: "Visual rendering (exact badge color, banner legibility from the back of a room) is a judgment call the unit tests can't make -- recommend a human glance at /app and /stage before the pitch."
  - id: D6
    description: "All tests green (57 pre-existing + this plan's new tests = 70 functions tests, 13 web tests), pnpm -r typecheck/build exit 0, functions + hosting deployed to porchlight-hack, live-verified via curl for both the known-caller and message-taking flows, test docs cleaned up, and pnpm demo:reset run successfully with the allowlist surviving the reset"
    verification:
      - kind: unit
        ref: "pnpm --filter functions test: 70/70 pass (9 test files); pnpm --filter web test: 13/13 pass (2 test files)"
        status: pass
      - kind: other
        ref: "pnpm -r typecheck: 0 errors (3 packages). pnpm -r build: exit 0 (functions esbuild + vite build). firebase deploy --only functions:elevenlabsCustomLlm,functions:elevenlabsPersonalization,functions:mirrorActiveCallToLamp,functions:resetDemo,hosting --project porchlight-hack: exit 0, both function URLs printed, hosting release complete. pnpm demo:reset (after copying scripts/.demo.env into this worktree): {\"callsDeleted\":1,\"promptsCleared\":2} -- households/demo.allowlist confirmed present afterward, lamp/current confirmed idle, calls collection confirmed empty."
        status: pass
    human_judgment: false

duration: 80min
completed: 2026-09-22
status: complete
---

# Phase 05 Extra: Allowlist Pass-Through, Message-Taking, Live Verify Scoring Summary

**Known numbers skip screening entirely (green lamp + personalized goodbye), benign strangers get a message taken instead of a hold-or-hangup verdict, and risk scoring keeps running live while a call is on hold for family verification -- without reopening the exact freelancing bug 02-FIX2 fixed.**

## Performance

- **Duration:** ~80 min (codebase read, schema design, 4 feature commits across allowlist/message/scoring/UI, live production verification via curl against porchlight-hack catching and fixing a labeling bug, deploy x2, cleanup, this summary)
- **Tasks:** 6/6
- **Files modified:** 18 files, 5 feature/fix commits + this docs commit

## Accomplishments

- **Allowlist pass-through (Task 1+2):** `households/{id}.allowlist` (E.164/name/relation) is now a real, seeded field in production `households/demo` -- seeded live via a new `scripts/seed-allowlist.mjs` (Firestore REST API + `gcloud auth application-default` ADC token, no service-account credential file needed, matching `demo-reset.mjs`'s own "no Admin SDK needed" convention) and restored by `resetDemo`'s baseline and `runTurn`'s fallback seed. `elevenlabsPersonalization.ts` now checks the allowlist via a new `matchAllowlist.ts` helper before creating the call doc: a match creates it already `state:'verified'`/`outcome:'known'` with `verification.method:'allowlist'` and a slugified, collision-safe `memberId` (via a new shared `slugifyName()`), and returns `dynamic_variables.caller_name`/`known_caller` for the ElevenLabs dashboard. Since the dashboard's first message is static and can't itself be personalized per call, `elevenlabsCustomLlm.ts`'s own first turn now finalizes a known-caller doc with a spoken, honest goodbye line and `end_call` -- verified live end-to-end against `porchlight-hack` (personalization -> verified/known doc -> feed mirror -> `lamp/current` green with "Brenden" -> Custom LLM first turn -> personalized `end_call`).
- **"Take a message" (Task 3):** `RiskTurn.recommendedAction` gained `'message'`, paired with a new nullable `message: {text, callback}` structured-output field. The prompt now instructs the screener to recognize benign, no-claim, no-urgency/secrecy/payment callers (pharmacy, delivery, neighbor, scheduling) and gather + confirm a message before finalizing. `runTurn.ts` only finalizes (`state:'ended'`, `outcome:'message'`, `endedAt`, the call's `message` field) once the model has actually produced non-null message content on a turn -- verified live with a real two-turn flow (confirming question, then finalize) and a real single-turn flow (caller volunteered everything at once, model finalized immediately).
- **Live scoring during verification (Task 4):** `runTurn.ts` now calls Claude again on every caller turn while `state:'verifying'` -- previously skipped entirely per 02-FIX2 -- but ONLY trusts the refreshed `risk.score`/`risk.tactics`; the spoken reply is always the fixed hold line and `recommendedAction` is hardcoded to `'verify'`, so the exact live freelancing bug 02-FIX2 fixed (the model promising to "get Margaret on the phone") cannot recur even with the model back in the loop. No separate server-side timeout was added: the `/verify` page's existing 20s client countdown already auto-answers `'timeout'`, which `answerVerification` already treats as a `'no'` verdict.
- **Dashboard/stage UI (Task 5):** `outcomeBadge.ts` maps `'known'` to a green "Known caller" badge and `'message'` to a new blue `'info'`-tone "Message taken" badge (layered on top of the existing Badge component's `secondary` variant with a Tailwind color class, since the shared component has no native blue). `/app`'s live panel and history rows, and `/stage`'s persistent banner, all surface the new outcomes by name instead of a generic state label; the existing green `'verified'` full-bleed takeover is untouched.
- **Bug caught and fixed during live verification (Rule 1):** `elevenlabsCustomLlm.ts`'s `end_call` tool call originally hardcoded `reason:'scam_detected'` for every `endCall:true`, which would have mislabeled a benign message-taking end identically to a scam block. Added `RunTurnResult.endReason` so the two are now labeled distinctly (`'scam_detected'` vs `'message_taken'`) -- caught live (a real message-taking call reported `reason:'scam_detected'`), fixed, redeployed, and re-verified live with the correct label.
- **Full test suite green:** 70/70 functions tests (57 pre-existing + 13 new/updated), 13/13 web tests, `pnpm -r typecheck`/`build` both exit 0. Deployed `elevenlabsCustomLlm`, `elevenlabsPersonalization`, `mirrorActiveCallToLamp`, `resetDemo`, and hosting to `porchlight-hack`. All live test artifacts (3 `calls/*` + matching `feed/*` docs) deleted after verification; `pnpm demo:reset` run successfully afterward (`{"callsDeleted":1,"promptsCleared":2}`), with the allowlist confirmed to survive the reset.

## Task Commits

1. **Task 1: allowlist + message-taking schema, seed known caller** - `1b6e77f` (feat)
2. **Task 2: allowlist pass-through, greet by name** - `d3463ba` (feat)
3. **Task 3 + Task 4: take-a-message flow + live scoring while verifying** - `5acf817` (feat)
4. **Task 5: dashboard + stage UI for known-caller/message outcomes** - `1679358` (feat)
5. **Task 6 (live-verification fix): label message-taking end_call distinctly from scam block** - `ac2121f` (fix)

**Plan metadata:** (this commit, immediately following)

## Files Created/Modified

- `functions/src/screening/matchAllowlist.ts` (new) -- E.164 allowlist lookup, mirrors `matchIdentity.ts`'s pattern
- `functions/src/screening/elevenlabsPersonalization.test.ts` (new) -- 5 tests for the allowlist pass-through
- `scripts/seed-allowlist.mjs` (new) -- one-off/re-runnable production seed via Firestore REST + ADC
- `packages/shared/src/calls.ts`, `packages/shared/src/households.ts` -- schema extensions (allowlist, outcome:'known'/'message', message field, recommendedAction:'message', slugifyName)
- `functions/src/demo/resetDemo.ts`, `functions/src/screening/runTurn.ts` -- allowlist baseline kept in sync across all 3 seed locations
- `functions/src/screening/runTurn.ts`, `runTurn.test.ts` -- message-taking finalize logic + scoring-while-verifying + endReason
- `functions/src/screening/elevenlabsPersonalization.ts`, `elevenlabsCustomLlm.ts` (+ both `.test.ts`) -- allowlist pass-through, known-caller first-turn finalize, endReason labeling
- `functions/src/lamp.ts` -- allowlist-aware name resolution for the Pi lamp mirror
- `functions/src/screening/riskSchema.ts`, `prompt.ts` -- 'message' action + RiskMessage schema + prompt guidance
- `apps/web/src/lib/outcomeBadge.ts` (+ `.test.ts`), `apps/web/src/pages/AppPlaceholder.tsx`, `Stage.tsx` -- known-caller/message-taken UI language

## Decisions Made

See `key-decisions` in frontmatter above -- summarized: exact-match allowlist lookup (no fuzzy matching); a collision-safe slugified memberId for allowlist entries; the known-caller greeting is spoken from the Custom LLM endpoint's own first turn rather than the (static) dashboard first message, with true call-bridging explicitly out of scope; message finalization requires confirmed content on the SAME turn it's written, not just the first "message" recommendation; no new server-side verification timeout, relying on the existing 20s client countdown; and a same-plan fix for a `reason` mislabeling bug caught during live verification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `end_call` reason mislabeled 'scam_detected' for a message-taking end**
- **Found during:** Task 6 live verification (the "message" flow curl test)
- **Issue:** `elevenlabsCustomLlm.ts` hardcoded `reason: 'scam_detected'` in every `end_call` tool call, regardless of why `runTurn` set `endCall:true` -- a benign message-taking end would have been reported identically to an actual scam block.
- **Fix:** Added `RunTurnResult.endReason?: 'scam_detected' | 'message_taken'`, set correctly at both `runTurn.ts` return sites (the idempotent-retry short-circuit and the main finalize path), and consumed in `elevenlabsCustomLlm.ts` (`reason: endReason ?? 'scam_detected'`).
- **Files modified:** `functions/src/screening/runTurn.ts`, `functions/src/screening/elevenlabsCustomLlm.ts`, plus new/updated tests in both `.test.ts` files.
- **Commit:** `ac2121f` (fix) -- committed separately, ahead of the redeploy + live re-verification that confirmed the corrected `'message_taken'` label.

### Scope notes (disclosed per Rule 4 boundary -- not code changes)

- **True call-bridging for a known caller is out of scope.** The known-caller flow speaks an honest "I'll let Margaret know you called" goodbye and ends the call -- it does not transfer the caller to a live person. This matches the phase's own stated scope ("true bridging is out of scope") and CLAUDE.md's 3-minute demo-script constraint.
- **No separate server-side 60s verification timeout.** Per the task's own explicit alternative, this relies entirely on the `/verify` page's existing 20s client-side countdown (`verifyCountdown.ts`), which already auto-answers `'timeout'` and is already treated as a `'no'` verdict by `answerVerification.ts`. If the family member's phone loses connectivity mid-verification, the call would hold indefinitely server-side rather than timing out on the backend -- an accepted risk for tonight's demo, same class as the personalization webhook's already-accepted no-bearer-auth risk (T-02-07).

## Threat Flags

| Flag | File | Description |
|------|------|--------------|
| threat_flag: spoofable-trust-boundary | `functions/src/screening/elevenlabsPersonalization.ts` / `matchAllowlist.ts` | The allowlist pass-through trusts the caller's `caller_id` field from ElevenLabs' personalization webhook payload with no cryptographic verification. Telephone Caller ID is well-known to be spoofable; an attacker who spoofs `+14014979735` would be granted the full allowlist bypass (`state:'verified'`, lamp green, no risk scoring) exactly as a real call from that number would. Accepted for tonight's one-night demo (same risk class as T-02-07's already-accepted no-bearer-auth personalization webhook) -- would need carrier-level STIR/SHAKEN attestation data (if ElevenLabs/Twilio ever surface it) or a secondary factor before any real-world use. |

## Issues Encountered

None blocking. The `endReason` mislabeling above was caught and fixed within this same plan before the final live re-verification, not deferred.

## User Setup Required

None. `households/demo.allowlist` is already seeded in production; `scripts/seed-allowlist.mjs` is re-runnable if the allowlist ever needs to be reseeded (e.g. after a Firestore export/import) without a full `pnpm demo:reset`.

## Next Phase Readiness

`elevenlabsCustomLlm`, `elevenlabsPersonalization`, `mirrorActiveCallToLamp`, and `resetDemo` are redeployed to `porchlight-hack` with all four capabilities live and verified end-to-end against real production Firestore: (a) an allowlisted number rings in already verified with a personalized goodbye, (b) a benign unknown caller can have a message taken instead of being held or blocked, (c) risk scoring keeps updating live while a call is held for family verification, and (d) the dashboard/stage surfaces both new outcomes distinctly. Recommend a quick visual pass on `/app` and `/stage` before the live pitch to confirm the new blue "Message taken" badge and stage banner text render as intended (D5's `human_judgment: true` item above) -- no code risk expected, just an unverified visual.

---
*Phase: 05-attack-simulator-demo-hardening-and-pitch*
*Completed: 2026-09-22*

## Self-Check: PASSED

All 18 created/modified files (plus this SUMMARY.md) confirmed present on disk via `[ -f "$f" ]`. All 5 task commits (`1b6e77f`, `d3463ba`, `5acf817`, `1679358`, `ac2121f`) confirmed present via `git log --oneline`. `pnpm --filter functions test`: 70/70 pass. `pnpm --filter web test`: 13/13 pass. `pnpm -r typecheck`: 0 errors. `pnpm -r build`: exit 0. Live deployment confirmed via `firebase deploy --only functions:elevenlabsCustomLlm,functions:elevenlabsPersonalization,functions:mirrorActiveCallToLamp,functions:resetDemo,hosting --project porchlight-hack` (exit 0). Live verification: allowlist pass-through (verified/known doc + feed mirror + lamp green/"Brenden" + personalized end_call), take-a-message flow (two-turn confirm-then-finalize, message+callback stored, correctly labeled `end_call` reason after the endReason fix), all confirmed against real production Firestore on `porchlight-hack`. All 3 live test call docs (and their feed mirrors) deleted afterward; `pnpm demo:reset` run successfully (`{"callsDeleted":1,"promptsCleared":2}`) with `households/demo.allowlist` confirmed to survive the reset and `lamp/current`/`calls` confirmed clean afterward.
