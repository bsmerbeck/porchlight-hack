---
schema_version: 1
open_count: 3
waived_count: 0
fixed_count: 0
total_count: 3
last_updated: 2026-09-22T04:34:52.253Z
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
  }
]
````
