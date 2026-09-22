---
phase: 04-family-verification-and-dashboard
plan: FIX
subsystem: telephony
tags: [firebase-functions-v2, firestore, twilio, elevenlabs, react, vitest]

requires:
  - phase: 04-family-verification-and-dashboard (04-01/04-02/04-03)
    provides: "verification.memberId/answer state machine, prompts/{memberId} realtime prompt doc, households/{id}/feed mirror, /verify phone-side Yes/No modal"
  - phase: 02-core-screening-loop (Plan FIX2)
    provides: "runTurn() claimedIdentity carry-forward, state:verifying hold behavior"
provides:
  - "runTurn(): a real verification verdict (verification.answeredAt set, or state in verified/scam/ended) is now FINAL -- matchIdentity() resolving the same memberId on a later caller turn can never push the call doc back into state:'verifying'"
  - "runTurn(): a scam-finalized call replies with a fixed goodbye and reports endCall:true (via the ElevenLabs end_call tool) without invoking Claude again; a verified-finalized call keeps scoring risk for the dashboard but never re-runs the verify transition"
  - "matchIdentity(): now returns the matched household member's real name alongside its id (IdentityMatch), not just a bare memberId string"
  - "verification.name / verification.claimedText: the matched member's REAL name and the caller's raw ASR-transcribed claim are now stored as separate fields (mirrors 05-ALLOWLIST's existing allowlist-only verification.name convention, generalized to the regular claimed-identity match path)"
  - "lamp.ts resolveName() / prompts/{memberId} write: prefer verification.name at any call state (not just 'verified'), so the family's /verify prompt, the public feed, and lamp/current all show the correctly-spelled real name instead of echoing back the ASR transcription"
  - "answerVerification: explicit console.warn when a no/timeout verdict has no providerCallId to directly hang up via Twilio (relies on runTurn's end_call backstop instead)"
  - "Verify.tsx: a phone-side localStorage-backed guard (porchlight_answered_calls) that never re-shows the Yes/No modal for a callId this device already answered"
affects: ["05-scam-attack-demo", "any future phase reading verification.name/verification.claimedText"]

actuals:
  tokens: 7712
  tasks: 5
  commits: 4
plan_head_before: 07329bdd01afe8ddb24903e6fad903aeecac066d

tech-stack:
  added: []
  patterns:
    - "Verdict finality check (verification.answeredAt set OR state in a terminal set) runs BEFORE matchIdentity()/the verify-transition block, not just after -- so a caller who keeps repeating an already-matched name can never re-trigger the transition regardless of what matchIdentity() resolves on a later turn."
    - "Checking verification.answeredAt directly, not just callData.state, closes a race window in answerVerification's 'yes' path: verification.answeredAt/answer land in one update(), state:'verified' lands in a second, separate update() via releaseCall() immediately after."
    - "Real display name vs. raw ASR claim kept as two separate fields on the SAME verification map (verification.name / verification.claimedText) rather than overloading risk.claimedIdentity's existing meaning, so downstream display surfaces can unambiguously prefer the resolved name while raw-text-dependent code (matching, idempotent-turn carry-forward) is untouched."
    - "Phone-side answered-call guard is a defense-in-depth backstop independent of the server-side fix -- persisted to localStorage so it survives a reload, and checked both at render time (modal never shows) and inside handleAnswer (the 20s countdown's own timeout path can't slip past it either)."

key-files:
  created:
    - .planning/phases/04-family-verification-and-dashboard/04-FIX-SUMMARY.md
  modified:
    - functions/src/screening/runTurn.ts
    - functions/src/screening/runTurn.test.ts
    - functions/src/screening/matchIdentity.ts
    - functions/src/verification/passkeyAuthentication.ts
    - functions/src/verification/passkeyAuthentication.test.ts
    - functions/src/lamp.ts
    - packages/shared/src/calls.ts
    - apps/web/src/pages/Stage.tsx
    - apps/web/src/pages/AppPlaceholder.tsx
    - apps/web/src/pages/Verify.tsx

key-decisions:
  - "Split the finality check into isScamFinal / isVerifiedFinal rather than one boolean, specifically to handle the answerVerification 'yes' race window correctly (verification.answeredAt set with answer:'yes' but state still momentarily 'verifying') -- a single undifferentiated 'isFinalized' flag would have misrouted that window into the scam/goodbye branch."
  - "A scam-finalized turn does NOT call Claude at all (deterministic canned goodbye) -- avoids the exact class of bug this fix addresses (Claude/matchIdentity being consulted again post-verdict) and is cheaper/faster/more testable than trying to constrain Claude's output after the fact."
  - "Reused the existing verification.name field (previously written only by the 05-ALLOWLIST allowlist-match path) for the regular claimed-identity match too, rather than inventing a new field name -- keeps one display-name convention across both match paths for lamp.ts/Stage.tsx/AppPlaceholder.tsx to read."
  - "Verify.tsx's answered-call guard is capped at 50 stored callIds and wrapped in try/catch around all localStorage access -- never lets a private-browsing/quota failure block the actual verify flow, since the in-memory React Set still guards the current session even if persistence silently no-ops."

requirements-completed: []

coverage:
  - id: D1
    description: "A verification verdict is final -- once verification.answeredAt is set or the call reaches state verified/scam/ended, no later caller turn can push the call doc back into state:'verifying', even when matchIdentity() resolves the same memberId again"
    verification:
      - kind: unit
        ref: "functions/src/screening/runTurn.test.ts 'verdict finality' describe block (3 new tests): a call already answered 'no' replies with the fixed goodbye and reports endCall:true without calling Claude; a call already state:'scam' with no stored verification.answer behaves the same; a call already state:'verified' replies normally via Claude and keeps scoring risk without re-entering verification"
        status: pass
      - kind: other
        ref: "Live verification against real production Firestore (porchlight-hack): startSimulatedCall -> simulateTurn(\"it's Brendan\") reached state:verifying with verification.memberId:'brenden'/name:'Brenden'/claimedText:'Brendan'; answerVerification({answer:'no'}) moved the doc to state:'scam'/outcome:'scam'; a second simulateTurn on the SAME call with new caller text repeating the claim returned {reply:\"I'm sorry, I can't help with that. Goodbye.\", endCall:true, endReason:'scam_detected'} and the call doc stayed state:'scam' with no new prompts/brenden re-prompt (prompt doc stayed state:'none'). Test call docs cleaned up via `pnpm demo:reset` afterward."
        status: pass
    human_judgment: false
  - id: D2
    description: "A 'No'/timeout verdict actually ends the live call -- forceEndCall runs using the call doc's providerCallId, with a clear log when providerCallId is missing"
    verification:
      - kind: unit
        ref: "functions/src/verification/passkeyAuthentication.test.ts: existing tests confirm forceEndCall is called with the call doc's providerCallId on both 'no' and 'timeout'; new test confirms a call doc with no providerCallId logs a clear console.warn instead of calling forceEndCall, while still recording the scam verdict correctly"
        status: pass
    human_judgment: false
  - id: D3
    description: "prompts/{memberId}, the public feed, and lamp/current show the matched household member's real name, not the caller's raw ASR-transcribed claim"
    verification:
      - kind: unit
        ref: "functions/src/screening/runTurn.test.ts: new test confirms verification.name is the real household name ('Brenden') and verification.claimedText is the raw ASR claim ('Brendan') even when they differ"
      - kind: other
        ref: "Live verification: the deployed mirrorActiveCallToLamp wrote prompts/brenden.claimedIdentity:'Brenden' (the real name) for a simulated call where the caller said 'Brendan', confirmed via a direct Firestore REST read against production porchlight-hack"
        status: pass
    human_judgment: true
    rationale: "Stage.tsx/AppPlaceholder.tsx's 'Claims to be:' line change (reading verification.name over risk.claimedIdentity) has no dedicated component test in this repo's vitest setup (no jsdom environment configured for apps/web) -- a human should glance at /stage or /app during a live or simulated call with a matched claimed identity to confirm the displayed name is the correctly-spelled real one."
  - id: D4
    description: "Phone-side guard: /verify never re-shows the Yes/No modal for a callId this device already answered, even if the prompt doc briefly reports state:'verifying' again"
    verification:
      - kind: other
        ref: "Code review only (no test infra for this file) -- pnpm -r typecheck and pnpm --filter web build both exit 0 with the change in place. answeredCallIds (backed by localStorage key porchlight_answered_calls) gates both the modal's render condition and the top of handleAnswer(), covering the 20s countdown's independent timeout path."
        status: pass
    human_judgment: true
    rationale: "This is a client-side UI guard with no existing component-test harness for Verify.tsx in the repo -- recommend a human manually confirm on a real phone: answer a simulated call's prompt, then trigger a second simulateTurn on the same call while still on /verify, and confirm the modal does not reappear."

duration: 90min
completed: 2026-09-22
status: complete
---

# Phase 4 Fix: Verdict Finality, Real Hang-Up Logging, Real Names Summary

**A live attack call at ~13:10 EDT showed a verified "No" verdict get silently undone -- the call doc flipped back to `state:'verifying'` and re-prompted the family's phone -- because `runTurn()` unconditionally forced `state:'verifying'` whenever the caller's claimed identity matched a household member, with no check for whether a verdict already existed. This fix makes a verification verdict final, confirms/logs the "No" hang-up path, and shows the matched household member's correctly-spelled real name instead of the caller's raw ASR-transcribed claim.**

## Performance

- **Duration:** ~90 min (root-cause read of the evidence + 02-FIX2-SUMMARY.md, code changes across 10 files, test additions, deploy, live simulator-based verification, demo:reset cleanup)
- **Tasks:** 5/5 (verdict finality, "No" must hang up, real names, phone-side guard, deploy+verify) + this summary
- **Files modified:** 10 files, 4 commits

## Accomplishments

- **Root cause confirmed**: `runTurn()`'s `if (memberId) { effectiveAction = 'verify'; ... }` block ran on EVERY caller turn with no awareness of whether a real verdict already existed. A scam caller who kept repeating an already-matched claimed name after the family tapped "No" (`state:'scam'`) got `matchIdentity()` to resolve the same `memberId` again, which unconditionally flipped the call doc's `state` back to `'verifying'` and re-wrote `prompts/{memberId}`, re-prompting the family's phone for a call that had already been correctly blocked.
- **Made the verdict final**: `runTurn()` now checks `verification.answeredAt` (set the instant `answerVerification` records a real yes/no/timeout) and the call's terminal states (`verified`/`scam`/`ended`) BEFORE ever reaching the `matchIdentity()`/verify-transition code. A scam-finalized call replies with a deterministic goodbye and reports `endCall:true` (turned into the ElevenLabs `end_call` tool by `elevenlabsCustomLlm.ts`) without calling Claude again; a verified-finalized call replies normally via Claude (keeping the live dashboard's risk score current) but never re-enters verification. The check explicitly handles the race window in `answerVerification`'s "yes" path, where `verification.answeredAt` lands in one Firestore write and `state:'verified'` lands in a second, separate write immediately after.
- **Confirmed and hardened the "No" hang-up path**: `answerVerification`'s no/timeout branch already called `forceEndCall(callData.providerCallId, ...)` -- Twilio's own REST call-control API, independent of what the ElevenLabs agent thinks it's doing. Added an explicit `console.warn` on the else branch (no `providerCallId` -- a simulated call, or a real call whose provenance webhook doc was never adopted) so this case is never silently swallowed; the verdict-finality fix above is the backstop that ends the call on the caller's very next turn in that case. Unit-tested both branches.
- **Real names, not ASR spelling**: `matchIdentity()` now returns the matched household member's real name (`IdentityMatch { memberId, name }`) alongside its id, mirroring `matchAllowlist.ts`'s existing pattern. `runTurn()` stores this as `verification.name` (the real, correctly-spelled name, e.g. "Brenden") separate from `verification.claimedText` (the caller's raw ASR-transcribed claim, e.g. "Brendan") -- generalizing the `verification.name` field 05-ALLOWLIST originally wrote only for allowlist matches. `lamp.ts`'s `resolveName()` and the `prompts/{memberId}` write now prefer `verification.name` at ANY call state (not just `'verified'`), so the family's `/verify` prompt ("Is Brenden calling Grandma right now?"), the public feed, and `lamp/current` all show the real name. `Stage.tsx` and `AppPlaceholder.tsx`'s "Claims to be:" line does the same.
- **Phone-side guard**: `Verify.tsx` now remembers every callId this device has answered (React state + `localStorage` key `porchlight_answered_calls`, capped at 50 entries, wrapped in try/catch so a private-browsing/quota failure never blocks the actual verify flow) and never shows the full-screen Yes/No modal again for that callId -- both at render time and inside `handleAnswer()` itself, covering the 20s countdown's independent timeout path.
- **Deployed** `elevenlabsCustomLlm`, `simulateTurn`, `mirrorActiveCallToLamp`, `answerVerification`, and hosting to `porchlight-hack`.
- **Live-verified end-to-end** against real production Firestore using the simulator path (no ElevenLabs bearer token needed): `startSimulatedCall` → `simulateTurn("it's Brendan")` reached `state:verifying` with `verification.memberId:'brenden'`, `verification.name:'Brenden'`, `verification.claimedText:'Brendan'`, and `prompts/brenden.claimedIdentity:'Brenden'` (the corrected name, confirmed via a direct Firestore REST read); `answerVerification({answer:'no'})` moved the call to `state:'scam'`/`outcome:'scam'`; a second `simulateTurn` on the SAME call repeating the claim returned the deterministic goodbye with `endCall:true`/`endReason:'scam_detected'`, and the call doc stayed `state:'scam'` with `prompts/brenden` still `state:'none'` (no re-prompt). All test call docs were cleaned up afterward via `pnpm demo:reset`.

## Task Commits

1. **Task 2: runTurn() verdict finality (never re-enter verifying once a verdict exists)** - `36cbd27` (fix)
2. **Task 3: answerVerification -- log clearly when providerCallId is missing on a no/timeout verdict** - `da306de` (fix)
3. **Task 4: lamp.ts / Stage.tsx / AppPlaceholder.tsx -- show the matched member's real name** - `88bbf62` (fix)
4. **Task 5: Verify.tsx -- phone-side guard against re-showing an already-answered call's modal** - `ff1cfa9` (fix)

**Plan metadata:** (this commit, immediately following)

## Files Created/Modified

- `functions/src/screening/runTurn.ts` — verdict-finality check (isScamFinal/isVerifiedFinal) ahead of the matchIdentity()/verify-transition block; `messages`/`callClaude()` hoisted above the new check (both are referenced by it); `verification.name`/`verification.claimedText` written alongside `verification.memberId` on the verify transition
- `functions/src/screening/runTurn.test.ts` — 5 new tests: verification.name/claimedText separation, and a 3-test "verdict finality" describe block (scam-with-answer, scam-state-only, verified-final)
- `functions/src/screening/matchIdentity.ts` — returns `IdentityMatch { memberId, name }` instead of a bare memberId string
- `functions/src/verification/passkeyAuthentication.ts` — `console.warn` on the missing-providerCallId else branch in `answerVerification`'s no/timeout path
- `functions/src/verification/passkeyAuthentication.test.ts` — new test for the missing-providerCallId warning path
- `functions/src/lamp.ts` — `resolveName()` prefers `verification.name` at any state; `prompts/{memberId}` write prefers `verification.name` over `risk.claimedIdentity`
- `packages/shared/src/calls.ts` — `CallDoc.verification.claimedText` field added, `.name` doc comment generalized
- `apps/web/src/pages/Stage.tsx` / `AppPlaceholder.tsx` — "Claims to be:" line prefers `call.verification?.name`
- `apps/web/src/pages/Verify.tsx` — `answeredCallIds` state + `porchlight_answered_calls` localStorage guard

## Decisions Made

See `key-decisions` in frontmatter above — summarized: split the finality check into scam-final vs. verified-final branches to correctly handle the answerVerification "yes" race window; a scam-finalized turn never calls Claude at all (cheaper, faster, and structurally can't regress); reused the existing `verification.name` field rather than inventing a new one; the phone-side guard is capped and exception-safe so it can never itself become a new failure mode.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking issue] `messages`/`callClaude()` had to be hoisted above the new verdict-finality check**
- **Found during:** Task 2 (first test run after adding the finality check)
- **Issue:** The new `isVerifiedFinal` branch calls `callClaude()`, but `callClaude()` (and the `messages` array it closes over) were originally declared later in the function body — a `ReferenceError: Cannot access 'messages' before initialization` (temporal dead zone).
- **Fix:** Moved the `messages` array and `callClaude()` function declaration above the new verdict-finality block; removed the now-duplicate declarations further down.
- **Files modified:** `functions/src/screening/runTurn.ts`
- **Commit:** `36cbd27`

No other deviations — all four fixes were implemented as scoped in the prompt.

## Issues Encountered

None blocking. `pnpm --filter functions test` (86/86 pass, including 5 new tests), `pnpm --filter web test` (13/13 pass, no regressions), `pnpm -r typecheck` and `pnpm -r build` all exit 0.

## User Setup Required

None for the code changes. Per D3/D4's `human_judgment: true` notes above: a human glance at `/stage` or `/app` during a live/simulated call with a matched claimed identity, and a manual re-check of the `/verify` modal-guard on a real phone, would add confidence beyond this session's Firestore-REST-level and code-review-level verification, but neither blocks the fix from being considered complete for tonight's demo.

## Next Phase Readiness

`elevenlabsCustomLlm`, `simulateTurn`, `mirrorActiveCallToLamp`, `answerVerification`, and hosting are redeployed to `porchlight-hack` with all fixes live: (a) a verification verdict is final and can never be silently undone by a caller repeating an already-matched name, (b) a "No"/timeout verdict's hang-up path is confirmed and logs clearly when there's no real Twilio call leg to hang up, (c) the family's `/verify` prompt, feed, and lamp all show the correctly-spelled real household member name, and (d) `/verify` never re-shows its modal for an already-answered call. The core demo loop (scam call → AI screens → family taps "No" → lamp turns red → call actually ends) is confirmed end-to-end via the simulator against real production Firestore.

---
*Phase: 04-family-verification-and-dashboard*
*Completed: 2026-09-22*

## Self-Check: PASSED

All 10 modified files confirmed present on disk with the described changes. All 4 task commits (`36cbd27`, `da306de`, `88bbf62`, `ff1cfa9`) confirmed present via `git log --oneline`. `pnpm --filter functions test`: 86/86 pass (11 test files). `pnpm --filter web test`: 13/13 pass. `pnpm -r typecheck` and `pnpm -r build` both exit 0. Live deployment confirmed via `firebase deploy --only functions:elevenlabsCustomLlm,functions:simulateTurn,functions:mirrorActiveCallToLamp,functions:answerVerification,hosting --project porchlight-hack` (exit 0). Live verification against real production Firestore: `startSimulatedCall` + `simulateTurn("it's Brendan")` reached `state:verifying` with `verification.memberId:'brenden'`/`name:'Brenden'`/`claimedText:'Brendan'` and `prompts/brenden.claimedIdentity:'Brenden'`; `answerVerification({answer:'no'})` moved the call to `state:'scam'`; a second `simulateTurn` on the same call returned the fixed goodbye with `endCall:true`, and the call doc stayed `state:'scam'` with no new prompt. All test artifacts (`calls/`, `prompts/`) were cleaned up via `pnpm demo:reset` afterward.
