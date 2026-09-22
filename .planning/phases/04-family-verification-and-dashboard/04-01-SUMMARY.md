---
phase: 04-family-verification-and-dashboard
plan: 01
subsystem: auth
tags: [webauthn, simplewebauthn, firebase-functions-v2, firestore-trigger, firestore-rules, hmac, vitest]

# Dependency graph
requires:
  - phase: 02-core-screening-loop (Plan 02)
    provides: "functions/src/screening/endCall.ts: releaseCall(callId)/forceEndCall(callSid, sayLine) Twilio call-control"
  - phase: 03-lamp (Plan 02)
    provides: "functions/src/lamp.ts: mirrorActiveCallToLamp (onDocumentWritten calls/{callId}), extended in place by this plan"
provides:
  - "packages/shared/src/households.ts: HouseholdMember.passkeys: PasskeyCredential[] (id/publicKey/counter/transports/deviceType/backedUp)"
  - "mirrorActiveCallToLamp extended: prompts/{memberId} (VER-02, carries a VER-05 HMAC token) and households/{householdId}/feed/{callId} (DASH-01/02) fan-out from the SAME calls/{id} trigger"
  - "startPasskeyRegistration/finishPasskeyRegistration onCall Functions (VER-01)"
  - "startPasskeyAuthentication/answerVerification onCall Functions (VER-03/04/05) -- the single verdict decision point, gated by a real passkey assertion or a single-use HMAC link token, calling Phase 2's real releaseCall/forceEndCall"
  - "firestore.rules: prompts/{memberId} and households/{id}/feed/{callId} public-get, no client write"
  - "VERIFY_LINK_SECRET set in Firebase Secret Manager"
affects: ["04-02-member-verify-app (reads prompts/{memberId}, calls all four onCall Functions)", "04-03-dashboard (reads households/{id}/feed/{callId})"]

actuals:
  tokens: 14749
  tasks: 4
  commits: 4
plan_head_before: ab3e359f54931bd2c28d326540acbb3cab77654f

tech-stack:
  added:
    - "@simplewebauthn/server@14.0.2 -- repository.url confirmed github.com/MasterKale/SimpleWebAuthn, 3.3M+ weekly downloads (Task 2 checkpoint, pre-approved by orchestrator)"
  patterns:
    - "A single onDocumentWritten('calls/{callId}') trigger fans out to three narrow public-read mirror docs (lamp/current from Phase 3, prompts/{memberId} and households/{id}/feed/{callId} from this plan) instead of adding competing triggers on the same document -- same D-10 narrowing pattern Phase 3 established"
    - "Every onCall Function that reads a defineSecret's .value() must declare that secret in its OWN secrets:[...] option -- Cloud Functions v2 binds secrets per-function-instance, not project-wide (found live, see Deviations)"
    - "verification.* sub-fields are updated via a JS-side read-merge-write of the whole verification map (not Firestore dot-notation), preserving memberId/promptedAt across the answer/answeredAt/method write -- matches runTurn.ts's existing convention of writing the whole map each time"
    - "Cloned-authenticator defense: authenticationInfo.newCounter is persisted back onto the stored passkey via a household read-modify-write immediately after every successful assertion"

key-files:
  created:
    - functions/src/verification/webauthn.ts
    - functions/src/verification/verifyLink.ts
    - functions/src/verification/passkeyRegistration.ts
    - functions/src/verification/passkeyRegistration.test.ts
    - functions/src/verification/passkeyAuthentication.ts
    - functions/src/verification/passkeyAuthentication.test.ts
  modified:
    - packages/shared/src/households.ts
    - functions/src/lamp.ts
    - functions/src/secrets.ts
    - functions/src/index.ts
    - functions/package.json
    - firestore.rules
    - pnpm-lock.yaml

key-decisions:
  - "Persisted answer/answeredAt/method by reading the existing verification map and writing a full replacement object (not Firestore dot-notation paths), matching runTurn.ts's own convention of always writing the whole verification map -- avoids mixing two different nested-update styles in the same document."
  - "releaseCall(callId) already writes state:'verified'/outcome:'verified' internally (confirmed by reading the real endCall.ts) -- answerVerification writes ONLY the verification.* fields itself and lets releaseCall own state/outcome/the Twilio hand-off, avoiding a duplicate write. For the scam path, forceEndCall(callSid, sayLine) is Twilio-hangup-only (no Firestore write), so answerVerification writes state/outcome/endedAt itself, mirroring forceVerdict's existing scam-branch structure in endCall.ts."
  - "Registration's read-modify-write on households/demo.members[] uses a plain read-then-update (not a Firestore transaction) -- acceptable for this single-demo-household hackathon scope with no concurrent enrollers; documented rather than adding transaction-mocking complexity to the test suite."

patterns-established:
  - "webauthn.ts centralizes rpID/origin (hard-coded, never derived from request headers) and re-exports SimpleWebAuthn's generate*/verify* functions plus encodePublicKey/decodePublicKey wrappers around isoBase64URL.fromBuffer/toBuffer -- the one place a stored passkey's binary<->text encoding happens"
  - "Test files mock @simplewebauthn/server, @simplewebauthn/server/helpers, firebase-admin/firestore, and sibling verification/screening modules via vi.hoisted() + an in-memory fake Firestore (get/set/update/delete), following the exact pattern runTurn.test.ts and endCall.test.ts already established"

requirements-completed: [VER-03, VER-04, VER-05]

coverage:
  - id: D1
    description: "A calls/{id} write with state:'verifying' and verification.memberId set produces a prompts/{memberId} doc (carrying a VER-05 token) and a households/{id}/feed/{callId} doc, from the SAME mirror trigger Phase 3 built"
    requirement: "VER-05"
    verification:
      - kind: other
        ref: "live: wrote calls/demo {state:verifying, verification.memberId:brenden} via firebase-admin+ADC against deployed mirrorActiveCallToLamp -> prompts/brenden {state:verifying, callId:demo, token:<hmac>} and households/demo/feed/demo (full CallDoc) both confirmed via Firestore REST GET (200, no auth); grep confirms exactly one onDocumentWritten('calls/ in functions/src/lamp.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "HouseholdMember.passkeys carries the full {id,publicKey,counter,transports,deviceType,backedUp} shape needed by verifyAuthenticationResponse"
    verification:
      - kind: unit
        ref: "functions/src/verification/passkeyRegistration.test.ts (5 tests: rpID scoping, excludeCredentials population, expired-challenge rejection, verified-ceremony append with base64url-encoded publicKey, failed-verification rejection)"
        status: pass
    human_judgment: false
  - id: D3
    description: "answerVerification rejects any answer:'yes' lacking both a valid passkey assertion and a valid VER-05 token; marks verified/scam by calling the real releaseCall/forceEndCall; a second answer for the same call is rejected; the passkey counter updates after every successful assertion"
    requirement: "VER-03"
    verification:
      - kind: unit
        ref: "functions/src/verification/passkeyAuthentication.test.ts (9 tests: no/timeout end the call via forceEndCall, yes+passkey calls releaseCall and persists newCounter, yes+token (VER-05, no WebAuthn call) calls releaseCall, bare yes -> invalid-argument, second answer -> failed-precondition, bad token -> permission-denied, bad assertion -> permission-denied, allowCredentials scoping)"
        status: pass
      - kind: other
        ref: "live against deployed answerVerification: VER-05 token path -> {verified:true}, lamp/current -> state:verified name:Brenden; answer:no -> {verified:false}, lamp/current -> state:scam; second answer on the same call -> failed-precondition 'Already answered'; bare {answer:'yes'} -> invalid-argument; unknown callId -> not-found; missing/expired challenge -> permission-denied; calls/{id} itself confirmed still closed (403 on direct GET)"
        status: pass
    human_judgment: false
  - id: D4
    description: "\"No\" or 20s timeout marks scam, ends the call via the real Twilio call-control path, using the same field names (state/outcome/endedAt) runTurn's AI-initiated end path already uses"
    requirement: "VER-04"
    verification:
      - kind: unit
        ref: "functions/src/verification/passkeyAuthentication.test.ts > answerVerification > answer:no / answer:timeout"
        status: pass
      - kind: other
        ref: "live: answer:no on a real deployed call -> lamp/current reflects state:scam within ~3s"
        status: pass
    human_judgment: false
  - id: D5
    description: "startPasskeyRegistration/finishPasskeyRegistration and startPasskeyAuthentication produce real, deployed, working onCall endpoints (VER-01 backend half)"
    verification:
      - kind: other
        ref: "live curl against deployed startPasskeyRegistration -> options with rp.id:'porchlight-hack.web.app', excludeCredentials:[]; deployed startPasskeyAuthentication -> allowCredentials scoped to brenden's stored passkeys (empty, none enrolled yet)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A real phone/browser completes an actual WebAuthn registration+authentication ceremony end-to-end against the deployed site"
    verification: []
    human_judgment: true
    rationale: "Requires a real platform authenticator (Face ID/Touch ID/Android biometric) on a physical device hitting the deployed porchlight-hack.web.app origin, and 04-02's frontend UI to drive navigator.credentials -- neither exists in this CLI-only backend plan. All server-side ceremony logic is unit-tested and the options-generation endpoints are live-curl-verified; the VER-05 link fallback (also live-verified) removes this as a hard demo dependency."

duration: 55min
completed: 2026-09-22
status: complete
---

# Phase 4 Plan 1: Passkey Schema, Verification Callables, and Mirror Fan-Out Summary

Extended the household schema with a real WebAuthn-verifiable passkey shape, extended Phase 3's single `calls/{id}` mirror trigger to fan out `prompts/{memberId}` (carrying a fresh VER-05 HMAC token) and `households/{id}/feed/{callId}`, and shipped four `onCall` Functions -- `startPasskeyRegistration`, `finishPasskeyRegistration`, `startPasskeyAuthentication`, and `answerVerification` -- where `answerVerification` is the single decision point that never marks a call verified without a real passkey assertion or a valid single-use link token, and always calls into Phase 2's real `releaseCall`/`forceEndCall` for the actual Twilio action. All four Functions and the extended mirror trigger were deployed live and proven end-to-end against the real `porchlight-hack` project.

## Performance

- **Duration:** ~55 min
- **Started:** 2026-09-22T23:53:00Z (approx.)
- **Completed:** 2026-09-22T00:20:00Z
- **Tasks:** 4/4 completed (Task 2's checkpoint was pre-approved by the orchestrator per dispatch instructions)
- **Files modified:** 13 (6 created, 7 modified), 4 commits

## Accomplishments
- `packages/shared/src/households.ts`'s `HouseholdMember.passkeys: PasskeyCredential[]` gives `verifyAuthenticationResponse` the public key + signature counter it actually needs -- the legacy `passkeyCredentialIds: string[]` field is left in place, unused.
- `functions/src/lamp.ts`'s `mirrorActiveCallToLamp` (Phase 3's existing trigger, not a second one) now fans out `prompts/{memberId}` with a fresh VER-05 HMAC token whenever a call enters `verifying`, clears the prompt to `{state:'none'}` on verdict/end, and unconditionally mirrors the full call doc to `households/{householdId}/feed/{callId}` -- proven live end-to-end via a real deployed write.
- `functions/src/verification/verifyLink.ts`'s `mintVerifyToken`/`checkVerifyToken` implement the VER-05 fallback with `createHmac('sha256', ...)` and `timingSafeEqual` (never `===`).
- `@simplewebauthn/server@14.0.2` installed after Task 2's pre-approved legitimacy checkpoint confirmed `repository.url` -> `github.com/MasterKale/SimpleWebAuthn`.
- `functions/src/verification/webauthn.ts` hard-codes `rpID`/`origin` and confirmed the exact `isoBase64URL.toBuffer`/`fromBuffer` method names from the installed package's own `.d.ts` (Open Question 1 in 04-RESEARCH.md, resolved).
- `startPasskeyRegistration`/`finishPasskeyRegistration` (VER-01) and `startPasskeyAuthentication`/`answerVerification` (VER-03/04/05) are all deployed and live-curl-verified: the VER-05 token path marks a call verified end-to-end (`lamp/current` follows to `state:verified`), `answer:'no'` ends a call as scam (`lamp/current` follows to `state:scam`), a bare `{answer:'yes'}` is rejected, a second answer on the same call is rejected, and `calls/{id}` itself remains closed to direct reads (403 confirmed).
- 14 new Vitest cases (5 registration + 9 authentication) all pass; full workspace `pnpm -r typecheck` and `functions` `pnpm run build` both exit 0; all 37 functions tests (23 pre-existing + 14 new) pass.

## Task Commits

Each task was committed atomically:

1. **Task 1: Household schema + mirror fan-out to prompts/{memberId} and feed/{callId}** - `b480b63` (feat)
2. **Task 2: Package-legitimacy checkpoint (pre-approved, no code change)** - N/A
3. **Task 3: startPasskeyRegistration/finishPasskeyRegistration (VER-01)** - `955c8ef` (feat)
4. **Task 4: answerVerification + startPasskeyAuthentication (VER-03/04/05)** - `a83a67c` (feat)
5. **Live-verification bug fix: missing secret bindings on answerVerification** - `cb6264b` (fix)

**Plan metadata:** this SUMMARY's own commit (immediately following).

## Files Created/Modified
- `packages/shared/src/households.ts` - adds `PasskeyCredential` and `HouseholdMember.passkeys?`
- `functions/src/lamp.ts` - `mirrorActiveCallToLamp` extended to fan out `prompts/{memberId}` and `households/{id}/feed/{callId}`
- `functions/src/secrets.ts` - adds `verifyLinkSecret = defineSecret('VERIFY_LINK_SECRET')`
- `functions/src/verification/webauthn.ts` - hard-coded rpID/origin, re-exports SimpleWebAuthn functions, `encodePublicKey`/`decodePublicKey`
- `functions/src/verification/verifyLink.ts` - `mintVerifyToken`/`checkVerifyToken` (HMAC-SHA256, `timingSafeEqual`)
- `functions/src/verification/passkeyRegistration.ts` + `.test.ts` - `startPasskeyRegistration`/`finishPasskeyRegistration`
- `functions/src/verification/passkeyAuthentication.ts` + `.test.ts` - `startPasskeyAuthentication`/`answerVerification`
- `functions/src/index.ts` - exports all four new Functions
- `functions/package.json` / `pnpm-lock.yaml` - adds `@simplewebauthn/server@14.0.2`
- `firestore.rules` - adds `prompts/{memberId}` and `households/{householdId}/feed/{callId}` (public `get`, no client write)

## Decisions Made
See `key-decisions` in frontmatter above -- summarized: verification map fields are read-merged-and-replaced (not dot-notation) to match `runTurn.ts`'s existing convention; `answerVerification` writes only `verification.*` itself for the "yes" path and lets the real `releaseCall` own `state`/`outcome`/the Twilio hand-off (no duplicate write), while the "no"/"timeout" path writes `state`/`outcome`/`endedAt` itself since `forceEndCall` is Twilio-only; registration's household update uses a plain read-then-update rather than a Firestore transaction, acceptable for this single-demo-household scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `answerVerification` never bound the secrets it needs, found live**
- **Found during:** Post-deploy live verification (after Task 4's commit)
- **Issue:** Cloud Functions v2 only injects a `defineSecret()` value into the specific function instance that declares it via `secrets:[...]` in its own `onCall` options. `answerVerification` calls `checkVerifyToken` (needs `VERIFY_LINK_SECRET`) and `releaseCall`/`forceEndCall` (need the two Twilio secrets) but never declared any of the three. A live curl with a genuinely valid VER-05 token was rejected with a false-negative `"Bad or expired link"` because `verifyLinkSecret.value()` returned empty in that function's runtime.
- **Fix:** Added `secrets: [twilioAccountSid, twilioAuthToken, verifyLinkSecret]` to `answerVerification`'s `onCall` options, mirroring `forceVerdict`'s existing pattern in `endCall.ts`. Redeployed just that function.
- **Files modified:** `functions/src/verification/passkeyAuthentication.ts`
- **Verification:** Live re-curl with the same token now returns `{verified:true}` and `lamp/current` follows to `state:verified`; the full live test matrix (no/timeout, bare-yes, second-answer, bad-token, bad-assertion, unknown-call) was re-run post-fix and all pass.
- **Committed in:** `cb6264b`

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug), found during this plan's own live post-deploy verification (not caught by unit tests, since mocked `checkVerifyToken`/`releaseCall`/`forceEndCall` never touch the real Cloud Functions secret-binding mechanism).
**Impact on plan:** Necessary for `answerVerification`'s VER-05 fallback and Twilio call-control to work at all in production; no scope creep -- the fix is exactly the missing config `forceVerdict` already had.

## Issues Encountered

**Cross-project Firestore traffic during live verification (not a defect).** While polling `prompts/brenden` for this plan's own test writes, one read showed `callId: "pm-smoke-2"` instead of this plan's own test call id -- almost certainly real or adjacent traffic against the shared `porchlight-hack` demo project (same class of cross-executor interference documented in `03-02-SUMMARY.md`'s Issues Encountered). Every deliverable in `coverage` above was verified by writing a uniquely-timestamped test call and polling until `prompts/brenden.callId` matched that specific id before asserting on the result, so no observation here is attributable to unrelated traffic. All test/junk Firestore docs created during this plan's live verification (`calls/demo`, `calls/plan0401-vertest-*`, their `households/demo/feed/*` mirrors) were deleted afterward; `prompts/brenden` and `lamp/current` were reset to their idle/none states. A leftover `webauthnChallenges/brenden` doc (60s TTL, from the live `startPasskeyAuthentication` smoke test) was left in place -- harmless, self-expiring in effect, and will be overwritten by the first real enrollment.

## User Setup Required

None further -- `VERIFY_LINK_SECRET` was generated (`openssl rand -hex 32`) and set non-interactively via `firebase functions:secrets:set VERIFY_LINK_SECRET --data-file=...` during this plan's own execution (not printed anywhere in this SUMMARY or the repo, per the dispatch instructions). It is bound to `mirrorActiveCallToLamp` and `answerVerification`, the only two Functions that read it.

## Next Phase Readiness

**Ready:** 04-02 (member verify app) can build directly against `prompts/{memberId}` (public-read, carries `callId`/`state`/`claimedIdentity`/`promptedAt`/`token`) and all four callable names/payload shapes documented in this plan's code (`startPasskeyRegistration({memberId})`, `finishPasskeyRegistration({memberId, response})`, `startPasskeyAuthentication({memberId})`, `answerVerification({callId, memberId, answer, response?, token?})`). 04-03 (dashboard) can build directly against `households/{id}/feed/{callId}` (public-read, full `CallDoc` shape, confirmed live). Nothing in `apps/web` was touched by this plan.

**Blocked/open:** D6 (a real physical passkey ceremony end-to-end on a real device) cannot be verified until 04-02 ships the frontend `navigator.credentials` UI -- the VER-05 link fallback (fully live-verified in this plan) removes this as a hard demo dependency if the WebAuthn timebox is blown.

---
*Phase: 04-family-verification-and-dashboard*
*Completed: 2026-09-22*

## Self-Check: PASSED

- `packages/shared/src/households.ts` (PasskeyCredential): FOUND
- `functions/src/lamp.ts` (extended mirror): FOUND
- `functions/src/verification/webauthn.ts`: FOUND
- `functions/src/verification/verifyLink.ts`: FOUND
- `functions/src/verification/passkeyRegistration.ts` + `.test.ts`: FOUND
- `functions/src/verification/passkeyAuthentication.ts` + `.test.ts`: FOUND
- `firestore.rules` (prompts/, households/*/feed/*): FOUND
- Commits `b480b63`, `955c8ef`, `a83a67c`, `cb6264b`: all FOUND via `git log --oneline --all`
- `pnpm --filter functions test`: 37/37 pass (23 pre-existing + 14 new)
- `pnpm -r typecheck`: exits 0 (functions, packages/shared, apps/web)
- `pnpm --filter functions build`: exits 0; bundle exports all four new Functions (confirmed via `node -e require(...)`)
- Deployed live: `startPasskeyRegistration`, `finishPasskeyRegistration`, `startPasskeyAuthentication`, `answerVerification`, `mirrorActiveCallToLamp` all confirmed via live curl/Firestore REST reads (see `coverage` above)
- `git status --short` clean before writing this SUMMARY
