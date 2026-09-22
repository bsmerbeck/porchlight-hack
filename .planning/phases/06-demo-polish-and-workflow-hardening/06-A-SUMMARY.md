---
phase: 06-demo-polish-and-workflow-hardening
plan: 06-A
subsystem: web/design-system
status: complete
tags: [design-system, tokens, motion, components, stage-state]
requires: []
provides: [porch-tokens, porch-components, deriveStageState, stateVisual, styleguide]
affects: [06-D stage, 06-E verify, 06-F app+sim, 06-G landing]
tech-stack:
  added: [motion@^13.4.0 (motion/react)]
  patterns: [D-02 state keys drive every color via CSS vars, reduced-motion-aware motion/react]
key-files:
  created:
    - apps/web/src/lib/stageState.ts
    - apps/web/src/lib/stageState.test.ts
    - apps/web/src/components/porch/{index.ts,StateBanner.tsx,RiskMeter.tsx,Transcript.tsx,CallerCard.tsx,LampGlow.tsx,OutcomeBadge.tsx,ReadyState.tsx,OperatorBar.tsx,StatusDot.tsx,useOperatorVisible.ts}
    - apps/web/src/pages/Styleguide.tsx
  modified:
    - apps/web/src/index.css
    - apps/web/src/App.tsx (one lazy /styleguide route)
    - apps/web/package.json, pnpm-lock.yaml
decisions:
  - "stateVisual adds an 8th key 'ended' (plain hang-up / screened outcome): label CALL ENDED, amber"
  - "Outcome wins over state in stateVisual (known/message/scam/verified outcome beats raw state)"
  - "useOperatorVisible hook ships with the components so D-09 visibility is implemented once"
metrics:
  completed: 2026-09-22
  tasks: 5
plan_head_before: ef04552
actuals:
  tasks: 5
  commits: 5
---

# Phase 6 Plan 06-A: Porch design system + shared components Summary

This plan adds the "porch light at dusk" tokens (light and dark scopes on the existing shadcn variable names, plus D-02 state colors). It also adds nine motion/react components and a visibility hook in `@/components/porch`, the pure `deriveStageState` and `stateVisual` functions with 24 vitest cases, and a `/styleguide` page that shows every component in every state.

## How to use (wave-2 executors: read this section)

```ts
import {
  StateBanner, RiskMeter, Transcript, CallerCard, LampGlow, OutcomeBadge,
  ReadyState, OperatorBar, StatusDot, useOperatorVisible,
  deriveStageState, stateVisual, stateKey, STATE_VISUALS, RESULT_HOLD_MS,
  type StateKey,
} from '@/components/porch';
```

**Dark screens (Stage, Verify):** put `className="dark"` on the page root together with `bg-background text-foreground min-h-screen`. Light screens (Landing, App) need no class. Use theme classes only (`bg-background`, `bg-card`, `bg-surface`, `bg-surface-2`, `text-muted-foreground`, `border`, `shadow-soft`, `shadow-lift`, `shadow-glow`, `text-primary`). **Never hard-code hex or oklch values in pages.**

### State model: `@/lib/stageState` (re-exported from the barrel)

| Export | Signature / value |
|---|---|
| `RESULT_HOLD_MS` | `20000` |
| `deriveStageState(feedDocs, now, holdMs = 20000)` | `→ { mode: 'ready' \| 'live' \| 'result', call?: T }`. `T` is your feed doc type, e.g. `CallDoc & {id}`. **live** is the newest call (by `startedAt`) with state `screening` or `verifying`, and it wins over result. **result** is the terminal call with the newest `endedAt ?? verification.answeredAt ?? updatedAt ?? startedAt`, if that time is within `holdMs` of `now`. Terminal means state `verified`, `scam` or `ended`, OR outcome `known` or `message`. Anything else is **ready**. Re-run it on a 1s `now` tick so the result screen expires by itself. |
| `isLiveCall(c)`, `isTerminalCall(c)`, `terminalAt(c)` | helper predicates used above |
| `type StateKey` | `'idle' \| 'screening' \| 'verifying' \| 'verified' \| 'known' \| 'scam' \| 'message' \| 'ended'` |
| `stateKey(call?)` | `→ StateKey`. Outcome wins: known → `known`; message → `message`; scam outcome or state → `scam`; verified outcome or state → `verified`; verifying; screening; ended; no call → `idle` |
| `stateVisual(call?)` | `→ { key, label, colorVar }`. Labels: WATCHING, SCREENING, VERIFYING…, VERIFIED, KNOWN CALLER, SCAM BLOCKED, MESSAGE TAKEN, CALL ENDED. `colorVar` is e.g. `'var(--state-scam)'` |
| `STATE_VISUALS` | `Record<StateKey, StateVisual>` |

### Components (all typed, all reduced-motion aware)

| Component | Props |
|---|---|
| `StateBanner` | `state: StateKey`, `label?: ReactNode` (defaults to the stateVisual label), `sub?: ReactNode`, `size?: 'stage' \| 'phone' \| 'compact'` (default `stage` = 88px, 120px at xl; `phone` = 34px; `compact` = 22px), `className?`. Tinted panel with an icon. Crossfades when the state or label changes, and the icon pulses while verifying. `role="status"`. |
| `RiskMeter` | `score: number` (0–100, clamped), `tactics?: (Tactic \| string)[]`, `size?: 'stage' \| 'compact'` (default `stage`: 96px tabular number, 18px chips), `label?: ReactNode \| null` (default "Scam risk"), `className?`. Spring-animated fill: green below 40, amber 40–69, red 70 and up. Tactic chips have icons (urgency, secrecy, payment_method, authority_bail, impersonation). Also exported: `riskColor(score)` and `TACTIC_META`. |
| `Transcript` | `turns: CallTurn[]`, `pending?: boolean \| 'caller' \| 'assistant'` (`true` means Porchlight; shows a typing shimmer row), `size?: 'stage' \| 'compact'` (stage = 32px), `maxTurns?: number`, `callerLabel?`, `assistantLabel?` (default "Caller" and "Porchlight"), `className?`. **Give it a height or max-height through `className`** so it scrolls. It auto-scrolls to the newest turn. Caller turns sit on the left, Porchlight turns on the right with an amber tint, and new lines slide in. |
| `CallerCard` | `name?: string` (default "Unknown caller"; pass `verification.name ?? risk.claimedIdentity`), `claimedText?: string` (`verification.claimedText`, shown as `Says: "…"` only when it differs from name), `from?: string` (E.164, formatted as +1 (401) 497-9735), `known?: boolean` (adds a green "Known caller" badge and avatar), `size?: 'stage' \| 'compact'`, `className?`. Also exported: `formatPhone(from)`. |
| `LampGlow` | `state?: StateKey` (default `idle`), `size?: 'sm' \| 'md' \| 'lg' \| 'xl' \| number` (96, 160, 260 or 380px wide; height is 1.2×), `className?`. SVG lantern whose halo is tinted by the state. It breathes when idle, pulses when verifying, shimmers gently while screening and holds steady on results. The lamp body uses `currentColor`, so set the text color (e.g. `text-foreground`). This replaces the old `components/Lamp.tsx`, which is left in place for the pages that still use it. |
| `OutcomeBadge` | `outcome?: CallDoc['outcome']`, `state?: CallState`, `visual?: StateKey` (overrides both), `label?: string`, `size?: 'sm' \| 'md' \| 'lg'` (default `md`), `className?`. Pill with icon in the state color. `outcome: 'screened'` shows "Screened". No outcome and no state shows "Screening" (in progress). |
| `ReadyState` | `title: ReactNode`, `subtitle?: ReactNode`, `state?: StateKey` (default `idle`), `lampSize?: LampSize \| number` (default `lg`), `size?: 'stage' \| 'phone'` (title 56px or 30px), `children?` (e.g. member name or passkey badge), `className?`. Centered breathing lamp plus title, fades in. Example: `<ReadyState title="Porchlight is watching Margaret's line" subtitle="…" />`. |
| `OperatorBar` | `onReset?`, `onSim?`, `onAttack?`, `onSoundboard?` + `soundboardOn?: boolean`, `onLampTest?` (a button is hidden when its handler is omitted), `status?: OperatorStatus`, `busy?: OperatorAction \| null` (that button spins and all buttons disable), `defaultCollapsed?: boolean`, `onClose?: () => void` (shows an X), `className?`. **Presentational only**: floating bottom-right dark glass, collapsible, always dark. Status row shows the Pi dot, bridge heartbeat age (turns red after 60s) and Hue bulb count, ticking every second. |
| `OperatorStatus` (type) | `{ piOk?: boolean; hueReachable?: number; lastBeat?: number /* epoch ms */; message?: string }`. This matches the D-12 `status/bridge` doc; spread the doc in directly. |
| `OperatorAction` (type) | `'reset' \| 'sim' \| 'attack' \| 'soundboard' \| 'lamp'` |
| `StatusDot` | `state?: StateKey`, `tone?: 'ok' \| 'warn' \| 'bad' \| 'off'` (overrides state), `color?: string` (overrides both), `pulse?: boolean`, `size?: number` (default 10px), `label?: ReactNode`, `className?`. |
| `useOperatorVisible()` | `→ [visible: boolean, setVisible(v: boolean)]`. D-09: hidden by default. `?op=1` shows it and persists; `?op=0` clears it; pressing `o` three times within 1.5s toggles it (ignored inside inputs). Stored in the localStorage key `porchlight_operator` (`OPERATOR_STORAGE_KEY`). Usage: `const [op, setOp] = useOperatorVisible(); {op && <OperatorBar … onClose={() => setOp(false)} />}` |
| `STATE_ICONS` | `Record<StateKey, LucideIcon>` |

### Tokens and utilities (`apps/web/src/index.css`)

- **Palette (D-01):** light `:root` uses a warm off-white background `oklch(0.98 0.01 80)` with charcoal text. `.dark` uses `oklch(0.16 0.01 60)` with surfaces one step lighter. `--primary`/`--ring`/`--amber` are `oklch(0.80 0.15 75)`. All the old shadcn variable names still exist, so current pages don't break.
- **State colors (D-02), the same in both scopes:** `--state-idle`, `--state-screening`, `--state-verifying`, `--state-verified`, `--state-known`, `--state-scam` and `--state-message` as CSS variables. The matching Tailwind colors are `bg-state-scam`, `text-state-verified`, etc.
- **Extra colors:** `bg-surface`, `bg-surface-2`, `text-amber`.
- **Shadows:** `shadow-soft`, `shadow-lift`, `shadow-glow` (warm-tinted; heavier in dark).
- **Utilities:** `tabular` (tabular numerals, for timers and scores), `label-caps` (18px, uppercase, wide tracking; the D-03 stage label style), `porch-shimmer`.
- **Animations:** `animate-breathe` (5s), `animate-pulse-ring`, `animate-shimmer`. All are disabled under `prefers-reduced-motion`. `--radius` is `0.875rem`.
- **Font:** `--font-sans` is `"Geist Variable", "Geist", system-ui…`. See the deviation below.

### Styleguide
`/styleguide` (lazy route) shows every component in every state on a dark board and a light board. RiskMeter and Transcript play an animated demo loop, and an OperatorBar with fake actions is mounted.

## Commits

| Task | Commit | Description |
|---|---|---|
| 1 | 665fe9b | Tokens in `index.css` + `motion` dependency |
| 3 | 50a6815 | `deriveStageState` / `stateVisual` + 24 vitest cases |
| 2 | a2c22c6 | Porch components + `useOperatorVisible` |
| 4 | cc1c6f3 | `/styleguide` page + lazy route |
| 5 | (this commit) | SUMMARY |

Verification: `pnpm -r typecheck` passed, `pnpm --filter web build` passed (Styleguide builds as its own 165 kB chunk), and `pnpm --filter web test` passed 37 of 37.

## Deviations from Plan

1. **[Rule 3 - Blocking] Geist Variable is not actually installed.** CONTEXT D-03 says it is, but there is no `@fontsource-variable/geist` or other font package in `apps/web`. I did not add a package (package installs are out of auto-fix scope). `--font-sans` lists `"Geist Variable", "Geist"` first and falls back to system-ui, so it switches to Geist on its own once someone adds `@fontsource-variable/geist` and imports it in `main.tsx`. **Follow-up for the orchestrator or the human:** `pnpm --filter web add @fontsource-variable/geist`, then add `import '@fontsource-variable/geist';` to `main.tsx`.
2. **[Rule 2] Added an `'ended'` StateKey** (CALL ENDED, amber) so plain hang-ups and `screened` outcomes have a visual instead of falling back to idle.
3. **[Rule 2] Added the `useOperatorVisible` hook** so the D-09 `?op=1` / press-`o`-three-times logic isn't implemented twice (in /stage and /sim).
4. **Not visually verified in a browser.** The sandbox guard blocked headless Chrome, so the `/styleguide` screenshot pass didn't happen. The wave-2 or wave-3 executor or the human should open `/styleguide` and check it.
5. **STATE.md and ROADMAP.md were not updated** by this executor, to avoid merge conflicts with the parallel 06-B executor. The orchestrator owns phase-level state.

## Known Stubs
None. The OperatorBar on `/styleguide` uses fake handlers on purpose; the real wiring belongs to 06-D and 06-F.

## Self-Check: PASSED
All listed files exist. Commits 665fe9b, 50a6815, a2c22c6 and cc1c6f3 are in `git log`.
