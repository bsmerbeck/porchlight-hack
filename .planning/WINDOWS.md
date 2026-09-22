---
schema_version: 1
open_count: 5
waived_count: 0
fixed_count: 0
total_count: 5
last_updated: 2026-09-22T15:10:00.000Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 02 | deviation | functions/src/screening/runTurn.ts |  | ANTHROPIC_API_KEY (Secret Manager, porchlight-hack) is not scoped to an Anthropic workspace -- every live claude-haiku-4-5 call from a deployed Function fails with 400 invalid_request_error, and runTurn() falls back to a generic reply (no dead air, but RISK-01/02/03 do not run against real conversation content until fixed). Fix: regenerate a workspace-scoped ANTHROPIC_API_KEY, or add an anthropic-workspace-id header via defineHeader/defaultHeaders in runTurn.ts's Anthropic client, then rotate the Secret Manager value and redeploy. | open |  | 2026-09-22T03:39:51.984Z |  |
| 2 | 04 | unrun-verify | apps/web/src/pages/AppPlaceholder.tsx |  | hosting deploy plus curl /app and /stage 200 check plus human visual verification not run from this isolated worktree (Vite Firebase config not present here; deferred to post-merge integration) | open |  | 2026-09-22T04:34:45.888Z |  |
| 3 | 04 | stub | apps/web/src/pages/AppPlaceholder.tsx |  | History row expansion shows 'Report pending' when call.report is absent -- intentional per plan (Phase 5 adds real report generation), not a fake report string | open |  | 2026-09-22T04:34:52.253Z |  |
| 4 | 02 | unrun-verify | functions/src/screening/runTurn.ts |  | 02-FIX2's live verification could not exercise the claimedIdentity -> state:verifying transition end-to-end (requires a real claude-haiku-4-5 response, which requires the production ANTHROPIC_API_KEY secret this isolated worktree's permission system denied reading as "Credential Materialization"). Covered instead by unit tests in runTurn.test.ts; recommend a real phone-call test pre-demo to confirm state:verifying live. | open |  | 2026-09-22T11:05:00.000Z |  |
| 5 | 03 | unrun-verify | pi/lamp.py |  | 03-IMU's IMU auto-orientation and 5x7 font could not be deployed/verified against the real Pi (pi@169.254.10.2 unreachable over the direct ethernet cable all session -- ssh/ping both "Host is down", ARP reject route on en8). Rotation math and font dimensions are unit-tested (31/31 pass); the accelerometer discovery path and the axis-to-rotation sign mapping are unverified against real hardware. Recommend running pi/deploy.sh + the physical tilt-test calibration in pi/README.md "Orientation Calibration" as soon as the Pi is reconnected, before the demo. | open |  | 2026-09-22T15:10:00.000Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "02",
    "file": "functions/src/screening/runTurn.ts",
    "line": null,
    "description": "ANTHROPIC_API_KEY (Secret Manager, porchlight-hack) is not scoped to an Anthropic workspace -- every live claude-haiku-4-5 call from a deployed Function fails with 400 invalid_request_error, and runTurn() falls back to a generic reply (no dead air, but RISK-01/02/03 do not run against real conversation content until fixed). Fix: regenerate a workspace-scoped ANTHROPIC_API_KEY, or add an anthropic-workspace-id header via defineHeader/defaultHeaders in runTurn.ts's Anthropic client, then rotate the Secret Manager value and redeploy.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-22T03:39:51.984Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "apps/web/src/pages/AppPlaceholder.tsx",
    "line": null,
    "description": "hosting deploy plus curl /app and /stage 200 check plus human visual verification not run from this isolated worktree (Vite Firebase config not present here; deferred to post-merge integration)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-22T04:34:45.888Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 3,
    "kind": "stub",
    "phase": "04",
    "file": "apps/web/src/pages/AppPlaceholder.tsx",
    "line": null,
    "description": "History row expansion shows 'Report pending' when call.report is absent -- intentional per plan (Phase 5 adds real report generation), not a fake report string",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-22T04:34:52.253Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 4,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "functions/src/screening/runTurn.ts",
    "line": null,
    "description": "02-FIX2's live verification could not exercise the claimedIdentity -> state:verifying transition end-to-end (requires a real claude-haiku-4-5 response, which requires the production ANTHROPIC_API_KEY secret this isolated worktree's permission system denied reading as \"Credential Materialization\"). Covered instead by unit tests in runTurn.test.ts; recommend a real phone-call test pre-demo to confirm state:verifying live.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-22T11:05:00.000Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 5,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "pi/lamp.py",
    "line": null,
    "description": "03-IMU's IMU auto-orientation and 5x7 font could not be deployed/verified against the real Pi (pi@169.254.10.2 unreachable over the direct ethernet cable all session -- ssh/ping both \"Host is down\", ARP reject route on en8). Rotation math and font dimensions are unit-tested (31/31 pass); the accelerometer discovery path and the axis-to-rotation sign mapping are unverified against real hardware. Recommend running pi/deploy.sh + the physical tilt-test calibration in pi/README.md \"Orientation Calibration\" as soon as the Pi is reconnected, before the demo.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-22T15:10:00.000Z",
    "resolved_at": null,
    "milestone": null
  }
]
````
