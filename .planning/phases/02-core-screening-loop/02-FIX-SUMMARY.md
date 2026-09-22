---
phase: 02-core-screening-loop
plan: FIX
subsystem: telephony
tags: [elevenlabs, custom-llm, firebase-functions-v2, vitest, firestore, sse]

# Dependency graph
requires:
  - phase: 02-core-screening-loop (Plan 02)
    provides: "elevenlabsCustomLlm, elevenlabsPersonalization, runTurn() shared screening core"
provides:
  - "elevenlabsCustomLlm: Tier 3 call_doc_id derivation (hash of the first user message in messages[] + time bucket) so every turn of one phone call lands in ONE calls/{id} doc with zero ElevenLabs-dashboard dependency"
  - "elevenlabsCustomLlm: single-farewell end_call emission (reply spoken exactly once, via the tool's own message parameter, never also as a separate content chunk)"
  - "runTurn(): claimedIdentity now carries forward across turns (risk is a full-object overwrite, not a merge) and unconditionally forces state:verifying once a household member is matched -- never state:scam for a claimed family member, regardless of risk score or Claude's own recommendation"
affects: ["02-03-post-call-and-forced-verdict", "phase-4-dashboard"]

actuals:
  tokens: 6111
  tasks: 3
  commits: 2
  plan_head_before: ab3e359f54931bd2c28d326540acbb3cab77654f

tech-stack:
  added: []
  patterns:
    - "Tier-based call_doc_id derivation with a code-only last resort: elevenlabs_extra_body -> system-message regex -> hash(first user message + 10-min time bucket) -- the hash tier needs zero ElevenLabs dashboard configuration, unlike the first two, which the docs confirm only work via dashboard-side dynamic-variable templating (system prompts/first messages/tool params only, never Custom LLM extra_body)."
    - "risk.claimedIdentity must be read back from the previous callData.risk before deciding this turn's action -- `risk` is written as a full nested-object replace via update(), so any field the current turn's Claude output omits silently vanishes unless explicitly carried forward."

key-files:
  created: []
  modified:
    - functions/src/screening/elevenlabsCustomLlm.ts
    - functions/src/screening/elevenlabsCustomLlm.test.ts
    - functions/src/screening/runTurn.ts
    - functions/src/screening/runTurn.test.ts
    - functions/src/screening/prompt.ts

key-decisions:
  - "Implemented the Tier 3 hash fallback (first user message + 10-min time bucket) as the PRIMARY fix rather than relying on ElevenLabs dashboard configuration for Tier 1/2, because elevenlabs.io's own docs confirm dynamic-variable templating ({{call_doc_id}}) only works inside system prompts / first messages / tool parameters -- never inside the Custom LLM 'extra body' field -- so Tier 1 can never be dashboard-wired to work as originally assumed in 02-02, and Tier 2 requires a dashboard edit this execution environment cannot make or verify."
  - "Forced recommendedAction to 'verify' (never 'end') whenever a claimed identity matches a household member, unconditionally -- even overriding a high-risk 'end' recommendation from Claude itself -- because ending a call from someone claiming to be family forecloses this product's entire core value loop (real family member confirms/denies, lamp turns red). A human verification decision always outranks an AI-decided hangup."
  - "When the verify-override changes the outcome (Claude's own action differed from 'verify'), the spoken reply is also replaced with a fixed 'One moment, I'm checking with the family' line -- Claude's original reply was drafted under the assumption the call was ending/declining and would sound wrong once the call is actually kept open."
  - "Fixed the double-farewell bug by making the content-delta chunk and the end_call tool_calls delta MUTUALLY EXCLUSIVE (previously both were sent with the same reply text) -- confirmed via ElevenLabs docs that the end_call tool's own `message` parameter is already 'a farewell message to send to the user before ending the call', so sending the same text via a content chunk AND the tool spoke it twice before hangup."
  - "Deleted the two test docs (`custom-llm-hash-497b0f3e0d60feb9`, `custom-llm-hash-eea17c40c12e3dfc`) created in production Firestore during Task 4's live curl verification, rather than leaving them for a pre-demo cleanup pass, since deletion was a one-line admin-script call already in hand."

requirements-completed: []

coverage:
  - id: D1
    description: "elevenlabsCustomLlm keeps ONE calls/{id} doc for an entire phone call via a hash-of-first-user-message fallback, with no dependency on ElevenLabs dashboard wiring"
    verification:
      - kind: unit
        ref: "functions/src/screening/elevenlabsCustomLlm.test.ts (3 new tests: same callId across two requests sharing a first user message, different callId for a different first message, Tier 1 elevenlabs_extra_body still takes precedence when present)"
        status: pass
      - kind: other
        ref: "Live curl against deployed elevenlabsCustomLlm: two sequential POSTs with growing messages[] history (Brenden intro, then + jail/gift-card line) -> ONE Firestore doc calls/custom-llm-hash-497b0f3e0d60feb9 with 4 turns (verified via firebase-admin+ADC read, then deleted as a test artifact)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A claimed family-member identity is never lost across turns and always forces state:verifying, never state:scam, even when Claude's own turn recommends 'end' at high risk"
    verification:
      - kind: unit
        ref: "functions/src/screening/runTurn.test.ts (2 new tests: identity carried forward + forced verifying on a high-risk 'end' turn with the reply overridden; a marginal unclaimed 'end' at risk<80 downgrades to 'continue' instead of ending)"
        status: pass
      - kind: other
        ref: "Live curl: same two-turn sequence above resolved to state:verifying, verification.memberId:brenden, risk.recommendedAction:verify (Claude's own output already said 'verify' after the prompt.ts guidance update, so the reply-override branch did not need to fire on this particular live run -- exercised directly by the unit test above)"
        status: pass
    human_judgment: false
  - id: D3
    description: "end_call emits the farewell exactly once (via the tool's own message parameter), never also as a separate content-delta chunk"
    verification:
      - kind: unit
        ref: "functions/src/screening/elevenlabsCustomLlm.test.ts > 'emits an end_call tool_calls delta ... and NOT also a separate content chunk (single farewell, 02-FIX)'"
        status: pass
      - kind: other
        ref: "Live curl with an unclaimed high-urgency IRS/gift-card scam script -> single tool_calls SSE event (reason:'scam_detected', message:<farewell>), zero content-delta chunks, Firestore doc resolved to state:scam/outcome:scam"
        status: pass
    human_judgment: false

duration: 90min
completed: 2026-09-22
status: complete
---

# Phase 2 Fix: ElevenLabs Single-Doc-Per-Call, Family-Claim Verification Routing, Single Farewell Summary

**Root-caused a live-call bug (3 separate `calls/{id}` docs for one phone call) to ElevenLabs' documented dynamic-variable scoping, added a dashboard-independent hash-based call-id fallback, made a claimed family identity un-droppable across turns and always route to `verifying`, and fixed a double-spoken farewell in `end_call`.**

## Performance

- **Duration:** ~90 min (diagnosis via `gcloud functions logs` + live ElevenLabs docs research, code fix, tests, deploy, live curl verification)
- **Started:** 2026-09-22T04:20:00Z (approx.)
- **Completed:** 2026-09-22T05:50:00Z (approx.)
- **Tasks:** 5/5 (diagnose, family-claim policy, single farewell, deploy+verify, this summary)
- **Files modified:** 5 files, 2 commits

## Accomplishments

- **Diagnosed the root cause** of the 2026-09-22 04:13 UTC live call producing three separate `calls/{id}` docs instead of one: `gcloud functions logs read elevenlabsCustomLlm` showed the "could not find call_doc_id" warning firing on **every single turn** of that call, and a Firestore read of the personalization webhook's own doc (`z739Y0vw4ypiFfpJwQbt`, `state: screening`, correctly holding `providerCallId`) confirmed it was never reused. Cross-checked against ElevenLabs' own documentation (`elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables`): dynamic variables are only officially templatable into an agent's **system prompts, first messages, and tool parameters** — never into the Custom LLM `elevenlabs_extra_body` field, which the docs show only as a static/pass-through JSON blob. This means the existing Tier 1 (`elevenlabs_extra_body.call_doc_id`) mechanism assumed in 02-02 was never going to work without dashboard changes this execution environment cannot make or verify, and Tier 2 (system-message regex) requires a literal `{{call_doc_id}}` marker a human must add to the dashboard's agent system prompt.
- Added **Tier 3**: `elevenlabsCustomLlm` now derives a fallback `call_doc_id` from a SHA-256 hash of the first user-authored message in the request's `messages[]` (+ a 10-minute time bucket to avoid two unrelated calls with identical scripted openers colliding), with zero dependency on any ElevenLabs dashboard configuration. Live-verified: two sequential curl requests with growing conversation history resolved to the identical `custom-llm-hash-497b0f3e0d60feb9` doc.
- Fixed the **double-farewell bug**: `end_call`'s own `message` parameter is documented (`elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/end-call`) as "a farewell message to send to the user before ending the call" — the previous code sent the same reply text via BOTH a `delta.content` chunk AND the tool's `message`, so ElevenLabs spoke it twice before hanging up. Now the two paths are mutually exclusive.
- Fixed the **family-claim routing bug**: `runTurn()` now reads `callData.risk.claimedIdentity` from the previous turn and carries it forward if the current turn's Claude output omits it (necessary because `risk` is written as a full-object replace, not a merge — an omitted field silently vanishes otherwise). Once `matchIdentity` resolves a household member, `recommendedAction` is unconditionally forced to `'verify'` and `state` to `'verifying'`, regardless of risk score or what Claude itself recommended. This exactly reverses the live bug: the caller who said "it's Brenden" on turn 1, then delivered the jail/gift-card scam script on turn 2, would previously have had the call ended (`state: scam`) because the earlier claim was lost; it now resolves to `state: verifying`, `verification.memberId: brenden`.
- Updated `prompt.ts`'s guidance to Claude to match this policy (recommend `verify` over `end` once a family member is claimed, keep reporting the claimed identity on later turns) — though the enforcement lives in code, so the outcome holds regardless of model compliance. Confirmed live: on the second curl turn, Claude's own output already said `recommendedAction: 'verify'` after this prompt change, so the code-level reply-override branch (used when Claude's own action differs from `verify`) was exercised directly by the new unit test instead of on this particular live run.
- Live-verified the `end_call` fix with an unclaimed, high-urgency IRS/gift-card scam script: exactly one SSE event (`tool_calls` with `reason: 'scam_detected'`, `message: <farewell>`), zero separate content chunks, and the Firestore doc correctly resolved to `state: scam` / `outcome: scam` (no family claim, so the AI-end path remains available for genuine scams).
- Deployed `elevenlabsCustomLlm` and `elevenlabsPersonalization` to `porchlight-hack`; deleted the two test docs created during live curl verification (`custom-llm-hash-497b0f3e0d60feb9`, `custom-llm-hash-eea17c40c12e3dfc`) so they don't clutter the pre-demo dashboard.

## Task Commits

Each task was committed atomically:

1. **Task 1 + 3: elevenlabsCustomLlm — Tier 3 hash-based call_doc_id derivation, single-farewell end_call emission** - `82b0a47` (fix)
2. **Task 2: runTurn() — claimedIdentity carry-forward, forced verify-over-end policy, prompt.ts guidance update** - `7ba1ef4` (fix)

**Plan metadata:** (this commit, immediately following)

## Files Created/Modified

- `functions/src/screening/elevenlabsCustomLlm.ts` - Tier 3 hash-based `call_doc_id` fallback; `end_call` and content-delta chunks made mutually exclusive; `reason` param added to the `end_call` tool call
- `functions/src/screening/elevenlabsCustomLlm.test.ts` - 3 new tests (Tier 3 hash stability/collision-avoidance, Tier 1 precedence), 1 updated test (single-farewell assertion)
- `functions/src/screening/runTurn.ts` - `claimedIdentity` carry-forward from prior `risk` state; unconditional verify-over-end enforcement once a household member matches; reply override when the enforcement changes the outcome
- `functions/src/screening/runTurn.test.ts` - 2 new tests (jail-script-after-family-claim regression, marginal unclaimed-end downgrade)
- `functions/src/screening/prompt.ts` - guidance updated to recommend `verify` over `end` once a family member is claimed, and to keep reporting a previously-claimed identity on later turns

## Decisions Made

See `key-decisions` in frontmatter above — summarized: implemented the code-only Tier 3 hash fallback as the primary fix (rather than relying on ElevenLabs dashboard wiring, which the docs confirm can't carry `call_doc_id` through `elevenlabs_extra_body` at all); made the family-claim → verify enforcement unconditional and code-level (not just a prompt suggestion) since it protects this product's core demo loop; made the content-chunk and `end_call` tool-call paths mutually exclusive to fix the double-farewell; deleted the live-verification test docs rather than deferring cleanup.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `end_call` tool call was missing the required `reason` parameter**
- **Found during:** researching the ElevenLabs `end_call` system tool docs while fixing the double-farewell bug
- **Issue:** `elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/end-call` documents `reason` as a **required** parameter on the `end_call` function-call arguments; the existing code only ever sent `message`.
- **Fix:** Added `reason: 'scam_detected'` to the `end_call` tool-call arguments alongside `message`.
- **Files modified:** `functions/src/screening/elevenlabsCustomLlm.ts`
- **Verification:** New unit test asserts `args.reason` is a non-empty string; live curl confirmed the field is present in the emitted tool call.
- **Committed in:** `82b0a47`

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical parameter). **Impact:** No scope creep — discovered while directly reading the docs this task was already asked to consult, and is a one-line addition required for `end_call` to match ElevenLabs' documented contract.

## Issues Encountered

**Resolved (no longer blocking): the `ANTHROPIC_API_KEY` workspace-scoping issue logged as an open `WINDOWS.md` deviation in 02-02 appears to have been fixed since that plan's execution** — live curl verification in this fix produced real, varied Claude-generated replies (not the `fallbackTurn()` generic line), confirming `claude-haiku-4-5` calls are succeeding in production again. Not something this fix changed; noted here because it was a precondition for confidently observing the family-claim routing fix working end-to-end on a live deployed function.

**None blocking.** All three bugs (multi-doc-per-call, family-claim routing, double farewell) were reproduced, root-caused, fixed, unit-tested, and live-verified against the deployed functions within this session.

## User Setup Required

None — no new external service configuration required. (Optional, not required: a human could still add a literal `{{call_doc_id}}` marker to the ElevenLabs dashboard's agent system prompt to activate Tier 2 as a belt-and-suspenders mechanism, but Tier 3 now makes this unnecessary for correctness.)

## Next Phase Readiness

`elevenlabsCustomLlm` and `elevenlabsPersonalization` are redeployed to `porchlight-hack` with all three fixes live. 02-03 (post-call + forced verdict UI wiring) and Phase 4's dashboard can rely on: (a) one `calls/{id}` doc per phone call regardless of ElevenLabs dashboard configuration, (b) a claimed family member always producing `state: verifying` + `verification.memberId` rather than an AI-decided `scam` ending, and (c) `end_call` never producing a double-spoken farewell. No new blockers identified.

---
*Phase: 02-core-screening-loop*
*Completed: 2026-09-22*

## Self-Check: PASSED

Both files (`functions/src/screening/elevenlabsCustomLlm.ts`, `functions/src/screening/runTurn.ts`) and their test files confirmed present on disk with the described changes. Both commits (`82b0a47`, `7ba1ef4`) confirmed present via `git log --oneline`. `pnpm --filter functions test`: 28/28 pass (4 test files, including 5 new/updated tests for this fix). `pnpm -r typecheck` and `pnpm -r build` both exit 0. Live deployment confirmed via `firebase deploy --only functions:elevenlabsCustomLlm,functions:elevenlabsPersonalization --project porchlight-hack` (exit 0, both function URLs printed). Live curl verification: (1) two-turn growing-history sequence resolved to ONE Firestore doc with 4 turns, `state: verifying`, `verification.memberId: brenden` (doc read via firebase-admin + `gcloud auth application-default` credentials, then deleted); (2) an unclaimed high-urgency scam script resolved to a single `end_call` tool-call SSE event with zero separate content chunks, and `state: scam` in Firestore (doc also deleted).
