---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-09-22T03:39:51.984Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 02 | deviation | functions/src/screening/runTurn.ts |  | ANTHROPIC_API_KEY (Secret Manager, porchlight-hack) is not scoped to an Anthropic workspace -- every live claude-haiku-4-5 call from a deployed Function fails with 400 invalid_request_error, and runTurn() falls back to a generic reply (no dead air, but RISK-01/02/03 do not run against real conversation content until fixed). Fix: regenerate a workspace-scoped ANTHROPIC_API_KEY, or add an anthropic-workspace-id header via defineHeader/defaultHeaders in runTurn.ts's Anthropic client, then rotate the Secret Manager value and redeploy. | open |  | 2026-09-22T03:39:51.984Z |  |

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
  }
]
````
