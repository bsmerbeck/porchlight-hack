---
phase: 05-attack-simulator-demo-hardening-and-pitch
plan: 01
subsystem: infra
tags: [firebase-functions, firestore-triggers, anthropic, cloud-secrets, raspberry-pi, sense-hat, demo-tooling]

# Dependency graph
requires:
  - phase: 04-family-verification-and-dashboard
    provides: "mirrorActiveCallToLamp's unconditional calls/{id} -> households/{id}/feed/{callId} fan-out (04-01), which writeFamilyReport relies on for zero-extra-code propagation"
  - phase: 03-lamp
    provides: "pi/lamp.py's Sense HAT framebuffer render loop, joystick evdev reader, and deploy.sh (03-01/03-02)"
  - phase: 02-core-screening-loop
    provides: "forceEndCall(callSid, sayLine) Twilio call-control helper (endCall.ts) and the Anthropic client/lazy-singleton pattern (runTurn.ts)"
provides:
  - "resetDemo onCall Function (DEMO_TOKEN-gated, timingSafeEqual) + pnpm demo:reset -- one-command wipe of calls/*, prompts/*, lamp/current, with households/demo restored to baseline minus any enrolled passkeys"
  - "writeFamilyReport onDocumentWritten trigger -- claude-sonnet-5 plain-English post-call report on the endedAt transition, with a fixed fallback string on API failure"
  - "pi/lamp.py joystick local demo-mode cycling (idle->screening->verifying->verified->scam) + --selftest CLI flag + GET /joystick state field"
affects: [05-02, 05-03, rehearsal plans, pitch-day runbook]

# Actuals (#2632)
actuals:
  tokens: 9148
  tasks: 3
  commits: 4
  plan_head_before: 0e834cbf3fb67c72471e929eed24f38f3f8d9d36

tech-stack:
  added: []
  patterns:
    - "DEMO_TOKEN shared-secret gate: crypto.timingSafeEqual on equal-length buffers, checked as the FIRST statement in the handler body (before any Firestore/Twilio call), mirroring verifyLink.ts's checkVerifyToken -- verified by source-order grep, not just behavior"
    - "Reset-with-preservation: read-then-merge a household doc's mutable sub-fields (member passkeys) forward across a full baseline overwrite, rather than a partial update -- keeps the reset destination deterministic while protecting one specific field"
    - "Shared frame_for_state() dispatch on the Pi: one function backs the continuous render loop, the joystick's local cycle, AND --selftest, so a bridge-driven state and a joystick-driven state can never visually diverge"

key-files:
  created:
    - functions/src/demo/resetDemo.ts
    - functions/src/demo/resetDemo.test.ts
    - functions/src/reports/writeFamilyReport.ts
    - functions/src/reports/writeFamilyReport.test.ts
    - scripts/demo-reset.mjs
    - pi/test_lamp.py
  modified:
    - functions/src/secrets.ts
    - functions/src/index.ts
    - package.json
    - .gitignore
    - pi/lamp.py

key-decisions:
  - "resetDemo's ResetDemoInput schema makes `token` optional (z.string().optional()) rather than required, so a missing token fails the SAME permission-denied gate as a wrong one instead of a raw ZodError -- the acceptance criteria requires 'wrong OR missing token' to both produce zero side effects."
  - "writeFamilyReport guards on `!before?.endedAt && after?.endedAt` (not a `report` field check) -- this both fires exactly once per call AND makes the trigger's own report-only write incapable of re-triggering itself, since that write never touches endedAt."
  - "Pi joystick cycling repurposes up/down/left/right (previously ALL five joystick codes, including directions, set the alert flag) to drive a local demo-mode cycle instead; only the center button (KEY_ENTER) keeps the pre-existing alert-flag behavior, confirmed unchanged via diff."
  - "render_loop's inline state->frame if/elif was extracted into a standalone frame_for_state() function (behavior-preserving refactor) so --selftest and the joystick cycle share the exact same rendering logic instead of a second, competing implementation."

requirements-completed: [RISK-04, DEMO-01]

coverage:
  - id: D1
    description: "resetDemo onCall (DEMO_TOKEN-gated) + pnpm demo:reset wipes calls/*, prompts/*, resets lamp/current to idle, force-ends any still-live Twilio call, and restores households/demo's baseline while preserving an already-enrolled member passkey"
    requirement: "DEMO-01"
    verification:
      - kind: unit
        ref: "functions/src/demo/resetDemo.test.ts (5 tests: wrong token, missing token, full reset + passkey preservation, forceEndCall-throws resilience, unseeded-household baseline)"
        status: pass
      - kind: integration
        ref: "live against deployed porchlight-hack: seeded calls/x + prompts/brenden + a tampered households/demo (fake name + fake passkey), ran `pnpm demo:reset`, confirmed calls/x and prompts/brenden gone, lamp/current idle, households/demo name/members restored to baseline with the fake passkey preserved untouched; separately confirmed a wrong token returns PERMISSION_DENIED with zero side effects via curl"
        status: pass
    human_judgment: false
  - id: D2
    description: "writeFamilyReport (RISK-04): every call reaching endedAt grows a plain-English claude-sonnet-5 report on calls/{id}.report within ~30s, with a fixed fallback string if the Claude call fails, and zero extra mirror code needed for it to also appear on households/{id}/feed/{callId}"
    requirement: "RISK-04"
    verification:
      - kind: unit
        ref: "functions/src/reports/writeFamilyReport.test.ts (4 tests: fires once on the endedAt transition, never re-fires on an already-ended doc, never fires mid-call, fallback string on Claude throw)"
        status: pass
      - kind: integration
        ref: "live against deployed porchlight-hack: created calls/report-test with turns+risk+endedAt already set, confirmed calls/report-test.report and households/demo/feed/report-test.report both populated with a real Sonnet-generated summary within ~15s (test doc deleted after)"
        status: pass
    human_judgment: false
  - id: D3
    description: "pi/lamp.py joystick local demo-mode cycling (idle->screening->verifying->verified->scam, wrapping, name:Brenden while verified) via the shared frame_for_state() dispatch, plus --selftest and a new GET /joystick state field, with the center-button alert path unchanged"
    requirement: "DEMO-01"
    verification:
      - kind: unit
        ref: "pi/test_lamp.py (9 tests: forward/backward wrapping, verified-name set/clear, shared-dispatch coverage, --selftest state-sequence data check)"
        status: pass
      - kind: manual_procedural
        ref: "ssh pi@169.254.10.2 'python3 lamp.py --selftest' after pi/deploy.sh: visibly cycled all 5 states on the physical LED matrix and exited 0; GET /joystick confirmed to return the new {state:...} field; git diff confirms the KEY_ENTER alert-flag branch is byte-identical to before this task"
        status: pass
    human_judgment: true
    rationale: "The center joystick button's physical alert-raising behavior was verified by code diff and unit test (the assignment is untouched), not by physically pressing the button on the Pi during this execution -- a human should press it once during rehearsal to confirm end-to-end feel, and visually judge the LED cycling quality on the actual hardware."

duration: 40min
completed: 2026-09-22
status: complete
---

# Phase 5 Plan 1: resetDemo + writeFamilyReport + Pi joystick demo mode Summary

**One-command demo reset (`pnpm demo:reset`) via a DEMO_TOKEN-gated callable, automatic claude-sonnet-5 post-call family reports, and a Raspberry Pi joystick that locally cycles all five lamp states plus a `--selftest` hardware check.**

## Performance

- **Duration:** ~40 min (including two live Firebase deploys and physical-Pi SSH verification)
- **Started:** 2026-09-22T04:40:00Z
- **Completed:** 2026-09-22T05:15:00Z
- **Tasks:** 3/3 completed
- **Files modified:** 11 (6 created, 5 modified)

## Accomplishments

- **resetDemo (DEMO-01):** DEMO_TOKEN-gated `onCall` Function whose very first statement is a `crypto.timingSafeEqual` comparison (confirmed via grep to precede any `.collection(`/`forceEndCall(` in source order) -- a wrong or missing token throws `permission-denied` with zero Firestore/Twilio side effects. On a valid token it force-ends any still-live Twilio call before deleting `calls/*` (except explicit `keepCallIds`), clears `prompts/*`, resets `lamp/current` to idle, and restores `households/demo`'s baseline name/members while carrying forward any already-enrolled member's `passkeys` array untouched. `scripts/demo-reset.mjs` (`pnpm demo:reset`) posts the standard callable-protocol envelope to the deployed Function.
- **writeFamilyReport (RISK-04):** `onDocumentWritten('calls/{callId}')` trigger that fires exactly once per call, on the `before.endedAt` unset -> `after.endedAt` set transition (which also makes its own report-only write incapable of re-triggering itself). Builds a plain-English prompt from turns/risk/outcome and calls `claude-sonnet-5` for a 2-4 sentence family-facing summary, falling back to a fixed string if the API call throws. No new mirror code was needed for the report to also appear on `households/{id}/feed/{callId}` -- Phase 4's existing `mirrorActiveCallToLamp` trigger already re-copies the whole `calls/{id}` doc on every write.
- **Pi joystick demo mode + --selftest:** Extracted the render loop's inline state-dispatch into a single shared `frame_for_state()` function, then repurposed the joystick's up/down/left/right (previously all five directions set the alert flag) to locally cycle `idle -> screening -> verifying -> verified -> scam` through that same shared dispatch, wrapping at both ends, with `name` set to "Brenden" only while verified. The center button's pre-existing alert-flag behavior is byte-identical to before. Added `--selftest` (walks all 5 states, 2s each, exits 0, no HTTP server) and a new `state` field on `GET /joystick` for optional bridge mirroring. Redeployed via `pi/deploy.sh`; `--selftest` run live over SSH visibly cycled all 5 states on the physical LED matrix.

## Task Commits

Each task was committed atomically (Task 2 followed the TDD RED->GREEN cycle per its `tdd="true"` attribute):

1. **Task 1: resetDemo callable + pnpm demo:reset (DEMO-01)** - `a5ac512` (feat)
2. **Task 2 RED: failing tests for writeFamilyReport** - `65400c8` (test)
2. **Task 2 GREEN: implement writeFamilyReport** - `d27b4cd` (feat)
3. **Task 3: Pi joystick demo mode + --selftest + redeploy** - `7e88598` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP, per parallel-executor convention: STATE.md/ROADMAP.md are NOT updated by this executor per dispatch instructions)

## Files Created/Modified

- `functions/src/demo/resetDemo.ts` - DEMO_TOKEN-gated onCall reset, timingSafeEqual gate first
- `functions/src/demo/resetDemo.test.ts` - 5 tests covering the gate and full reset behavior
- `functions/src/reports/writeFamilyReport.ts` - claude-sonnet-5 post-call report trigger
- `functions/src/reports/writeFamilyReport.test.ts` - 4 behavior tests (RED then GREEN)
- `scripts/demo-reset.mjs` - `pnpm demo:reset` implementation (callable-protocol POST)
- `pi/test_lamp.py` - 9 stdlib-only unit tests for joystick cycling + selftest sequence
- `functions/src/secrets.ts` - added `demoToken = defineSecret('DEMO_TOKEN')`
- `functions/src/index.ts` - exported `resetDemo` and `writeFamilyReport`
- `package.json` - added `"demo:reset": "node scripts/demo-reset.mjs"`
- `.gitignore` - added `scripts/.demo.env`
- `pi/lamp.py` - extracted `frame_for_state()`, added joystick demo-mode cycling, `--selftest`, `GET /joystick` state field

## Decisions Made

See `key-decisions` in frontmatter above -- summarized: `token` is optional in resetDemo's zod schema so missing and wrong tokens hit the identical permission-denied gate; writeFamilyReport guards on the `endedAt` transition itself (not a `report` presence check) so its own write can never re-trigger it; the Pi's joystick directions were repurposed from "alert flag" to "local demo cycle" (center button unchanged), backed by one shared `frame_for_state()` dispatch instead of a second render implementation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `_JOYSTICK_CODES` set became dead code after splitting ENTER from the directional keys**
- **Found during:** Task 3
- **Issue:** The original `code in _JOYSTICK_CODES` single check covered all five joystick inputs; once ENTER was split out from up/down/left/right, the set was no longer referenced anywhere.
- **Fix:** Removed the unused `_JOYSTICK_CODES` constant.
- **Files modified:** `pi/lamp.py`
- **Verification:** `python3 -m py_compile pi/lamp.py` and the full `pi/test_lamp.py` suite still pass.
- **Committed in:** `7e88598` (part of Task 3's commit)

**2. [Rule 2 - Missing critical functionality] Joystick-driven state changes would have been silently reverted by the 60s watchdog**
- **Found during:** Task 3
- **Issue:** The existing `watchdog_loop` reverts `lamp/current` (local `_state["target"]`) to idle if `_last_post_at` (only ever updated by a bridge `POST /state`) goes stale for 60 seconds. Without an update, a joystick-driven demo state would silently flip back to idle mid-demo even while someone was actively using the joystick, which would look broken on stage.
- **Fix:** `_cycle_joystick_state`'s two call sites in `joystick_loop` also update `_last_post_at`, so local joystick activity keeps the watchdog from firing exactly like a bridge POST does.
- **Files modified:** `pi/lamp.py`
- **Verification:** Manual reasoning + code review (not separately unit-tested, since it only affects a 60s-idle timer); does not change any test's pass/fail outcome.
- **Committed in:** `7e88598` (part of Task 3's commit)

**3. [Rule 1 - Bug] Live-verification test fixture left a fake passkey in the real households/demo doc**
- **Found during:** post-Task-3 live verification of `resetDemo`
- **Issue:** To prove `resetDemo` preserves an already-enrolled passkey, the live-verification step seeded `households/demo` with a fake `passkeys` entry (`seed-cred`) before calling `pnpm demo:reset`. Because `resetDemo` correctly preserves whatever passkeys exist, that fake credential persisted in the live demo household after the reset -- exactly the resetDemo behavior working as designed, but leaving test debris that could confuse a later real passkey enrollment/verification flow.
- **Fix:** Ran a one-off admin write restoring `households/demo` to the pure baseline (no `passkeys` field), matching its state before this plan's live verification began.
- **Files modified:** none (Firestore data only, not source)
- **Verification:** Re-read `households/demo` live and confirmed no `passkeys` field remains.
- **Committed in:** N/A (data-only cleanup, no code change)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bug/cleanup, 1 Rule 2 missing-critical-functionality)
**Impact on plan:** All three were necessary for correctness (dead code, watchdog interference, and test-data cleanup) and none represent scope creep beyond this plan's own Task 3 and its live verification.

## Issues Encountered

None blocking. `gsd_run check tdd-red-evidence` (the formal RED-evidence verifier referenced in the TDD gate-enforcement reference) is not installed in this repository, so Task 2's RED phase was validated manually: the test run's output was inspected to confirm the two behavior-dependent tests (`triggers exactly one claude-sonnet-5 call...` and `writes a fallback report...`) failed on real assertions against a no-op stub (not on an import/collection/fixture error), while the two guard tests passed trivially against the same stub -- the same signal `RED_EVIDENCE_OK` would certify, just checked by hand instead of by the CLI.

## User Setup Required

**External services require manual configuration.**
- `DEMO_TOKEN` was generated (`openssl rand -hex 24`) and set non-interactively via `firebase functions:secrets:set DEMO_TOKEN --data-file=- --project porchlight-hack`. A local copy lives at `scripts/.demo.env` (gitignored, `DEMO_TOKEN=<value>`) for `pnpm demo:reset` to read. The value is not printed anywhere in this SUMMARY or the repo.
- No other new external service configuration required (Anthropic/Twilio/Firebase secrets were already bound from earlier phases).

## Next Phase Readiness

- `resetDemo`/`pnpm demo:reset` and `writeFamilyReport` are both deployed live and proven end-to-end against `porchlight-hack` -- later Phase 5 plans (attack simulator, rehearsals) can call `pnpm demo:reset` between runs without any residual junk calls, prompts, or a stale lamp state, and can rely on every ended call growing a real `report` field automatically.
- The Pi's joystick now doubles as a standalone attraction (`idle -> screening -> verifying -> verified -> scam` cycling) usable with no call in progress -- useful for booth/pitch-adjacent demoing before or after the live 3-minute script. `--selftest` gives a fast pre-demo hardware smoke test (`ssh pi@169.254.10.2 'cd ~/lamp && python3 lamp.py --selftest'` -- note: deployed path is actually `~/porchlight/pi`, matching `pi/deploy.sh`'s real destination, not the `~/lamp` path mentioned in the plan's acceptance criteria).
- **Recommend a human physically press the joystick center button once during rehearsal** to confirm the family-alert flow still feels right end-to-end (code-verified only, not physically pressed during this execution).

---
*Phase: 05-attack-simulator-demo-hardening-and-pitch*
*Completed: 2026-09-22*

## Self-Check: PASSED

- All 6 created files confirmed present on disk (`functions/src/demo/resetDemo.ts`, `functions/src/demo/resetDemo.test.ts`, `functions/src/reports/writeFamilyReport.ts`, `functions/src/reports/writeFamilyReport.test.ts`, `scripts/demo-reset.mjs`, `pi/test_lamp.py`).
- All 4 task commits confirmed in `git log` (`a5ac512`, `65400c8`, `d27b4cd`, `7e88598`).
- Plan-level `<verification>` re-run: `pnpm --filter functions test` -> 46/46 passing (8 test files); `pnpm --filter functions build` and `pnpm -r typecheck` both exit 0; `python3 pi/test_lamp.py` -> 9/9 passing.
- Live deploy confirmed: `resetDemo` and `writeFamilyReport` both show in `firebase functions:list --project porchlight-hack` with correct trigger types (`callable`, `google.cloud.firestore.document.v1.written`).
- Live `pnpm demo:reset` run against the deployed project: `calls/*`/`prompts/*` emptied, `lamp/current` idle, `households/demo` restored to baseline with a seeded test passkey preserved; wrong-token curl confirmed `PERMISSION_DENIED` with zero side effects.
- Live `writeFamilyReport` run: a test call doc with `endedAt` set grew a real Sonnet-generated `report` string within ~15s, mirrored automatically to `households/demo/feed/report-test.report`; test doc deleted afterward.
- `pi/deploy.sh` redeploy confirmed via `/health`; `ssh pi@169.254.10.2 'python3 lamp.py --selftest'` (run from the deployed `~/porchlight/pi` directory) visibly cycled all 5 states and exited 0.
