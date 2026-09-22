---
phase: 05-attack-simulator-demo-hardening-and-pitch
plan: 03
subsystem: demo-tooling
tags: [bash, health-check, runbook, pitch-deck, firestore-rest, ic3-citation]

# Dependency graph
requires:
  - phase: 05-01
    provides: "pnpm demo:reset (resetDemo callable) as the between-runs reset step this plan's runbook calls; pi/lamp.py joystick demo mode as an offline fallback attraction"
  - phase: 05-ALLOWLIST
    provides: "the allowlist pass-through (+14014979735 Brenden) that makes beat 6 of the demo script ('second call, real family') work without a live passkey tap"
provides:
  - "DEMO.md -- role-annotated 7-beat runbook (Builder / Judge-with-phone / Judge-holding-grandma-phone), reset procedure, 3 fallback sections (hotspot, /sim, direct curl to the Pi if Firestore dies), a Backup Video Checklist, an empty Rehearsal Log table for DEMO-02, and a 5PM Freeze Checklist"
  - "scripts/demo-check.sh -- parallelized, read-only, ~0.3s-live go/no-go table across 5 site routes, elevenlabsCustomLlm (401 = deployed+alive), 2 public Firestore docs, the Pi's /health, the bridge process, and the Hue Bridge"
  - "PITCH.md -- 5-slide deck (exactly 5 '## ' headings) with speaker notes, a re-verified FBI/IC3 2024 figure, a text architecture diagram, and a live-traction-number pull command with an explicit not-yet-final placeholder"
affects: ["pitch-day runbook", "05-02 (attack simulator, once its human prep completes, slots into DEMO.md beat 3 and PITCH.md slide 2's consent line)"]

# Actuals (#2632)
actuals:
  tokens: 6345
  tasks: 2
  commits: 2
  plan_head_before: 883de1766c5acb76af16e4b935e2d911642fbbe0

tech-stack:
  added: []
  patterns:
    - "demo-check.sh backgrounds every check with a short per-check curl --max-time and collects PASS/FAIL via one status file per check in a mktemp -d workdir, so total wall-clock time is bounded by the slowest single check (a few seconds) rather than the sum of ~11 sequential curls -- measured at ~0.3s live against porchlight-hack with the Pi/Hue Bridge actually reachable"
    - "Functions liveness is checked via elevenlabsCustomLlm returning 401 unauthenticated, not a dedicated /healthz probe -- healthz currently 404s live (not deployed/removed since Phase 2), so the script follows the PLAN.md task's own specified signal (Phase 2's established reachability check) rather than a stale placeholder endpoint that would produce a false NO-GO"
    - "The bridge (bridge/index.mjs) has no HTTP endpoint of its own; its liveness signal is the running process itself (pgrep -f \"node bridge/index.mjs\"), per bridge/README.md's own documented liveness strategy"

key-files:
  created:
    - DEMO.md
    - scripts/demo-check.sh
    - PITCH.md
  modified: []

key-decisions:
  - "demo-check.sh checks elevenlabsCustomLlm (401) as the Functions liveness signal, not the healthz endpoint literally named in the dispatch's hackathon_rules -- live testing showed healthz currently 404s (likely not included in a recent functions deploy), while 05-03-PLAN.md's own Task 1 <action> explicitly specifies the elevenlabsCustomLlm-401 signal as 'the same reachability signal Phase 2 already established.' Following the authoritative PLAN.md task text over an imprecise paraphrase avoids a script that reports a false NO-GO for a system that actually works."
  - "Did not create ATTACKER_CONSENT.md. It is 05-02's own deliverable (05-02-PLAN.md Task 3: consent must be recorded BEFORE the Instant Voice Clone exists, enforced by task ordering) and is not in 05-03-PLAN.md's frontmatter files_modified or <tasks>. 05-02 is still pending human prep (voice clone + Attacker agent + second Twilio number not yet created) per MORNING.md/current facts -- writing a 'consent' file before any consent has actually been recorded would fabricate the very thing T-05-07's mitigation depends on being true. PITCH.md slide 2 instead references ATTACKER_CONSENT.md and states the disclosure line as a placeholder pending 05-02."
  - "PITCH.md's traction number and feature-freeze line are deliberately left as explicit, dated placeholders rather than fabricated final values -- it is ~12PM ET at authoring time, freeze is 5PM, and DEMO-04's own acceptance criteria requires the traction number be pulled 'at or after the last waitlist check before freeze,' which is a future event this execution cannot perform. The exact re-pull command and instructions are embedded directly in PITCH.md so finalizing it is a single command + edit, not new work."
  - "Tasks 2 and 3's human-only sub-actions (3x3 rehearsal runs, backup video recording, 3x pitch rehearsal, the 5PM freeze declaration) were documented, not performed or blocked on -- per this dispatch's explicit instruction ('Rehearsal and recording tasks are human -- document, don't block'). DEMO.md's Rehearsal Log and 5PM Freeze Checklist and PITCH.md's freeze line are the concrete artifacts a human fills in; this plan does not return a blocking checkpoint for them."

requirements-completed: []

coverage:
  - id: D1
    description: "DEMO.md: role-annotated 7-beat runbook (Builder/Judge-with-phone/Judge-holding-grandma-phone), reset procedure (pnpm demo:reset + demo-check.sh gate), 3 named fallbacks (hotspot, /sim, direct curl to the Pi), backup-video checklist, rehearsal log, 5PM freeze checklist"
    requirement: "DEMO-02"
    verification:
      - kind: other
        ref: "test -s DEMO.md && grep -qi reset DEMO.md && grep -qi hotspot DEMO.md && grep -qi '/sim' DEMO.md -- all 4 checks passed live"
        status: pass
    human_judgment: false
  - id: D2
    description: "scripts/demo-check.sh: single go/no-go PASS/FAIL table across site routes, Functions, Firestore, Pi, bridge, and Hue Bridge, read-only, no embedded secrets"
    requirement: "DEMO-02"
    verification:
      - kind: other
        ref: "bash -n scripts/demo-check.sh (syntax check, exit 0); live run against porchlight-hack from this worktree -- 11/11 checks PASS in ~0.3s wall-clock (Pi at 169.254.10.2 and Hue Bridge at 169.254.12.12 were both actually reachable from this machine); a second run with PI_URL pointed at an unreachable address correctly reported 1 FAIL and NO-GO with exit code 1"
        status: pass
    human_judgment: false
  - id: D3
    description: "PITCH.md: exactly 5 slide sections with speaker notes, a text architecture diagram, the Apple/Google competitive answer, and the voice-clone consent disclosure line"
    requirement: "DEMO-04"
    verification:
      - kind: other
        ref: "grep -c '^## ' PITCH.md == 5; grep -qi 'feature freeze' PITCH.md; grep -qi IC3 PITCH.md -- all passed live"
        status: pass
    human_judgment: false
  - id: D4
    description: "The FBI/IC3 2024 elder-fraud figure (~$4.9B, +43% YoY) was re-verified against its source before going on a slide, per DEMO-04's must_haves truth and PROJECT.md's 'verify before it goes on a slide' instruction"
    requirement: "DEMO-04"
    verification:
      - kind: other
        ref: "Live curl to aarp.org/money/scams-fraud/fbi-report-fraud-2024/ (2026-09-22, fetched during this execution) contains the exact sentence: 'Older Americans reported nearly $4.9 billion stolen through fraud last year, with an average loss of $83,000, according to the latest annual [FBI] report... That's a stunning 43 percent more than last year,' linking to https://www.ic3.gov/AnnualReport/Reports/2024_IC3Report.pdf as its primary source. The primary IC3 PDF itself returns an HTML redirect/SPA shell when fetched directly (not a raw PDF byte stream) rather than a 404, so AARP's direct quote-and-link of the same report is the verification trail cited inline in PITCH.md."
        status: pass
    human_judgment: false
  - id: D5
    description: "DEMO-02's actual truth: 3 consecutive clean demo runs on venue Wi-Fi and 3 on phone hotspot, lamp reaching both red and green correctly, no manual intervention beyond DEMO.md"
    verification: []
    human_judgment: true
    rationale: "Requires a human physically present with the prop phone, a judge-substitute's phone open to /verify, and the Raspberry Pi lamp in the room -- not something this execution can perform. DEMO.md's empty Rehearsal Log table and the .planning/WINDOWS.md unrun-verify entry (id 6) both track this as outstanding; MORNING.md item 7 already flags it as the next human step."
  - id: D6
    description: "DEMO-03's actual truth: a recorded backup video of the full 7-beat demo exists, recorded before 5PM"
    verification: []
    human_judgment: true
    rationale: "Requires a human operating QuickTime screen recording plus a phone camera on the physical lamp -- DEMO.md's Backup Video Checklist gives the exact steps and a path field to fill in once recorded. Tracked as .planning/WINDOWS.md unrun-verify entry id 7."
  - id: D7
    description: "DEMO-04's remaining actual truth: the traction number is pulled at/after the last pre-freeze waitlist check (not the placeholder from authoring time), and the feature-freeze line carries a real 5PM timestamp"
    verification: []
    human_judgment: true
    rationale: "Both require a future event (5PM feature freeze) this execution runs hours before. PITCH.md embeds the exact re-pull command and marks both fields as explicit not-yet-final placeholders. Tracked as .planning/WINDOWS.md stub entry id 8."

duration: 22min
completed: 2026-09-22
status: complete
---

# Phase 5 Plan 3: DEMO.md + scripts/demo-check.sh + PITCH.md Summary

**A role-annotated 7-beat demo runbook with 3 named fallbacks, an ~0.3s-live go/no-go health check across site/Functions/Firestore/Pi/bridge/Hue, and a 5-slide pitch deck carrying a freshly re-verified FBI/IC3 figure and a live-refreshable traction number -- with the physically-human-only pieces (rehearsals, backup video, the 5PM freeze itself) documented as concrete next steps rather than performed or blocked on.**

## Performance

- **Duration:** ~22 min (research/reading, live IC3 re-verification via curl, script authoring + live testing against the real deployed project, deck authoring)
- **Started:** 2026-09-22T15:36:00Z
- **Completed:** 2026-09-22T15:58:00Z
- **Tasks:** 1 of 3 fully autonomous (Task 1); Task 2 and Task 3's document deliverables completed, their human-only sub-actions documented per dispatch instruction, not performed
- **Files modified:** 3 created (DEMO.md, scripts/demo-check.sh, PITCH.md), 0 modified (plus .planning/WINDOWS.md, tracked separately below)

## Accomplishments

- **DEMO.md (Task 1, DEMO-02 backbone):** the literal 3-minute run script, with every one of the 7 beats from `../PLAN.md` assigned an explicit actor (Builder / Judge-with-phone / Judge-holding-grandma-phone), a "Between Runs" reset procedure (`pnpm demo:reset` + a mandatory `scripts/demo-check.sh` GO gate before the next run), three named fallbacks (venue Wi-Fi drops -> phone hotspot, since the lamp is wired over ethernet and never depends on Wi-Fi; the phone call itself won't connect -> the `/sim` browser simulator drives the identical pipeline; Firestore itself is down -> direct `curl` to the Pi's `/state` endpoint, bypassing the bridge entirely), a Backup Video Checklist (QuickTime screen recording + a phone camera on the physical lamp, with a path field to fill in), an empty Rehearsal Log table for the 3 Wi-Fi + 3 hotspot runs DEMO-02 requires, and a 5PM Freeze Checklist.
- **scripts/demo-check.sh (Task 1):** an 11-check, fully parallelized, read-only go/no-go health check -- 5 site routes (`/`, `/app`, `/stage`, `/verify`, `/sim`), `elevenlabsCustomLlm` returning 401 unauthenticated (the exact reachability signal Phase 2 already established, per the PLAN's own Task 1 action text -- chosen over the dispatch's mention of a `healthz` endpoint after live testing showed `healthz` currently 404s, likely dropped from a recent functions deploy), two public Firestore docs (`stats/waitlist`, `lamp/current`), the Pi's `/health`, the bridge's own process via `pgrep -f "node bridge/index.mjs"` (the bridge has no HTTP endpoint of its own), and the Hue Bridge's `/api/0/config`. Live-run against the real deployed project from this machine: **11/11 PASS in ~0.3s wall-clock** (the Pi at `169.254.10.2` and Hue Bridge at `169.254.12.12` were both actually reachable, confirming this dev machine currently has the same ethernet path the demo will use). A second run with an unreachable `PI_URL` correctly reported 1 FAIL, printed `NO-GO`, and exited 1.
- **PITCH.md (Task 3, DEMO-04):** exactly 5 `## ` slide sections with speaker notes under each (Problem, Live Demo, How It Works, Traction, Market + What's Next). The FBI/IC3 2024 figure was **re-verified live during this execution**: a direct curl to AARP's summary of the report (`aarp.org/money/scams-fraud/fbi-report-fraud-2024/`) confirmed the exact sentence "Older Americans reported nearly $4.9 billion stolen through fraud last year... a stunning 43 percent more than last year," sourced from `ic3.gov/AnnualReport/Reports/2024_IC3Report.pdf` -- matching PROJECT.md's stated figure, now with an inline citation and verification date instead of an unverified assumption. Slide 3 is a text architecture diagram (screener -> risk scoring -> family verification -> lamp) in judge-friendly language, and includes the Apple/Google competitive answer from PROJECT.md. Slide 2 carries the voice-clone consent disclosure line as a placeholder pending 05-02. Slide 4's traction number is a live `curl` command against the public `stats/waitlist` Firestore doc, with the value read during this execution (`count: 1`, timestamped) explicitly marked as a placeholder to re-pull immediately before presenting -- not a stale number hardcoded as final. The feature-freeze line at the bottom is a plain dated paragraph (not a 6th heading, keeping the `## ` count at exactly 5), left unset pending the real 5PM timestamp.
- **Broken-windows ledger updated:** appended 3 new open entries to `.planning/WINDOWS.md` (ids 6-8) tracking the DEMO-02 rehearsals, the DEMO-03 backup video, and the DEMO-04 traction-number/feature-freeze finalization as outstanding human actions -- visible at ship time even after this SUMMARY scrolls out of context.

## Task Commits

1. **Task 1: DEMO.md + scripts/demo-check.sh** - `9123e52` (feat)
2. **Task 3: PITCH.md** - `3a515dd` (feat)

**Task 2 (rehearsals):** no code artifact of its own -- its deliverable is the Rehearsal Log table already committed as part of Task 1's DEMO.md. Its human-only sub-action (actually running the rehearsals) is documented as outstanding, per this dispatch's "document, don't block" instruction; see Deviations below.

**Plan metadata:** this SUMMARY + `.planning/WINDOWS.md` update, committed next.

## Files Created/Modified

- `DEMO.md` - the literal 3-minute run script, roles, reset, 3 fallbacks, backup-video checklist, rehearsal log, 5PM freeze checklist
- `scripts/demo-check.sh` - 11-check parallelized go/no-go health check, ~0.3s live, exits non-zero on any FAIL
- `PITCH.md` - 5-slide pitch deck with speaker notes, re-verified IC3 citation, architecture diagram, live traction-number hook
- `.planning/WINDOWS.md` - 3 new open entries (ids 6, 7, 8) for the outstanding human actions this plan's tasks 2/3 document but don't perform

## Decisions Made

See `key-decisions` in frontmatter above -- summarized: `demo-check.sh` follows the PLAN.md task's own specified Functions-liveness signal (`elevenlabsCustomLlm` 401) rather than the currently-404ing `healthz` endpoint, to avoid a script that cries wolf; `ATTACKER_CONSENT.md` was deliberately not created here since it is 05-02's own deliverable and fabricating a consent record before consent has actually been recorded would defeat T-05-07's whole point; `PITCH.md`'s traction number and freeze line are explicit, dated, re-pullable placeholders rather than fabricated final values, since both depend on a 5PM event this execution runs hours ahead of; and Task 2/3's human-only sub-actions were documented, not performed or blocked on, per this dispatch's explicit instruction.

## Deviations from Plan

### Auto-fixed Issues

None - the file deliverables (DEMO.md, scripts/demo-check.sh, PITCH.md) were built and verified exactly to the PLAN.md task specs, with no bugs or missing-critical-functionality gaps found during their own construction.

### Scope notes (disclosed per Rule 4 boundary -- not code changes)

- **Tasks 2 and 3 are `type="checkpoint:human-action"`.** Per this dispatch's explicit instruction ("Rehearsal and recording tasks are human -- document, don't block"), this execution did not return a blocking checkpoint for the physical rehearsal runs, the backup video recording, the 3x pitch rehearsal, or the 5PM freeze declaration itself. Instead, every one of those actions now has a concrete, ready-to-use artifact: DEMO.md's Rehearsal Log table and 5PM Freeze Checklist, and PITCH.md's re-pull command and freeze-line placeholder. These are tracked as open items in `.planning/WINDOWS.md` (ids 6, 7, 8) rather than left silently undone.
- **`healthz` deviates from the dispatch's literal wording** (which named a "healthz function" check) in favor of the PLAN.md task's own specified signal (`elevenlabsCustomLlm` 401). Live testing during this execution confirmed `healthz` currently returns 404 against the deployed project (likely dropped from a recent functions deploy, unrelated to this plan's scope), while `elevenlabsCustomLlm` correctly returns 401. Building the go/no-go check around a signal proven live, matching the plan's own text, was judged safer than one proven to false-negative.

## Issues Encountered

None blocking. The one non-trivial hurdle -- confirming the live IC3 figure without direct access to the (JS-rendered) `ic3.gov` PDF endpoint -- was resolved by finding AARP's article that directly quotes and links the same FBI/IC3 2024 report, which is cited inline in `PITCH.md` alongside the primary source.

## User Setup Required

None - no external service configuration needed for this plan's own deliverables.

**Human actions required before 9PM (not a "setup" step, but flagged here per dispatch instruction to document rather than block):**
- Run the Rehearsal Log in `DEMO.md`: 3 clean runs on venue Wi-Fi, 3 on phone hotspot, editing `DEMO.md` in place if anything breaks (MORNING.md item 7).
- Record the backup video per `DEMO.md`'s Backup Video Checklist, before 5PM.
- Re-pull `stats/waitlist.count` and finalize `PITCH.md`'s traction slide as close to 5PM as possible.
- Rehearse the pitch itself 3 times against a clock.
- At 5PM, work through `DEMO.md`'s 5PM Freeze Checklist and then fill in `PITCH.md`'s feature-freeze line with the real timestamp.
- Once 05-02 (attack simulator) executes: confirm `pnpm demo:attack` works, fill in `ATTACKER_CONSENT.md`'s real consent details, and update `PITCH.md` slide 2's disclosure-line placeholder and `DEMO.md` beat 3's `pnpm demo:attack` reference accordingly.

## Next Phase Readiness

`DEMO.md` and `scripts/demo-check.sh` are ready to use for every rehearsal from now through the demo -- run `bash scripts/demo-check.sh` before every attempt, exactly as the runbook says. `PITCH.md`'s structure, architecture diagram, and verified problem-numbers slide are final; only the traction number and freeze timestamp need a last-minute refresh, both with the exact command already embedded. The three outstanding human-only items (rehearsals, backup video, freeze) are tracked in `.planning/WINDOWS.md` (ids 6-8) and in this SUMMARY's coverage block (D5-D7) so they stay visible through to ship time. No blockers for 05-02 (attack simulator) -- once its human prep completes, its `pnpm demo:attack` command slots directly into DEMO.md beat 3, and its `ATTACKER_CONSENT.md` slots directly into PITCH.md slide 2's disclosure line.

---
*Phase: 05-attack-simulator-demo-hardening-and-pitch*
*Completed: 2026-09-22*

## Self-Check: PASSED

- All 3 created files confirmed present on disk: `DEMO.md`, `scripts/demo-check.sh`, `PITCH.md`.
- Both task commits confirmed in `git log --oneline`: `9123e52`, `3a515dd`.
- Plan-level `<verification>` re-run: `bash -n scripts/demo-check.sh` exits 0; a live run against the deployed `porchlight-hack` project prints a full PASS/FAIL table and exits 0 (11/11 PASS) in ~0.3s; a second live run with an unreachable `PI_URL` correctly prints NO-GO and exits 1. `DEMO.md` contains all 7 beats with named actors, an explicit reset step, and 3 fallback sections (`grep -qi reset/hotspot//sim` all pass). `PITCH.md` has exactly 5 `## ` slide headings (`grep -c '^## '` == 5), a "feature freeze" line, and an "IC3" citation (all `grep -qi` pass).
- 3 consecutive clean runs on venue Wi-Fi and phone hotspot, and a recorded backup video before 5PM, are NOT yet complete -- these require a human with physical hardware in the room and are explicitly out of this execution's reach; tracked as open items (D5, D6 in coverage; WINDOWS.md ids 6-7) rather than silently marked done.
