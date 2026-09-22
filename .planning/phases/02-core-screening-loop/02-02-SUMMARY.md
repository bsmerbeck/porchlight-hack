---
phase: 02-core-screening-loop
plan: 02
subsystem: telephony
tags: [elevenlabs, custom-llm, twilio, firebase-functions-v2, vitest, sse]

# Dependency graph
requires:
  - phase: 02-core-screening-loop (Plan 01)
    provides: "runTurn() shared per-turn screening core, DEMO_HOUSEHOLD_ID, secrets.ts pattern"
provides:
  - "elevenlabsCustomLlm: the ElevenLabs agent's entire brain -- OpenAI-compatible /v1/chat/completions endpoint, bearer-gated, wired to runTurn(), SSE + end_call tool emission"
  - "elevenlabsPersonalization: call-start webhook creating calls/{id} + providerCallId capture"
  - "endCall.ts: forceEndCall/releaseCall/forceVerdict -- Twilio REST call control for external verdicts (CALL-04 debug/demo path)"
  - "Live deployment of all three functions to porchlight-hack, curl-verified end-to-end (auth gate + real Claude turn + Firestore write)"
  - "Fixed a production-breaking bug in runTurn() (02-01) that crashed on every turn with a null claimedIdentity"
affects: ["02-03-post-call-and-forced-verdict", "phase-4-dashboard"]

actuals:
  tokens: 11900
  tasks: 2
  commits: 4

tech-stack:
  added: ["twilio@6.1.1"]
  patterns:
    - "SSE framing centralized in sse.ts (sseChunk/sseToolCall/sseDone) -- the one place the ElevenLabs wire-format bug surface lives, per 02-RESEARCH.md's Don't-Hand-Roll table"
    - "Firestore Admin SDK rejects explicit `undefined` field values (no ignoreUndefinedProperties configured) -- always omit an optional key entirely rather than writing `key: value ?? undefined`. Two independent instances of this bug were found and fixed live in this plan (elevenlabsPersonalization.providerCallId, runTurn.risk.claimedIdentity)."
    - "Twilio call-control TwiML built via a single updateCallWithSay(callSid, sayLine, hangup) helper in endCall.ts -- forceEndCall always hangs up, releaseCall never does, same escapeXml() path for both"

key-files:
  created:
    - functions/src/screening/sse.ts
    - functions/src/screening/elevenlabsCustomLlm.ts
    - functions/src/screening/elevenlabsCustomLlm.test.ts
    - functions/src/screening/elevenlabsPersonalization.ts
    - functions/src/screening/endCall.ts
    - functions/src/screening/endCall.test.ts
  modified:
    - functions/src/index.ts
    - functions/src/secrets.ts
    - functions/package.json
    - functions/src/screening/runTurn.ts
    - functions/src/screening/runTurn.test.ts

key-decisions:
  - "Split forceEndCall (always <Hangup/>) from releaseCall's internal updateCallWithSay(...,hangup:false) instead of one function with an ambiguous 'end' name that sometimes doesn't hang up -- matches the plan's own distinction between a scam ending and a verified hand-off."
  - "elevenlabsCustomLlm derives callId with a 3-tier fallback (elevenlabs_extra_body.call_doc_id -> regex against the system message -> a fresh call-doc id) rather than failing the turn when Open Question 2's round-trip mechanism turns out not to carry the id automatically -- a caller must never hit dead air over a plumbing gap."
  - "Fixed two live-discovered Firestore 'explicit undefined' crashes (elevenlabsPersonalization.providerCallId when call_sid is absent/empty; runTurn.risk.claimedIdentity when null) rather than deferring them -- both are on the direct causal path of this plan's own must_haves truth ('produces a spoken reply via runTurn with no dead-air fallback') and were only found because Task 3's curl verification exercised real (non-mocked) Firestore, unlike 02-01/02-02's unit tests."
  - "Did NOT attempt to fix the ANTHROPIC_API_KEY workspace-scoping error (see Issues Encountered) -- resolving it requires either a new workspace-scoped key or a workspace ID, both obtainable only via the Anthropic console (no CLI/API path available in this environment); logged as a WINDOWS.md deviation entry instead of guessing."

patterns-established:
  - "Any optional Firestore field must be added to an update payload via an `if (value) obj.key = value` guard, never `key: value ?? undefined` -- the fake Firestore mocks used across this codebase's Vitest suites accept undefined silently, so this class of bug is invisible to unit tests and only surfaces against real deployed Firestore."

requirements-completed: [CALL-01, CALL-02, CALL-04]

coverage:
  - id: D1
    description: "elevenlabsCustomLlm: ELEVENLABS_LLM_TOKEN bearer check runs before runTurn ever executes; authenticated turns stream runTurn's reply as a single SSE chunk (+ end_call tool_calls delta when recommendedAction==='end'); any thrown error degrades to a spoken fallback line, never a bare 500 or dead air"
    requirement: "CALL-02"
    verification:
      - kind: unit
        ref: "functions/src/screening/elevenlabsCustomLlm.test.ts (6 tests: 401 on missing/wrong bearer with runTurn never invoked, correct-auth turn wiring + single SSE chunk, end_call tool_calls emission, wire-shape lock -- no SYSTEM_PROMPT/raw-model-object leakage, fallback-on-throw)"
        status: pass
      - kind: other
        ref: "Live curl against the deployed us-central1-porchlight-hack.cloudfunctions.net/elevenlabsCustomLlm: no auth -> 401; valid bearer + OpenAI-shaped body -> SSE stream with a spoken reply and a Firestore write containing both turns (verified via Firestore REST read of calls/curl-test-2)"
        status: pass
    human_judgment: false
  - id: D2
    description: "elevenlabsPersonalization: call-start webhook creates calls/{id} (D-05 schema, provider:'elevenlabs', providerCallId captured when present) and responds dynamic_variables.call_doc_id"
    requirement: "CALL-01"
    verification:
      - kind: unit
        ref: "functions/src/screening/endCall.test.ts > elevenlabsPersonalization (1 test: creates the doc + responds with the new id)"
        status: pass
      - kind: other
        ref: "Live curl against the deployed elevenlabsPersonalization URL, both with and without call_sid -- both return 200 with dynamic_variables.call_doc_id after the Task-3-discovered undefined-value fix"
        status: pass
    human_judgment: false
  - id: D3
    description: "endCall.ts: forceEndCall/releaseCall/forceVerdict end or release a real call via Twilio REST with the correct spoken TwiML and write state/outcome/endedAt using the same field names as runTurn's AI-initiated end path; simulator-provenance docs (no providerCallId) never touch the Twilio client"
    requirement: "CALL-04"
    verification:
      - kind: unit
        ref: "functions/src/screening/endCall.test.ts > forceVerdict (3 tests: scam verdict hangs up + writes fields, verified verdict releases with a non-hangup 'put you through' line, simulator doc never invokes Twilio)"
        status: pass
    human_judgment: false
  - id: D4
    description: "ElevenLabs dashboard wired end-to-end: static first_message greeting, Custom LLM Server URL + matching secret, personalization webhook, end_call system tool present, Twilio number imported and assigned"
    requirement: "CALL-01"
    verification: []
    human_judgment: true
    rationale: "Dashboard-only configuration in a third-party vendor UI (ElevenLabs) -- not automatable from this CLI-only execution environment. All exact values/URLs the human needs are recorded below under Human Follow-up; the IAM/reachability half of Task 3's verify (curl -> 401, not 403/connection-error) was performed and passed."
  - id: D5
    description: "A real phone call to the Porchlight number produces a live-updating calls/{id} doc through the greeting + multiple scripted turns"
    requirement: "CALL-02"
    verification: []
    human_judgment: true
    rationale: "Requires an actual phone call and the dashboard wiring in D4 to exist first -- outside this execution environment's capability. Endpoint-level equivalents (curl with a real OpenAI-shaped body, live Firestore read showing the write) were performed and passed as a proxy; see coverage D1."

duration: 55min
completed: 2026-09-22
status: complete
---

# Phase 2 Plan 2: ElevenLabs Custom LLM, Personalization Webhook, Call Control Summary

Wired 02-01's proven `runTurn()` core into three deployed, live-curl-verified Cloud Functions (`elevenlabsCustomLlm`, `elevenlabsPersonalization`, `forceVerdict`) — and, along the way, found and fixed two production-breaking "Firestore rejects `undefined`" bugs (one in this plan's own code, one in 02-01's `runTurn.ts`) that unit tests never caught because their fake Firestore mocks silently accept what the real SDK rejects.

## Performance

- **Duration:** ~55 min
- **Started:** 2026-09-22T02:45:00Z (approx.)
- **Completed:** 2026-09-22T03:40:00Z
- **Tasks:** 2/2 automated tasks completed + Task 3's automatable half (deploy + IAM/reachability curl check); Task 3's dashboard wiring and Task 4's live phone call are human-only checkpoints, prepared but not performed per dispatch instructions
- **Files modified:** 11 files (6 created, 5 modified), 4 commits

## Accomplishments
- `sse.ts` centralizes all OpenAI-compatible SSE framing (`sseChunk`/`sseToolCall`/`sseDone`) so the wire-format bug surface lives in one file, not three.
- `elevenlabsCustomLlm` is the agent's entire brain: `ELEVENLABS_LLM_TOKEN` bearer check runs before `runTurn` is ever called (T-02-05); a 3-tier `call_doc_id` derivation (extra_body -> system-message regex -> fresh doc) means a plumbing gap never produces dead air; `end_call` tool emission matches `recommendedAction:'end'`; any thrown error degrades to a spoken fallback line, never a bare 500.
- `elevenlabsPersonalization` creates the `calls/{id}` doc at ring time (D-05 schema) and captures the Twilio CallSid as `providerCallId`, responding with `dynamic_variables.call_doc_id`.
- `endCall.ts` gives `forceVerdict` (debug/demo path, T-02-09 accepted risk) a real Twilio REST hangup/release mechanism, reusing the exact `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` `SecretParam` objects from Phase 1/`secrets.ts` — no duplicate `defineSecret`.
- All three functions deployed live to `porchlight-hack` and curl-verified end-to-end: unauthenticated `elevenlabsCustomLlm` -> 401 (not 403/connection error, proving both reachability and the auth gate); a valid bearer + OpenAI-shaped turn request -> a real SSE reply AND a Firestore write with both turns present (confirmed via Firestore REST read).
- **Found and fixed two production-breaking bugs live**, neither caught by any existing unit test because the fake Firestore mocks accept `undefined` values the real SDK rejects:
  1. `elevenlabsPersonalization`'s `providerCallId: call_sid` threw 500 whenever `call_sid` was absent/empty (confirmed via curl before/after).
  2. `runTurn.ts`'s `risk.claimedIdentity: turn.claimedIdentity ?? undefined` threw on **every turn** where the caller hadn't yet stated a name (the common case, including every call's first turn) — this was silently routing every live turn to `elevenlabsCustomLlm`'s outer fallback line instead of a real screened reply. Added a regression test (`runTurn.test.ts`) that deep-scans the actual `update()` payload for any explicit `undefined`.

## Task Commits

Each task was committed atomically:

1. **Task 1: elevenlabsCustomLlm — bearer auth, turn wiring, SSE, end_call tool** - `2792fea` (feat)
2. **Task 2: Personalization webhook + Twilio-backed end/release + forceVerdict** - `58ea67d` (feat)
3. **Live-verification bug fix: elevenlabsPersonalization 500 on missing call_sid** - `c2668a7` (fix)
4. **Live-verification bug fix: runTurn() undefined claimedIdentity crash** - `6522bbe` (fix)

**Plan metadata:** (this commit, immediately following)

## Files Created/Modified
- `functions/src/screening/sse.ts` - OpenAI-compatible SSE framing helpers
- `functions/src/screening/elevenlabsCustomLlm.ts` - the agent's entire brain, bearer-gated, wired to `runTurn`
- `functions/src/screening/elevenlabsCustomLlm.test.ts` - 6 Vitest cases (auth, wiring, end_call, wire-shape lock, fallback)
- `functions/src/screening/elevenlabsPersonalization.ts` - call-start webhook, creates `calls/{id}`
- `functions/src/screening/endCall.ts` - `forceEndCall`/`releaseCall`/`forceVerdict`
- `functions/src/screening/endCall.test.ts` - 4 Vitest cases (forceVerdict x3, elevenlabsPersonalization x1)
- `functions/src/index.ts` - exports `elevenlabsCustomLlm`/`elevenlabsPersonalization`/`forceVerdict`/`elevenLabsLlmToken`
- `functions/src/secrets.ts` - added `elevenLabsLlmToken = defineSecret('ELEVENLABS_LLM_TOKEN')`
- `functions/package.json` - added `twilio@6.1.1`
- `functions/src/screening/runTurn.ts` - fixed the `undefined` `claimedIdentity` Firestore crash (02-01 bug, found live)
- `functions/src/screening/runTurn.test.ts` - added a deep-scan-for-undefined regression test

## Decisions Made
See `key-decisions` in frontmatter above — summarized: split hang-up vs. non-hang-up TwiML into one shared helper; 3-tier `call_doc_id` fallback so plumbing uncertainty never produces dead air; fixed both live-discovered `undefined`-value crashes immediately (on the direct causal path of this plan's own truths) rather than deferring; did not attempt to fix the ANTHROPIC_API_KEY workspace-scoping issue (needs Anthropic console access, logged to WINDOWS.md instead).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `elevenlabsPersonalization` 500s when `call_sid` is absent/empty**
- **Found during:** Task 3's post-deploy curl verification
- **Issue:** `providerCallId: call_sid` wrote an explicit Firestore `undefined` whenever `call_sid` was missing; the Admin SDK throws on this (no `ignoreUndefinedProperties`), producing a 500.
- **Fix:** Omit the `providerCallId` key entirely unless `call_sid` is truthy.
- **Files modified:** `functions/src/screening/elevenlabsPersonalization.ts`
- **Verification:** Live curl with `{}` body: 500 before, 200 with `dynamic_variables.call_doc_id` after; re-deployed and re-verified.
- **Committed in:** `c2668a7`

**2. [Rule 1 - Bug, cross-plan] `runTurn()` (02-01) crashes on every turn with a null `claimedIdentity`**
- **Found during:** Task 3's post-deploy curl verification against `elevenlabsCustomLlm`
- **Issue:** `risk.claimedIdentity: turn.claimedIdentity ?? undefined` wrote an explicit Firestore `undefined` whenever the caller hadn't stated a name yet (the default/common case) — the real Admin SDK throws on this, which was silently routing every live turn to `elevenlabsCustomLlm`'s outer fallback ("I'm sorry, could you say that again?") instead of ever reaching the real screened reply. 02-01's unit tests never caught this because `runTurn.test.ts`'s fake Firestore mock accepts `undefined` values silently.
- **Fix:** Omit the `claimedIdentity` key from the `risk` update object entirely instead of writing it as `undefined`. Added a regression test that deep-scans the real `update()` payload for any explicit `undefined` value.
- **Files modified:** `functions/src/screening/runTurn.ts`, `functions/src/screening/runTurn.test.ts` (02-01 files — this is a cross-plan fix, judged necessary because it sits directly on this plan's own must-have truth: "produces a spoken reply via runTurn with no dead-air fallback")
- **Verification:** `pnpm --filter functions test` (23/23 pass, including the new regression test); re-deployed `elevenlabsCustomLlm`; live curl re-verification shows the Firestore write now succeeds (both turns present, `risk.updatedAt` a real server timestamp) instead of the outer catch firing.
- **Committed in:** `6522bbe`

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bug), both discovered live during Task 3's curl verification and both on the direct causal path of the plan's own must-have truths. No scope creep — no functionality was added beyond what the plan specified; the second fix touches a 02-01 file but only to correct a bug that was silently breaking this plan's own deliverable.
**Impact on plan:** Both fixes were necessary for `elevenlabsCustomLlm` to ever produce a real screened reply (as opposed to a fallback line) on a live call. Without them, every real phone call would have silently degraded to "Could you say that again?" / "I'm sorry, could you say that again?" for its entire duration.

## Issues Encountered

**BLOCKING (not fixed, logged to `.planning/WINDOWS.md`): `ANTHROPIC_API_KEY` is not scoped to an Anthropic workspace.** Live curl verification (and the deployed `elevenlabsCustomLlm`) shows every `claude-haiku-4-5` call failing with:
```
400 invalid_request_error: "This API key is not scoped to a workspace, so this request must
include the anthropic-workspace-id header with the ID of the workspace to use."
```
This means **real risk-scoring is not currently functioning on live calls** — `runTurn()`'s own internal fallback (`fallbackTurn()`, reply "Could you say that again?") is firing on every turn instead of a real Claude-generated reply. This is NOT a dead-air failure (the plan's must-have truth about "no dead-air fallback" is satisfied — there's always a spoken line), but CALL-02's natural-conversation requirement and RISK-01/02/03 will not work for the live demo until this is fixed.
**Why not auto-fixed:** resolving it requires either (a) generating a new API key scoped to a specific Anthropic workspace, or (b) obtaining the workspace ID and passing it via an `anthropic-workspace-id` header (code change) — both require the Anthropic console (https://console.anthropic.com), which is outside this CLI-only execution environment's reach.
**Remediation (human, before the demo):**
1. Go to https://console.anthropic.com -> Settings -> Workspaces (or API Keys) and generate a new API key that IS scoped to a workspace (the simplest fix, no code change).
2. Rotate it: `printf '%s' "$NEW_KEY" | firebase functions:secrets:set ANTHROPIC_API_KEY --data-file=- --project porchlight-hack`
3. Redeploy so the new secret version binds: `firebase deploy --only functions:elevenlabsCustomLlm,functions:simulateTurn,functions:startSimulatedCall --project porchlight-hack` (the last two are 02-01's, not yet deployed — deploy them too before relying on `/sim` as a fallback).
4. Re-verify with the same curl recipe in "Live Verification Performed" below — a real risk-scored reply (not "Could you say that again?") confirms the fix.
This is logged as an **open** entry in `.planning/WINDOWS.md` (kind: `deviation`) so it stays visible until fixed.

**Test docs created in production Firestore during curl verification.** `calls/curl-test-1`, `calls/curl-test-2`, and two `calls/auto-N`-style docs created via the personalization webhook curl tests now exist in the live `porchlight-hack` Firestore. Harmless (junk `screening`-state docs, same shape as T-02-07's accepted risk) but worth a quick manual cleanup before the demo if a clean dashboard view matters: delete via the Firestore console or `gcloud firestore` if desired.

## User Setup Required

**Human follow-up — Task 3 (ElevenLabs dashboard wiring) and Task 4 (live test call), per dispatch instructions (do not block on these, values/steps prepared below):**

### ELEVENLABS_LLM_TOKEN (paste into the ElevenLabs dashboard)

```
70bc34b259cb735254c223b4607f2b4700ecb4c8ed46d42a5d21282612783684
```

This is a shared bearer token (32 random hex bytes), not a vendor credential — already stored in Firebase Secret Manager as `ELEVENLABS_LLM_TOKEN` and bound to `elevenlabsCustomLlm`. Paste this exact value into the ElevenLabs dashboard's Custom LLM secret field (step 3 below) so the two sides match.

### Deployed Function URLs

| Function | `*.cloudfunctions.net` form | `*.run.app` form |
|---|---|---|
| `elevenlabsCustomLlm` | `https://us-central1-porchlight-hack.cloudfunctions.net/elevenlabsCustomLlm` | `https://elevenlabscustomllm-178399043090.us-central1.run.app` |
| `elevenlabsPersonalization` | `https://us-central1-porchlight-hack.cloudfunctions.net/elevenlabsPersonalization` | `https://elevenlabspersonalization-178399043090.us-central1.run.app` |

Both confirmed reachable and correctly gated: unauthenticated `elevenlabsCustomLlm` -> `401` (not 403/connection error — no `gcloud run services add-iam-policy-binding` was needed, IAM already allows unauthenticated invocation); `elevenlabsPersonalization` POST -> `200` with `dynamic_variables.call_doc_id`.

### Exact dashboard steps (Task 3, plan's own action list)

1. ~~Deploy Functions~~ — done above; both endpoints curl-verified.
2. ElevenLabs dashboard -> Agents -> "PorchLight screener" -> Voice/Conversation tab -> set `first_message` to exactly: `Hi, this is Margaret's assistant. Who's calling?`
3. Agent -> LLM tab -> select **Custom LLM** -> Server URL = `https://us-central1-porchlight-hack.cloudfunctions.net/elevenlabsCustomLlm` -> Secrets -> Add Secret (type "Custom LLM") with value = the `ELEVENLABS_LLM_TOKEN` above.
4. Agent -> Advanced -> Webhooks -> add a Personalization webhook pointed at `https://us-central1-porchlight-hack.cloudfunctions.net/elevenlabsPersonalization`.
5. Agent -> Tools -> confirm `end_call` system tool is present (should already be, per Pitfall 4 — dashboard-created agents have it by default); add manually if missing.
6. Phone Numbers -> import the Twilio number `+14015861988` (already bought/upgraded, per live_state) using Twilio API Key SID/Secret or Account SID/Auth Token; assign the "PorchLight screener" agent to it.

### Task 4 — first live test call (once Task 3's dashboard steps are done)

Dial `+14015861988` from a personal phone. Confirm the greeting plays within ~2 rings. Speak each `JAIL_SCRIPT` line (from `@porchlight/shared`) in order, ~2s apart, watching the Firestore console's `calls/{id}` doc (most recent `startedAt`) for `turns[]` growing by 2 per line and `risk.score`/`tactics`/`claimedIdentity`/`recommendedAction` updating.

**IMPORTANT — fix the ANTHROPIC_API_KEY workspace-scoping issue (see Issues Encountered) BEFORE this test call**, or every turn will produce the generic fallback line ("Could you say that again?") instead of a real screened reply — CALL-01/CALL-03 (greeting + doc writes) will still work, but CALL-02/RISK-01..03 will not be demonstrable until the key is fixed.

Also note during the call: the actual inbound `Authorization`/`x-api-key` header ElevenLabs sends (Pitfall 5/Open Question 1 — code currently accepts either), and whether `call_doc_id` round-tripped via `elevenlabs_extra_body` automatically or needed the system-message-regex fallback (Open Question 2) — both are logged via `console.warn` in `elevenlabsCustomLlm.ts`, visible in Cloud Functions logs.

## Next Phase Readiness

02-03 (post-call + forced verdict UI wiring) can build directly on `endCall.ts`'s `forceVerdict`/`releaseCall`/`forceEndCall` — no changes needed there. Phase 4's dashboard can rely on `calls/{id}`'s `state`/`outcome`/`endedAt` being written identically regardless of which path ended the call (AI-initiated via `runTurn`, or external via `forceVerdict`). **Blocker for a fully-working live demo:** the `ANTHROPIC_API_KEY` workspace-scoping issue (see Issues Encountered / WINDOWS.md) must be fixed before Task 4's live test call will show real risk-scoring rather than the generic fallback line — this is the single highest-priority remaining item before demo time.

---
*Phase: 02-core-screening-loop*
*Completed: 2026-09-22*

## Self-Check: PASSED

All 6 created files verified present on disk (sse.ts, elevenlabsCustomLlm.ts/test.ts,
elevenlabsPersonalization.ts, endCall.ts/test.ts). All 4 commits (`2792fea`, `58ea67d`,
`c2668a7`, `6522bbe`) confirmed present via `git log --oneline --all`. Plan-level
`<verification>` re-run: `pnpm --filter functions test` (23/23 pass across all 4 spec
files); `pnpm --filter functions build` (exits 0, bundle exports `elevenlabsCustomLlm`/
`elevenlabsPersonalization`/`forceVerdict` confirmed via `node -e require(...)`);
`pnpm -r typecheck` and `pnpm -r build` both exit 0. Deployed-endpoint checks: both
`*.cloudfunctions.net` and `*.run.app` URL forms curl-verified for both HTTP functions;
`elevenlabsCustomLlm` unauthenticated -> 401 (not 403/connection error). Live end-to-end
turn verified via curl + Firestore REST read (calls/curl-test-2 shows both turns written).
Task 3's dashboard wiring and Task 4's live phone call are human-only checkpoints, not
performed in this session per dispatch instructions — documented above under "Human
Follow-up" with exact values/URLs/steps.
