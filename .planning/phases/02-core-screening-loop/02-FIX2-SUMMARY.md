---
phase: 02-core-screening-loop
plan: FIX2
subsystem: telephony
tags: [elevenlabs, custom-llm, firebase-functions-v2, vitest, firestore]

# Dependency graph
requires:
  - phase: 02-core-screening-loop (Plan FIX)
    provides: "elevenlabsCustomLlm Tier 3 hash-based call_doc_id fallback, runTurn() claimedIdentity carry-forward + forced verify-over-end policy"
provides:
  - "elevenlabsCustomLlm: adopts the personalization webhook's own calls/{id} doc on the first caller turn (via an index-free orderBy(startedAt desc).limit(5) scan filtered in code), so a real phone call produces exactly ONE doc holding both providerCallId/from AND the transcript, instead of two separate docs"
  - "elevenlabsCustomLlm: callKeys/{hashKey} mapping collection so every later turn of the same call resolves back to the SAME adopted doc, not a re-derived hash doc"
  - "runTurn(): idempotent turn append -- a repeat of the exact same caller text within 15s returns the previous assistant reply without a second Claude call or a duplicate arrayUnion"
  - "runTurn(): once state:verifying is reached, Claude is never re-invoked on further caller turns -- the call holds with a fixed 'Still checking, please hold.' line instead of letting the model freelance"
  - "prompt.ts / runTurn.ts: the family-claim hold line never promises to fetch Margaret or confirms her presence, and the model is instructed never to confirm a caller's claimed identity itself"
affects: ["02-03-post-call-and-forced-verdict", "phase-4-dashboard"]

actuals:
  tokens: 4300
  tasks: 3
  commits: 3
  plan_head_before: 95d1e62d7210490e0be7f693a20c1d1a4415c0d0

tech-stack:
  added: []
  patterns:
    - "First-turn doc adoption via an orderBy-only Firestore query (no where() equality filters, so no composite index is needed) + in-code filtering on provider/state/turns/staleness, with the resolved mapping persisted in a small callKeys/{hashKey} collection so every later turn of the same logical call (same hashKey) resolves back to the same adopted doc id."
    - "Idempotent-retry short-circuit ahead of the Claude call: compare the incoming caller text against the most recent stored caller turn's text + timestamp before doing any work, not just before writing."
    - "Once a call reaches a terminal-ish holding state (state:verifying), stop re-invoking the LLM on every turn -- respond with a fixed line instead, since there is nothing left for the model to decide once verification has been handed off."

key-files:
  created: []
  modified:
    - functions/src/screening/elevenlabsCustomLlm.ts
    - functions/src/screening/elevenlabsCustomLlm.test.ts
    - functions/src/screening/runTurn.ts
    - functions/src/screening/runTurn.test.ts
    - functions/src/screening/prompt.ts

key-decisions:
  - "Adopt the personalization webhook's doc via an orderBy-only query (no where() equality clauses) plus in-code filtering, rather than a where(provider==)+orderBy(startedAt) composite query, specifically to avoid needing a firestore.indexes.json change for a same-night hackathon deploy."
  - "Persisted the hashKey -> adopted-callId mapping in a dedicated callKeys collection (keyed by the same Tier-3 hash used for the fallback doc id) rather than trying to derive it again on every turn, so a webhook doc that stops looking 'adoptable' after turn 1 (turns populated, state moved past screening) still resolves correctly on turn 2+."
  - "Once state:verifying is reached, runTurn() stops calling Claude entirely on further turns, rather than continuing to call it and overriding a differing recommendation as 02-FIX did -- the live evidence showed Claude still freelancing a wrong line ('let me get her on the phone... hold on just a moment for Margaret') even when its recommendedAction was overridden; the fix is to remove Claude from the loop once verification has been handed off, not just override its wording after the fact."
  - "Idempotent-retry check runs before the state:verifying short-circuit, so a resent duplicate of the SAME caller text during verification is still treated as a resend (same cached reply), not as new chatter that would trigger a second 'Still checking' append."

requirements-completed: []

coverage:
  - id: D1
    description: "A real ElevenLabs phone call produces exactly ONE calls/{id} doc holding BOTH the Twilio CallSid/from (from the personalization webhook) AND the transcript (from the Custom LLM endpoint)"
    verification:
      - kind: unit
        ref: "functions/src/screening/elevenlabsCustomLlm.test.ts (4 new tests: adopts a recent screening-state webhook doc on the first turn, reuses the adoption via the callKeys mapping on a later turn even after the doc stops looking adoptable, falls back to the Tier 3 hash doc when no webhook doc exists, rejects non-adoptable candidates -- has turns, wrong state, wrong provider, stale)"
        status: pass
      - kind: other
        ref: "Live: POST to the deployed elevenlabsPersonalization (https://elevenlabspersonalization-cv32p2xznq-uc.a.run.app) created calls/TFS1hIFZlAJQNWhfWhEC with providerCallId:CA-fix2-verify-test, from:+14015551234, provider:elevenlabs, state:screening, turns:[]. Two in-process invocations of the exact deployed elevenlabsCustomLlm handler (imported from the freshly built functions/lib/index.js, same commit as the live deploy) against REAL production Firestore resolved to the SAME doc: after both turns it held providerCallId/from intact AND all 4 transcript turns, with no separate custom-llm-hash-* doc created for this call. The callKeys/38b1acbc94ed1313 mapping doc was also verified present, confirming turn 2 resolved via the persisted mapping rather than a fresh adoption scan. households/demo/feed/TFS1hIFZlAJQNWhfWhEC mirrored the same merged doc. All three test artifacts (calls/, callKeys/, feed/) were deleted afterward."
        status: pass
    human_judgment: false
  - id: D2
    description: "Turn appends are idempotent -- a duplicate caller utterance resent within 15s does not append a duplicate transcript turn or invoke Claude twice"
    verification:
      - kind: unit
        ref: "functions/src/screening/runTurn.test.ts (2 new tests: an exact repeat within the retry window returns the cached reply with only 1 Claude call and 2 stored turns; the same repeat AFTER the window has elapsed is treated as a genuinely new turn, 2 Claude calls and 4 stored turns)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The screener never promises to hand the phone to Margaret, never says she is home/away, and never confirms the caller's identity itself -- once state:verifying is reached, further caller turns hold with a fixed line instead of a re-invoked, potentially-freelancing model response"
    verification:
      - kind: unit
        ref: "functions/src/screening/runTurn.test.ts: rewrote the claimed-identity regression test to assert the claim turn transitions to state:verifying with the reworded hold line ('One moment -- I'm checking with your family right now.'), and that a later caller turn during verification holds with 'Still checking, please hold.' WITHOUT a second Claude call; SYSTEM_PROMPT guardrail test extended to assert the two new hard-rule phrases verbatim"
        status: pass
    human_judgment: false

duration: 70min
completed: 2026-09-22
status: complete
---

# Phase 2 Fix 2: One Doc Per Call (Webhook Adoption), Idempotent Turns, Hold-Wording Fix Summary

**Fixed a real-call bug where the personalization webhook's `calls/{id}` doc (holding the Twilio CallSid/`from`) and the Custom LLM endpoint's transcript ended up on two separate Firestore docs, made caller-turn appends idempotent against ElevenLabs' occasional request resend, and stopped the screener from ever promising to fetch Margaret to the phone.**

## Performance

- **Duration:** ~70 min (root-cause read of the evidence transcript + 02-FIX-SUMMARY, code changes across 3 files, test rewrites, deploy, live verification, cleanup)
- **Tasks:** 3/3 (adopt-webhook-doc, idempotent turns + verifying hold, prompt wording) + this summary
- **Files modified:** 5 files, 3 commits

## Accomplishments

- **Root cause confirmed**: a live call on 2026-09-22 10:41 EDT produced `calls/n3vw670OxwkVjEuIhMGf` from the personalization webhook (Twilio CallSid, `from`, 0 turns, `state: screening`) and TWO separate `custom-llm-hash-*` docs from the Custom LLM endpoint's Tier 3 fallback (holding the transcript) — because `call_doc_id` still can't reach `elevenlabs_extra_body` (per 02-FIX), Tier 3's hash-of-first-message fallback had no way to know the webhook's doc already existed for this call.
- **Adopted the webhook's doc on the first turn**: `elevenlabsCustomLlm.ts` now looks for a just-created, still-`state:screening`, zero-`turns`, `provider:elevenlabs` doc (via an `orderBy(startedAt, 'desc').limit(5)` query — no `where()` equality filters, so no composite Firestore index was needed) on the very first caller turn, and adopts it instead of minting a fresh hash doc. The resolved mapping is persisted in a new `callKeys/{hashKey}` collection so every later turn of the same call resolves back to the SAME doc, even after that doc no longer looks "freshly adoptable" (turns populated, state moved on).
- **Made turn appends idempotent**: the live transcript showed the caller's first line appended TWICE with two different assistant replies (ElevenLabs re-sent the same HTTP request, likely a cold-start timeout). `runTurn()` now checks the most recent stored caller turn before doing any work — if the incoming text matches and was written under 15s ago, it returns the cached assistant reply without a second Claude call or a duplicate `arrayUnion`.
- **Stopped the screener from freelancing while verifying**: the transcript also showed the screener say "let me get her on the phone so you two can talk... hold on just a moment for Margaret" — wrong, since verification happens through the family's app, not by fetching Margaret. Root cause: `runTurn()` was still re-invoking Claude on every caller turn even after `state:verifying` had already been reached (from 02-FIX's override), letting the model draft an ad hoc reply outside the intended hold flow. Fixed by short-circuiting entirely once `state:verifying`: further turns append the transcript and reply with a fixed `"Still checking, please hold."` line, never calling Claude again. Reworded the initial claim-transition line to `"One moment — I'm checking with your family right now."`.
- **Locked the wording in the prompt too**: added two hard rules to `SYSTEM_PROMPT` — never say Margaret will be put on the phone or is home/away, and never confirm a caller's claimed identity itself — as defense in depth alongside the code-level enforcement above.
- **Deployed** `elevenlabsCustomLlm` and `elevenlabsPersonalization` to `porchlight-hack`.
- **Live-verified** the core objective end-to-end against real production Firestore (see D1's `kind: other` verification above): one real webhook POST created a doc, two Custom LLM turns landed on that SAME doc with both the CallSid/`from` and the full transcript, and the public feed mirror (`households/demo/feed/{id}`) stayed in sync. All test artifacts were deleted afterward.

## Task Commits

1. **Task 1: elevenlabsCustomLlm — adopt the personalization webhook's doc on the first turn** - `9faf639` (fix)
2. **Task 2 + half of Task 3: runTurn() — idempotent turn append, stop re-invoking Claude once verifying** - `007d6c6` (fix)
3. **Task 3 (prompt wording): SYSTEM_PROMPT hard rules against promising to fetch Margaret / self-confirming identity** - `fe9de47` (fix)

**Plan metadata:** (this commit, immediately following)

## Files Created/Modified

- `functions/src/screening/elevenlabsCustomLlm.ts` — `findRecentPersonalizationDoc()`, `callKeys/{hashKey}` mapping persistence, `extractCallId()` made async
- `functions/src/screening/elevenlabsCustomLlm.test.ts` — fake Firestore covering the `calls`/`callKeys` collections; 4 new tests
- `functions/src/screening/runTurn.ts` — idempotent-retry short-circuit, `state:verifying` short-circuit (no more re-invoking Claude), `FAMILY_VERIFY_REPLY` reworded, `STILL_CHECKING_REPLY` added
- `functions/src/screening/runTurn.test.ts` — rewrote the claimed-identity regression test for the two-phase (claim-turn vs. holding-turn) behavior; 2 new idempotency tests; extended the `SYSTEM_PROMPT` guardrail assertions
- `functions/src/screening/prompt.ts` — two new hard rules (never promise to fetch Margaret / confirm she's home or away; never self-confirm a caller's claimed identity)

## Decisions Made

See `key-decisions` in frontmatter above — summarized: adoption uses an orderBy-only query (no composite index needed) with in-code filtering; the hashKey→callId mapping is persisted in its own `callKeys` collection so it survives the adopted doc's state changing; Claude is removed from the loop entirely once `state:verifying` (not just overridden after the fact) because overriding alone still let the model draft the wrong line; the idempotent-retry check runs before the verifying short-circuit so a genuine resend during verification is still deduped correctly.

## Deviations from Plan

### Auto-fixed Issues

None beyond what the plan itself specified — all three fixes (adopt-webhook-doc, idempotent turns, hold-wording) were implemented as scoped.

### Scope note (live-verification limitation, disclosed per Rule 4 boundary — not a code change)

**Live verification of the Custom LLM leg could not exercise the `claimedIdentity` → `state:verifying` transition end-to-end**, because doing so requires a real `claude-haiku-4-5` response, which requires the production `ANTHROPIC_API_KEY` secret, and the sandbox's permission system denied `firebase functions:secrets:access` for `ELEVENLABS_LLM_TOKEN` as "Credential Materialization" (the same restriction would apply to `ANTHROPIC_API_KEY`). Per the sandbox's own guidance ("get as much of the rest of the task done as you can, then stop and explain"), I did not attempt to route around this via `gcloud secrets versions access` or any other path to the real secret value.

What WAS live-verified instead, without touching any production secret:
- `elevenlabsPersonalization` requires no bearer secret (by design, T-02-07) — POSTed to the real deployed endpoint and confirmed the created doc's schema.
- The exact deployed `elevenlabsCustomLlm` code (same commit, freshly built `functions/lib/index.js`) was invoked in-process, twice, against REAL production Firestore, using a locally-chosen test bearer value substituted via `process.env.ELEVENLABS_LLM_TOKEN` (never the real secret) so the auth check and the new adoption/idempotency logic ran exactly as deployed. This confirmed the headline fix — one doc holding both `providerCallId`/`from` and the full 4-turn transcript, plus the `callKeys` mapping — against real Firestore, not just the unit-test fake.
- Since no real Claude response was available, `runTurn()`'s fallback path (`claimedIdentity: null`) was exercised instead of a genuine family-claim response, so `state:verifying` was not reached in this particular live check. That specific transition (and the "hold without re-invoking Claude" behavior) is covered by the unit tests in `runTurn.test.ts` instead (`kind: unit` in D3's coverage above), which exercise the real (non-mocked-out) branching logic in `runTurn.ts` against a high-fidelity Firestore fake.

**If a fully live, secret-backed end-to-end call (through a real Claude response into `state:verifying`) is needed for demo confidence, it requires either running this same curl sequence from an environment with `ELEVENLABS_LLM_TOKEN`/`ANTHROPIC_API_KEY` access (as 02-FIX's own live verification did), or granting this session's permission system an explicit allow-rule for `firebase functions:secrets:access` / `gcloud secrets versions access`.**

## Issues Encountered

None blocking. The credential-access limitation above is a sandbox/permissions boundary, not a code defect — all three fixes are deployed, unit-tested, and partially live-verified against real production Firestore.

## User Setup Required

None for the code changes themselves. See the "Scope note" above if a fully secret-backed live call verification is wanted before the demo — either run the curl sequence from a shell with access to the two production secrets, or grant this environment's permission system an allow-rule for reading them.

## Next Phase Readiness

`elevenlabsCustomLlm` and `elevenlabsPersonalization` are redeployed to `porchlight-hack` with all three fixes live: (a) one `calls/{id}` doc per phone call holds both the Twilio CallSid/`from` and the full transcript, regardless of whether ElevenLabs' dashboard ever wires `call_doc_id` through, (b) a resent duplicate caller turn is deduped rather than double-appended, and (c) the screener never claims it will fetch Margaret to the phone. 02-03 and Phase 4's dashboard can continue to rely on exactly one call doc per real call. Recommend a final pre-demo live phone call test (real Twilio + real ElevenLabs + real Claude) to confirm the `state:verifying` transition end-to-end, since this session could not exercise that specific path under the sandbox's secret-access restriction.

---
*Phase: 02-core-screening-loop*
*Completed: 2026-09-22*

## Self-Check: PASSED

All 5 modified files confirmed present on disk with the described changes. All 3 task commits (`9faf639`, `007d6c6`, `fe9de47`) confirmed present via `git log --oneline`. `pnpm --filter functions test`: 57/57 pass (8 test files, including 8 new/rewritten tests for this fix: 4 adoption tests, 2 idempotency tests, 1 rewritten claimed-identity/verifying-hold test, 1 extended prompt-guardrail assertion). `pnpm -r typecheck` and `pnpm -r build` both exit 0. Live deployment confirmed via `firebase deploy --only functions:elevenlabsCustomLlm,functions:elevenlabsPersonalization --project porchlight-hack` (exit 0, both function URLs printed). Live verification: a real POST to the deployed `elevenlabsPersonalization` created `calls/TFS1hIFZlAJQNWhfWhEC`; two in-process invocations of the exact deployed `elevenlabsCustomLlm` handler against real production Firestore resolved to that SAME doc with `providerCallId`/`from` intact plus all 4 transcript turns, and the `callKeys/{hashKey}` mapping doc was confirmed present; the public feed mirror at `households/demo/feed/{id}` matched. All three test artifacts (`calls/`, `callKeys/`, `feed/`) were deleted after verification. The `state:verifying` transition itself could not be live-exercised because it requires a real Claude response (production `ANTHROPIC_API_KEY`), which this sandbox's permission system denies reading (same restriction that blocked `ELEVENLABS_LLM_TOKEN` access) — that specific behavior is instead verified by unit tests, documented above under "Scope note".
