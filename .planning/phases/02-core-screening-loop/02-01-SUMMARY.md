---
phase: 02-core-screening-loop
plan: 01
subsystem: ai
tags: [claude-haiku-4-5, anthropic-sdk, zod, firestore, cloud-functions-v2, vitest, react]

# Dependency graph
requires:
  - phase: 01-foundation-and-landing-page-live
    provides: "locked calls/{id} + households/{id} zod/TS schemas (packages/shared), functions/src/index.ts with defineSecret(ANTHROPIC_API_KEY), esbuild --alias shared-package pattern"
provides:
  - "runTurn(): the shared per-turn screening core — one claude-haiku-4-5 structured call + one Firestore update() per turn, called identically by every later telephony plan"
  - "simulateTurn/startSimulatedCall onCall Functions (DEMO-05), structurally locked to the demo household"
  - "JAIL_SCRIPT canonical scam-call fixture in packages/shared, shared by tests and the browser UI"
  - "/sim browser page — a working, zero-telephony reproduction of the full screening loop"
affects: ["02-02-elevenlabs-custom-llm", "02-03-post-call-and-forced-verdict", "phase-4-dashboard"]

actuals:
  tokens: 9700
  tasks: 3
  commits: 3

tech-stack:
  added: ["@anthropic-ai/sdk@0.127.0", "vitest@3.2.7"]
  patterns:
    - "runTurn() is the single source of truth for the screening turn: one structured-output Claude call, one Firestore update() — every caller (real telephony, simulator) constructs the same {callId, householdId, callerText} input and gets the same write shape back"
    - "Vendor secrets live in functions/src/secrets.ts (not index.ts) so any module can import a SecretParam directly without risking a circular-import module-evaluation-order hazard through index.ts"
    - "Vitest mocks @anthropic-ai/sdk and firebase-admin/firestore at the module level via vi.hoisted() + an in-memory fake Firestore that actually applies update()/arrayUnion() semantics, so multi-turn state (risk climbing, verifying) is exercised for real rather than asserted against a single captured call"

key-files:
  created:
    - functions/src/screening/riskSchema.ts
    - functions/src/screening/prompt.ts
    - functions/src/screening/matchIdentity.ts
    - functions/src/screening/runTurn.ts
    - functions/src/screening/runTurn.test.ts
    - functions/src/screening/simulateTurn.ts
    - functions/src/screening/simulateTurn.test.ts
    - functions/src/secrets.ts
    - functions/vitest.config.ts
    - packages/shared/src/fixtures.ts
    - apps/web/src/pages/Sim.tsx
  modified:
    - functions/package.json
    - functions/src/index.ts
    - packages/shared/src/index.ts
    - apps/web/src/App.tsx

key-decisions:
  - "Moved the four defineSecret() declarations out of functions/src/index.ts into a new functions/src/secrets.ts — simulateTurn.ts needs the anthropicKey SecretParam, and importing it back from index.ts (which itself imports simulateTurn.ts) would create a circular import where the secret binding is still undefined at the point simulateTurn.ts reads it (ESM/CJS module-evaluation-order hazard). index.ts now imports from and re-exports ./secrets.ts, preserving its public surface unchanged."
  - "runTurn.ts re-exports DEMO_HOUSEHOLD_ID from @porchlight/shared (packages/shared/households.ts) rather than redefining a second 'demo' string literal, per the plan's own instruction that a single canonical value should exist."
  - "Placed the /sim page at apps/web/src/pages/Sim.tsx, not apps/web/src/routes/sim.tsx as the plan's frontmatter named it — the plan pre-dates 01-02's apps/web/src/pages/ convention (Landing, AppPlaceholder, Stage all live there); matching the established convention was judged more valuable than the literal path string. Wired into App.tsx's existing pathname-based routing via React.lazy."
  - "functions/vitest.config.ts aliases @porchlight/shared to packages/shared/src/index.ts, mirroring the esbuild --alias flag used at build time — necessary because functions/package.json intentionally carries no workspace: specifier for the shared package (Phase 1 decision, Cloud Build's remote npm install can't resolve it), so Vitest has no other way to resolve the import."

patterns-established:
  - "Every screening entry point (real telephony in 02-02/02-03, the simulator here) is a thin adapter that resolves {callId, householdId, callerText} and calls runTurn() — no duplicate risk-scoring or Firestore-write logic anywhere else."
  - "Firestore mocking in tests: vi.hoisted() + an in-memory doc map that actually applies update()/set()/arrayUnion() semantics, not just spy-call assertions — lets multi-turn behavior (risk climbing across calls) be tested for real."

requirements-completed: [RISK-01, RISK-02, RISK-03, CALL-03, CALL-05, DEMO-05]

coverage:
  - id: D1
    description: "runTurn() performs one claude-haiku-4-5 structured call + one Firestore update() per turn, writing risk/tactics/claimedIdentity/recommendedAction under the locked camelCase schema; verify->verifying and end->scam/outcome/endedAt land in the SAME write"
    requirement: "RISK-01"
    verification:
      - kind: unit
        ref: "functions/src/screening/runTurn.test.ts (8 tests: single-call-per-invocation, risk-climb across 3 turns, verifying+memberId on matched alias, no-verifying on unrecognized identity, end sets state/outcome/endedAt in the same write, SYSTEM_PROMPT guardrail phrases, prompt-injection field-allowlist, null parsed_output fallback)"
        status: pass
    human_judgment: false
  - id: D2
    description: "simulateTurn/startSimulatedCall (onCall) reproduce the exact runTurn() behavior for DEMO-05, with no code path able to target a household other than 'demo' (SimulateTurnInput has no householdId field)"
    requirement: "DEMO-05"
    verification:
      - kind: unit
        ref: "functions/src/screening/simulateTurn.test.ts (4 tests: startSimulatedCall doc shape, 5-line JAIL_SCRIPT non-decreasing risk climb via runTurn, verifying+memberId via runTurn, householdId field absent from/ignored by SimulateTurnInput)"
        status: pass
      - kind: other
        ref: "pnpm --filter functions build && node -e \"require('./functions/lib/index.js').simulateTurn\" (typeof === 'function')"
        status: pass
    human_judgment: false
  - id: D3
    description: "/sim page runs the JAIL_SCRIPT end-to-end via startSimulatedCall + simulateTurn and renders the live calls/{id} doc via onSnapshot, isolated into its own lazy chunk"
    requirement: "CALL-03"
    verification:
      - kind: other
        ref: "pnpm --filter web build; apps/web/dist/assets/Sim-*.js exists as a separate chunk; grep for Sim page content returns 0 matches in the main index-*.js bundle"
        status: pass
    human_judgment: true
    rationale: "Build-level proof only — actually clicking 'Run scam script' and watching the transcript/risk meter update live requires a deployed Firebase project or running emulators (pnpm dev), which this non-interactive execution environment does not have available. A human must verify the live click-through per the plan's own manual verification step."

duration: ~25min
completed: 2026-09-21
status: complete
---

# Phase 2 Plan 1: runTurn() Screening Core + Browser Simulator Summary

One `claude-haiku-4-5` structured-output call per caller turn writes reply, climbing risk score, named tactics, and claimed-identity match to `calls/{id}` in a single Firestore `update()` — proven end-to-end through a `/sim` browser page that runs the grandchild-in-jail scam script with zero telephony, via the exact same code path a real call will use in 02-02/02-03.

## Performance

- **Duration:** ~25 min
- **Tasks:** 3/3 completed
- **Files modified:** 15 files changed (874 insertions, 10 deletions), excluding `pnpm-lock.yaml`

## Accomplishments
- `runTurn()` is the single shared screening core: one Claude call, one Firestore `update()`, writing `risk.score/tactics/claimedIdentity/recommendedAction` under the exact locked camelCase schema (Pitfall 8) — proven by 8 Vitest cases against a mocked Anthropic client and an in-memory fake Firestore that actually applies `arrayUnion`/`update` semantics.
- Prompt-injection guardrail: `SYSTEM_PROMPT` asserts "never reveal" / "never agree to a payment" verbatim, and a dedicated test proves an adversarial `callerText` cannot make the Firestore write carry any field beyond `{turns, risk, state?, verification?, outcome?, endedAt?}`.
- `recommendedAction:'end'` persists `state:'scam'`, `outcome:'scam'`, `endedAt` in the SAME write as the reply — CALL-05 is satisfied with zero Twilio/webhook involvement.
- `simulateTurn`/`startSimulatedCall` (onCall Functions) reproduce the identical `runTurn()` behavior for DEMO-05; the input schema has no `householdId` field at all, so the endpoint structurally cannot address any household but `'demo'` (ASVS L1 mitigation, T-02-02).
- `/sim` page runs the 5-line `JAIL_SCRIPT` end-to-end and renders the live `calls/{id}` doc via `onSnapshot`, compiled into its own lazy chunk (`Sim-*.js`) with zero footprint in the landing page's main bundle.

## Task Commits

Each task was committed atomically:

1. **Task 1: runTurn() — Claude structured turn, Firestore write, identity match, AI-initiated end** - `2cf88f5` (feat)
2. **Task 2: simulateTurn onCall + grandchild-in-jail fixture — DEMO-05** - `0bae1c4` (feat)
3. **Task 3: Browser call simulator — /sim page** - `46648ef` (feat)

**Plan metadata:** (this commit, immediately following)

## Files Created/Modified
- `functions/src/screening/riskSchema.ts` - `RiskTurn` zod schema (RISK-01 structured-output contract)
- `functions/src/screening/prompt.ts` - `SYSTEM_PROMPT` screener persona + guardrails
- `functions/src/screening/matchIdentity.ts` - case-insensitive alias matcher against `households/{id}.members` (RISK-03)
- `functions/src/screening/runTurn.ts` - the shared per-turn core; one Claude call, one Firestore `update()`
- `functions/src/screening/runTurn.test.ts` - 8 Vitest cases against mocked Anthropic + firebase-admin/firestore
- `functions/src/screening/simulateTurn.ts` - `startSimulatedCall` + `simulateTurn` onCall Functions (DEMO-05)
- `functions/src/screening/simulateTurn.test.ts` - 4 Vitest cases proving the identical `runTurn` path + household lockout
- `functions/src/secrets.ts` - the four `defineSecret()` declarations, extracted from `index.ts` to break a circular import
- `functions/vitest.config.ts` - aliases `@porchlight/shared` to source, mirroring the esbuild build-time alias
- `packages/shared/src/fixtures.ts` - `JAIL_SCRIPT`, the canonical grandchild-in-jail scam script
- `apps/web/src/pages/Sim.tsx` - the browser call simulator page
- `functions/package.json` - added `@anthropic-ai/sdk@0.127.0`, `vitest@3.2.7`, and a `test` script
- `functions/src/index.ts` - imports/re-exports secrets from `./secrets.ts`; exports `startSimulatedCall`/`simulateTurn`
- `packages/shared/src/index.ts` - re-exports `fixtures.ts`
- `apps/web/src/App.tsx` - adds a `/sim` pathname route, `React.lazy`-loaded

## Decisions Made
- Extracted `functions/src/secrets.ts` to avoid a circular import between `index.ts` (which imports `simulateTurn.ts`) and `simulateTurn.ts` (which needs the `anthropicKey` SecretParam) — see key-decisions above for the full module-evaluation-order rationale.
- `runTurn.ts` re-exports `DEMO_HOUSEHOLD_ID` from `@porchlight/shared` instead of redefining the string literal, keeping the demo household id defined exactly once (Phase 1's `households.ts`).
- `/sim` lives at `apps/web/src/pages/Sim.tsx`, matching the `pages/` convention established since 01-02, rather than the `apps/web/src/routes/sim.tsx` path named in the plan's frontmatter (written before that convention existed).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Circular import between index.ts and simulateTurn.ts**
- **Found during:** Task 2
- **Issue:** The plan's design has `simulateTurn.ts` bind `secrets: [anthropicKey]`, where `anthropicKey` was declared in `index.ts`. `index.ts` also imports and re-exports `simulateTurn`/`startSimulatedCall` from `simulateTurn.ts`. Importing `anthropicKey` back from `index.ts` inside `simulateTurn.ts` would create a circular import where, due to ESM import hoisting, `simulateTurn.ts` evaluates before `index.ts` reaches the `const anthropicKey = defineSecret(...)` line — the binding would be `undefined` at the point `simulateTurn.ts` uses it.
- **Fix:** Extracted all four `defineSecret()` calls into a new `functions/src/secrets.ts` module with no dependents in the screening code; `index.ts` now imports and re-exports from `./secrets.ts` (public surface unchanged), and `simulateTurn.ts` imports `anthropicKey` directly from `./secrets.ts` — no cycle.
- **Files modified:** `functions/src/secrets.ts` (new), `functions/src/index.ts`
- **Verification:** `pnpm --filter functions build` and `pnpm --filter functions typecheck` both exit 0; `node -e "require('./functions/lib/index.js').simulateTurn"` returns a function.
- **Committed in:** `0bae1c4` (part of Task 2 commit)

**2. [Rule 1 - Convention mismatch] /sim page path**
- **Found during:** Task 3
- **Issue:** The plan's frontmatter/action text named `apps/web/src/routes/sim.tsx`, but `apps/web/src/App.tsx` already routes to `apps/web/src/pages/{Landing,AppPlaceholder,Stage}.tsx` (established in Phase 1 Plan 02, after this plan's frontmatter was written).
- **Fix:** Created `apps/web/src/pages/Sim.tsx` instead, matching the existing convention, and wired it into `App.tsx`'s existing pathname-based routing with `React.lazy`.
- **Files modified:** `apps/web/src/pages/Sim.tsx` (new, in place of the planned `routes/sim.tsx`), `apps/web/src/App.tsx`
- **Verification:** `pnpm --filter web build` produces `apps/web/dist/assets/Sim-*.js` as its own chunk; `pnpm --filter web typecheck` exits 0.
- **Committed in:** `46648ef` (part of Task 3 commit)

**3. [Rule 3 - Blocking issue] No test runner existed in the monorepo**
- **Found during:** Task 1
- **Issue:** The plan requires `pnpm --filter functions test -- runTurn` to run, but no test framework was installed anywhere in the monorepo (Phase 1 shipped zero tests).
- **Fix:** Added `vitest@3.2.7` as a devDependency, a `test: "vitest run"` script in `functions/package.json`, and `functions/vitest.config.ts` (aliases `@porchlight/shared` to source, mirroring the esbuild build-time alias, since `functions/package.json` intentionally carries no `workspace:` specifier for the shared package per Phase 1's decision).
- **Files modified:** `functions/package.json`, `functions/vitest.config.ts` (new)
- **Verification:** `pnpm --filter functions test` exits 0 (12/12 tests pass across both spec files).
- **Committed in:** `2cf88f5` (part of Task 1 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 3 - blocking issue, 1 Rule 1 - convention consistency)
**Impact on plan:** All three were necessary to make the plan's own acceptance criteria and verify commands runnable at all (no test runner existed) or to avoid a correctness bug that would have shipped silently (the circular import would have made `anthropicKey` undefined inside `simulateTurn`'s options object at module load, which is not something a type-checker catches). The `/sim` page's file location changed but its behavior did not. No scope creep — no functionality was added or removed beyond what the plan specified.

## Issues Encountered

Two of the plan's literal `<verify>` shell commands do not match this repo's actual esbuild/Vite output byte-for-byte, though the underlying artifacts they're checking for are present and correct:

1. `grep -c "exports.simulateTurn" functions/lib/index.js` returns `0` — esbuild's CJS output for this bundle uses a `__export(exports2, { simulateTurn: () => simulateTurn, ... })` getter-map pattern (confirmed pre-existing for `joinWaitlist` from Phase 1 too, not something introduced here), never a literal `exports.simulateTurn = ...` string. Verified instead via `node -e "typeof require('./functions/lib/index.js').simulateTurn === 'function'"` → `true`, and `startSimulatedCall` likewise.
2. `ls apps/web/dist/assets | grep -c sim` (case-sensitive) returns `0` — Vite names the chunk `Sim-<hash>.js` (capital S, matching the component's export name), not `sim-<hash>.js`. Verified instead via `ls apps/web/dist/assets | grep -c -i sim` → `1`, and confirmed the main `index-*.js` bundle contains zero occurrences of Sim-page-specific content (`grep -c "Run scam script" apps/web/dist/assets/index-*.js` → `0`).

Neither is a functional gap — both are pre-existing verify-command wording mismatches against this project's actual bundler output conventions, not defects in the code this plan produced.

## User Setup Required
None - no new external service configuration required. `ANTHROPIC_API_KEY` was already declared via `defineSecret` in Phase 1; this plan's `simulateTurn` binds the same secret object.

## Next Phase Readiness
`runTurn()` is the stable module every later Phase 2 plan calls into: 02-02 (ElevenLabs Custom LLM webhook) and 02-03 (post-call webhook + forced-verdict debug path) both resolve `{callId, householdId, callerText}` from their own transport (Custom LLM request, Twilio) and call this exact function — no risk-scoring or Firestore-write logic should be duplicated there. `/sim` gives a working DEMO-05 fallback independent of whether live telephony is ready by demo time. One live-environment gap remains: the actual click-through in `pnpm dev` with Firebase emulators (or a deployed project) has not been manually verified in this non-interactive execution — do that before relying on `/sim` as the live demo fallback.

---
*Phase: 02-core-screening-loop*
*Completed: 2026-09-21*

## Self-Check: PASSED

All 11 key created files verified present on disk (riskSchema.ts, prompt.ts, matchIdentity.ts,
runTurn.ts, runTurn.test.ts, simulateTurn.ts, simulateTurn.test.ts, secrets.ts, vitest.config.ts,
fixtures.ts, Sim.tsx). All 3 task commits (`2cf88f5`, `0bae1c4`, `46648ef`) confirmed present in
`git log --oneline --all`. Plan-level `<verification>` re-run: `pnpm --filter functions test`
(12/12 pass), `pnpm --filter functions build` (exits 0, bundle exports `simulateTurn`/
`startSimulatedCall` confirmed via `node -e require(...)`), `pnpm --filter web build` (exits 0,
produces `Sim-*.js` as a separate lazy chunk absent from the main `index-*.js` bundle). Manual
`pnpm dev` + emulator click-through not performed (no interactive browser/emulator available in
this execution) — flagged as `human_judgment: true` in the coverage block above.
