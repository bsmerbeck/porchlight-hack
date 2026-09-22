# Phase 6: Demo Polish and Workflow Hardening - Context

**Gathered:** 2026-09-22 13:40 EDT (orchestrator decisions; no discuss session — 2h20m window, hard stop 4PM, demo 5PM)
**Status:** Ready for execution (prompt-as-plan executors, two waves)

<domain>
## Phase Boundary
Make every screen look designed, and every demo workflow crisp, refresh-safe and resettable. No new product features beyond what the workflows need. Backend changes only where a workflow needs them (ready-state, reset, discovery).
Screens: `/` Landing, `/stage` projector, `/verify` family phone, `/app` family dashboard, `/sim` operator console.
Workflows: (W1) simulated scam via /sim, (W2) live call → family "No" → blocked, (W3) live call → family "Yes"+passkey → verified, (W4) allowlisted caller (+14014979735) → known caller, (W5) benign caller → message taken, (W6) attack via `pnpm demo:attack` / /sim button, soundboard fallback, (W7) joystick "call my family" alert.
</domain>

<decisions>
## Visual system (POL-01) — locked
- **D-01 Mood:** "porch light at dusk." Stage + Verify are dark: near-black warm charcoal background (`oklch(0.16 0.01 60)`), surfaces one step lighter, warm amber accent (`oklch(0.80 0.15 75)`) as the brand color. Landing + App are light: warm off-white (`oklch(0.98 0.01 80)`) with the same amber accent and charcoal text. One token set in `apps/web/src/index.css` (`@theme` + `.dark` scope), no per-page hex values.
- **D-02 State colors (everywhere, including lamp/Hue docs):** idle = amber glow; screening = calm blue `oklch(0.70 0.12 240)`; verifying = amber, pulsing; verified / known = green `oklch(0.75 0.17 150)`; scam = red `oklch(0.64 0.22 25)`; message = indigo `oklch(0.68 0.13 280)`.
- **D-03 Type:** Geist Variable (already installed) for UI; tabular numerals for risk scores and timers; stage scale: state banner 88–120px, transcript 30–34px, labels 18px uppercase tracking-wide. Phone scale: question 34px, buttons ≥ 72px tall.
- **D-04 Motion:** add `motion` (the framer-motion successor, `motion/react`) — state-change crossfades, transcript lines slide in, risk meter animates with a spring, verifying pulse. Respect `prefers-reduced-motion`. Nothing longer than 400ms except the idle breathe.
- **D-05 Shared components** (`apps/web/src/components/porch/`): `StateBanner`, `RiskMeter` (animated bar + number + tactic chips), `Transcript` (auto-scroll, speaker styling, typing shimmer for pending turn), `CallerCard` (name/claim/number, known-caller badge), `LampGlow` (animated SVG lamp tinted by state — reused on landing, stage idle, verify idle), `OutcomeBadge`, `ReadyState` (idle screen: "Porchlight is watching Margaret's line" + breathing lamp), `OperatorBar` (see D-09). Icons: lucide-react.

## Workflow states (POL-02, POL-03) — locked
- **D-06 One source of truth for "what's on screen":** a pure function `deriveStageState(feedDocs, now)` in `apps/web/src/lib/stageState.ts` returning `{mode: 'ready'|'live'|'result', call?}`: live = newest call whose state ∈ {screening, verifying}; result = newest call that reached a terminal state (verified, scam, ended/known/message) within the last **RESULT_HOLD_MS = 20000**; otherwise ready. Every screen uses it, so a refresh rebuilds the same view from Firestore. Unit-tested.
- **D-07 Lamp/Hue follow the same rule:** the Mac bridge returns lamp + bulbs to idle 20s after a terminal state (bridge-side timer keyed on `lamp/current.updatedAt`), so the room settles without anyone touching anything.
- **D-08 Verify phone:** before = armed idle ("Watching for calls to Margaret", member name, passkey status); during = full-screen prompt with 20s countdown; after = result card for 6s then back to armed idle. Refresh during a prompt re-shows the prompt with the remaining time computed from `promptedAt`; answered callIds never re-prompt (already implemented in 04-FIX — keep).
- **D-09 Operator controls (POL-04):** `OperatorBar` hidden by default, revealed by `?op=1` or pressing `o` three times; stored in localStorage. Buttons: Reset everything (calls `resetDemo` with the DEMO_TOKEN from localStorage key `porchlight_demo_token`, prompting once), Run simulated scam, Launch attack call, Soundboard toggle, Lamp test (cycles states via a new `lampTest` path or `/sim` existing), and a small live status row (Pi / bridge heartbeat age / Hue reachable count read from a `status/bridge` doc the bridge writes every 20s). Available on /stage and /sim.
- **D-10 Reset clears bulbs too:** resetDemo already sets `lamp/current` idle; bridge mirrors that to Pi + Hue. Also clear `households/demo/alerts`.

## Venue bring-up (POL-05) — locked
- **D-11 `pnpm venue:up`** (`scripts/venue-up.mjs`): checks the ethernet link (`ifconfig` en7/en8 active), finds the Pi (169.254.10.2, fallback `smerbs.local`), finds the Hue Bridge (`_hue._tcp` mDNS via `dns-sd -B`, fallback last-known IP in `bridge/hue-local.json`, fallback `https://discovery.meethue.com`), updates `bridge/hue-local.json` IP if it moved, optionally `--search` triggers Hue `POST /api/<user>/lights` (new-bulb search, 40s) then lists lights, sets ALL reachable bulbs + Pi to idle, runs a 5-second colour sweep so you can see every device respond, prints a device table (✓/✗, IP, reachable bulbs by name), exits non-zero if Pi or Hue missing. Also add these checks to `scripts/demo-check.sh` (reachable-bulb count).
- **D-12 Bridge writes `status/bridge`** `{piOk, hueReachable, lastBeat}` every heartbeat (public-read rule) for the OperatorBar.

## Claude's Discretion
Exact layouts, micro-copy, animation curves, landing page section design (keep the waitlist form + counter + ref capture working).
</decisions>

<canonical_refs>
- `DEMO.md` (beat sheet), `PITCH.md`, `bridge/README.md`, `pi/README.md`
- `.planning/phases/04-family-verification-and-dashboard/04-FIX-SUMMARY.md` (verdict finality, answered-call guard, name fields `claimedIdentity`/`claimedText`)
- `.planning/phases/05-attack-simulator-demo-hardening-and-pitch/05-ALLOWLIST-SUMMARY.md`, `05-CLIPS-SUMMARY.md`
- `packages/shared/src/calls.ts` (CallDoc, outcomes: verified | scam | screened | known | message)
</canonical_refs>

<execution_plan>
- Wave 1 (parallel, ~25 min): 06-A design system + shared components (apps/web/src/index.css, components/porch/*, lib/stageState.ts + test); 06-B bridge/venue (bridge/*, scripts/venue-up.mjs, scripts/demo-check.sh, firestore.rules for status/bridge); 06-C backend reset (functions/src/demo/resetDemo.ts alerts clear) — folded into 06-B if trivial.
- Wave 2 (parallel, ~35 min, after 06-A merges): 06-D /stage + OperatorBar wiring; 06-E /verify; 06-F /app + /sim operator console; 06-G landing.
- Wave 3 (~20 min): 06-H workflow verification pass W1–W7 in the browser against the deployed site + fixes; final deploy, demo-check GO, summary.
</execution_plan>
