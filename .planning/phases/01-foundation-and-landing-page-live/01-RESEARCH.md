# Phase 1: Foundation and Landing Page Live - Research

**Researched:** 2026-09-21 (Mon ~20:40, hackathon hour 1)
**Domain:** pnpm monorepo + Vite 8/React 19/Tailwind 4/shadcn 4 landing page + Firebase Functions v2 (Node 22) + Firestore + Hosting, one-command deploy
**Confidence:** HIGH — every load-bearing claim below was either read from official docs this session or **executed in a local spike** (`scratchpad/spike`) with the exact version pins recommended. Only the remote Cloud Build install and first-deploy behavior could not be exercised (no Firebase project exists yet).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Repo layout and tooling
- **D-01:** pnpm workspace monorepo at repo root (`/Users/bsmerbeck/git/hackathon/cool`, already `git init`'d, Node 24, pnpm 11). Packages: `apps/web` (Vite + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui), `functions` (Firebase Functions v2, TypeScript, Node 22 runtime), `packages/shared` (types + Firestore schema + zod validators), `pi/` (Python 3.9 stdlib only — created empty with a README in this phase), `bridge/` (Node script — created empty with a README in this phase).
- **D-02:** One-command deploy: root `pnpm deploy` runs `pnpm -r build` then `firebase deploy --only hosting,functions,firestore:rules`. Root `pnpm dev` runs Vite + Firebase emulators concurrently.
- **D-03:** Firebase project is created by the human (checkpoint) via `firebase projects:create` or console; CLI is already logged in as bsmerbeck@gmail.com. Project id pattern: `porchlight-<something>`. `firebase use` writes `.firebaserc` (committed). Blaze upgrade is a human checkpoint before Functions deploy.
- **D-04:** Secrets: Functions read `ANTHROPIC_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `ELEVENLABS_API_KEY` via `defineSecret` (Secret Manager, set with `firebase functions:secrets:set`). Local dev uses `functions/.secret.local` (gitignored). Web uses `VITE_FIREBASE_*` public config in `apps/web/.env.local` (gitignored) with a committed `.env.example`. Only the Anthropic key exists tonight; the others are placeholders until Phase 2's human checkpoint.

#### Shared schema (`packages/shared`)
- **D-05:** `calls/{callId}` document: `{ householdId, state: 'idle'|'screening'|'verifying'|'verified'|'scam'|'ended', from: string, startedAt, endedAt?, provider: 'elevenlabs'|'simulator', providerCallId?, turns: Array<{ role:'caller'|'assistant', text, at }>, risk: { score:number, tactics:string[], claimedIdentity?:string, recommendedAction:'continue'|'verify'|'end', updatedAt }, verification?: { memberId, promptedAt, answeredAt?, answer?:'yes'|'no'|'timeout', method?:'passkey'|'link' }, outcome?: 'verified'|'scam'|'screened', report?: string }`. Turns live inline on the doc (small, demo-scale) so one `onSnapshot` drives everything.
- **D-06:** `households/{id}`: `{ name, seniorName:'Margaret', members: Array<{ id, name, relation, aliases:string[], passkeyCredentialIds:string[] }> }`. `waitlist/{id}`: `{ email, protecting?:string, ref:string, createdAt, ua? }`. `stats/waitlist`: `{ count:number }` maintained by a Firestore trigger so the counter is one cheap listener.
- **D-07:** State transitions and tactic enum exported as constants from `packages/shared` and imported by both web and functions; zod schemas for the waitlist payload.

#### Landing page
- **D-08:** Route `/` is the landing page; `/app/*` reserved for the family dashboard (Phase 4), `/stage` for the projector view. Single Vite app.
- **D-09:** Content: headline + one-paragraph problem with the FBI IC3 number (marked "verify" in copy until the human confirms), 3-step "how it works" (screens → verifies family → lamp), lamp illustration (simple CSS/SVG glow — no photo needed tonight), waitlist form (email + optional "Who are you protecting?" free text), live counter "N families on the waitlist", footer "Built in 24h at RI Startup Week".
- **D-10:** Waitlist write goes through a callable/HTTPS Function (`joinWaitlist`) that validates with zod and writes Firestore — not direct client writes — so rules stay closed and abuse is limited. Counter reads `stats/waitlist` via `onSnapshot`. Firestore rules: deny all client writes; allow client read of `stats/waitlist` only.
- **D-11:** `?ref=` captured from URL on load, persisted in `sessionStorage`, sent with the signup. Default ref `direct`. Planned refs: `li`, `reddit`, `fb`, `friends`, `qr`, `judges`.
- **D-12:** Firebase Hosting default domain (`<project>.web.app`) is fine; custom domain is out of scope tonight.

### Claude's Discretion
- shadcn component selection, Tailwind theme (warm amber/porchlight palette suggested), exact copy, SVG lamp illustration, folder naming inside packages, test framework choice (Vitest expected), whether `functions` is a workspace package or standalone `package.json` — pick whatever deploys cleanly with Firebase CLI 15.

### Specific Ideas (from CONTEXT.md)
- Look and feel: warm, calm, trustworthy — a porch light at dusk, not a security-vendor red/black. Large type; a senior's adult child should read it on a phone in 20 seconds.
- Counter must visibly tick when a second browser signs up (this is demoed to judges).
- Keep the landing page's JS light; it will be QR-scanned in a room with bad Wi-Fi.
- Human checkpoints in this phase (planner: make these explicit `checkpoint` tasks, not automated): create Firebase project + Blaze; put Anthropic key in secrets; post the page with refs.

### Deferred Ideas (OUT OF SCOPE)
- Custom domain (porchlight.family or similar) — after the hackathon
- Email confirmation to waitlist signups — needs a mail provider; skip
- Analytics beyond `?ref=` counts — skip
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-01 | Monorepo scaffold (pnpm; `apps/web` Vite + React 19 + Tailwind v4 + shadcn; `functions` Firebase Functions v2 TypeScript; `pi/` Python; `bridge/` Node) builds and deploys with one command | Standard Stack (exact pins spiked), Pattern 1 (workspace layout), Pattern 2 (esbuild-bundled functions), Pattern 5 (`firebase.json` + root scripts), Pitfalls 1-4 |
| FND-02 | Firebase project exists with Firestore, Hosting, and Functions (Blaze) enabled; secrets stored as Functions secrets / untracked `.env.local`, none in git | Pattern 6 (project bootstrap CLI sequence), Pattern 3 (`defineSecret` + `.secret.local`), Environment Availability, Verification Commands |
| FND-03 | Shared `calls/{id}` schema defined once in a shared types package and used by every component | Pattern 1 (`packages/shared` as raw-TS workspace package), Code Examples §shared, spike proof that web (Vite) and functions (esbuild) both consume it |
| LAND-01 | One-screen pitch (problem, how it works, lamp illustration) at a public URL | Pattern 5 (Hosting SPA rewrite), shadcn component list, bundle-size pattern (Pattern 4) |
| LAND-02 | Join waitlist with email + optional "who are you protecting?"; stored in Firestore | Pattern 3 (`onCall` `joinWaitlist` + zod), Code Examples §functions, Security Domain |
| LAND-03 | Live signup counter; same number readable for final slide | Pattern 3 (`onDocumentCreated` → `FieldValue.increment`), Pattern 4 (`onSnapshot` on `stats/waitlist`), rules snippet, Verification Commands |
| LAND-04 | Signup source attributed via `?ref=` | Code Examples §ref capture (`sessionStorage`), zod `ref` field with default `direct` |
</phase_requirements>

## Summary

The proven `smash-tracker` shape (pnpm workspaces `apps/*` + `packages/*`, Vite 8 + React 19 + Tailwind 4 via `@tailwindcss/vite` + shadcn, firebase 12 modular, zod 4, TypeScript 6) transfers directly. I reproduced the whole toolchain in a scratch workspace with the exact pins below and confirmed: `pnpm install` (after `allowBuilds`), `tsc` typecheck under TS 6.0.3, `vite build`, shadcn 4.21 `init`/`add`, esbuild-bundling of `functions`, and the Functions emulator loading the bundle through pnpm symlinks with `.secret.local` honored. Nothing in this stack is exploratory.

The one architectural question at Claude's discretion — how `functions` ships from a pnpm monorepo — has a clean answer: **make `functions` a workspace package for local dev, but bundle it with esbuild into a single `lib/index.js` (shared code inlined, npm deps external) and keep its `package.json` free of any `workspace:` specifier.** Firebase CLI uploads `functions/` (minus `node_modules`) and Cloud Build runs `npm install` remotely, which cannot resolve `workspace:*`; bundling sidesteps that, avoids the tarball/`isolate-package` hacks, and I verified the exact esbuild flags (an important trap: `--packages=external` alone externalizes `@porchlight/shared` and the deploy would crash at import time — you need `--alias`).

Two environment facts change the plan: (1) **no Java runtime on the Mac** — firebase-tools 15 requires JDK 21+ for the Firestore emulator, so `pnpm dev` cannot run Firestore triggers locally unless `brew install openjdk@21` is done; the pragmatic path tonight is Vite against the live project plus `emulators:start --only functions` for callable smoke tests. (2) **The Firebase project does not exist** (`firebase projects:list` shows only `catch-of-the-day-bsmerbeck` and `smash-tracker-f97b7`), so project creation + Blaze + Firestore database creation are a real human checkpoint on the critical path, and the first Functions deploy (Eventarc trigger) can need a retry after a few minutes of permission propagation.

**Primary recommendation:** Scaffold with the pins in Standard Stack, bundle `functions` with esbuild + `--alias`, put Firebase behind a dynamic `import()` on the landing page (76 kB gz first paint vs 211 kB), gate deploy behind an explicit "project + Blaze + Firestore db" checkpoint, and test the counter on the live project rather than installing Java.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Landing page render (pitch, lamp SVG, form UI) | CDN / Static (Firebase Hosting) | Browser | Pure static Vite build; no SSR needed |
| `?ref=` capture + persistence | Browser | — | URL is only visible client-side; `sessionStorage` per D-11 |
| Waitlist payload validation | API / Backend (`joinWaitlist` callable) | Browser (same zod schema for instant feedback) | Server is the trust boundary (D-10); client validation is UX only |
| Waitlist write | API / Backend | Database (Firestore `waitlist/{id}`) | Rules deny client writes; Admin SDK bypasses rules |
| Counter maintenance | Database / Storage (Firestore trigger `onDocumentCreated`) | API / Backend | `stats/waitlist.count` via `FieldValue.increment` so the client listens to one doc |
| Live counter display | Browser (`onSnapshot`) | Database | Public read of a single doc; no auth |
| Secrets | API / Backend (Secret Manager via `defineSecret`) | — | Never in web bundle or git |
| Shared schema/types | Shared package (build-time) | — | Consumed by web via Vite and by functions via esbuild inlining |
| Deploy orchestration | Dev machine (`pnpm deploy` → Firebase CLI) | Cloud Build (remote `npm install` for functions) | Single command per D-02 |

## Standard Stack

### Core (pins are the versions resolved in `smash-tracker/pnpm-lock.yaml` and re-verified in the spike)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `typescript` | **6.0.3** (NOT 7.x) | Typecheck everywhere | `npm view typescript version` is now 7.0.2 (the Go port). smash-tracker pins ^6.0.3; the spike ran 6.0.3. TS 7 is untested with `tsc -b`/vitest here. `[VERIFIED: npm registry + spike]` |
| `vite` | 8.1.3 | Web bundler (Rolldown) | Proven in smash-tracker; built the spike. `[VERIFIED: spike]` |
| `@vitejs/plugin-react` | 6.0.3 | React fast refresh | `[VERIFIED: spike]` |
| `react` / `react-dom` | 19.2.7 | UI | `[VERIFIED: spike]` |
| `tailwindcss` + `@tailwindcss/vite` | 4.3.2 | Styling, no PostCSS config | Official Vite plugin path. `[CITED: ui.shadcn.com/docs/installation/vite]` `[VERIFIED: spike]` |
| `shadcn` (CLI + runtime) | 4.21.0 | Component generator; v4 also becomes a runtime dep for `shadcn/tailwind.css` | `[VERIFIED: spike — init and add executed]` |
| `firebase` | 12.15.0 | Web SDK: `firebase/app`, `firebase/firestore`, `firebase/functions` | Modular; exports map verified. `[VERIFIED: npm registry + spike]` |
| `firebase-functions` | **7.4.0** | Functions v2 SDK | Published 2026-09-15; `engines.node >=18`; exports `./https`, `./firestore`, `./params` in ESM+CJS; default entry is v2. `[VERIFIED: npm registry exports map + spike]` |
| `firebase-admin` | **14.4.0** | Admin Firestore in functions | `engines.node >=22` (fine for nodejs22 runtime); in firebase-functions 7.4.0 peer range `^11.10.0 \|\| ^12 \|\| ^13 \|\| ^14`. `[VERIFIED: npm registry]` |
| `zod` | 4.4.3 | Schema validation, shared | smash-tracker pins one zod for the whole tree via `overrides`. `[VERIFIED: spike]` |
| `esbuild` | 0.28.2 | Bundle `functions` to one CJS file | `[VERIFIED: spike]` |
| `firebase-tools` | 15.22.4 (already installed globally) | Deploy / emulators | Needs Node ≥20 (have 24.11.1); needs **JDK 21+** for Firestore emulator (absent). `[VERIFIED: firebase --version; CITED: firebase.google.com/support/release-notes/cli v15.0.0]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `radix-ui` | 1.6.7 (installed by shadcn init) | Primitives for shadcn `--base radix` | Auto-added |
| `lucide-react` | 1.47.0 (installed by shadcn init) | Icons | Auto-added |
| `class-variance-authority` 0.7.1, `cn` 0.3.2, `tw-animate-css` 1.4.0, `@fontsource-variable/geist` 5.3.0 | as installed by shadcn 4.21 init | cva variants, `cn()` helper (shadcn now ships `src/lib/utils.ts` as `export { cn } from "cn"`), animations, default font | Auto-added; you may swap Geist for a warmer font at discretion — drop the `@import "@fontsource-variable/geist"` line and the dep to save ~76 kB of woff2 |
| `@types/node` 24.13.2, `@types/react` 19.2.17, `@types/react-dom` 19.2.3 | | Types | |
| `concurrently` | 10.0.5 | Root `pnpm dev` (Vite + emulators) | Only if emulators are used; otherwise `pnpm --filter web dev` suffices |
| `vitest` | 4.1.9 | Tests (discretion) | `nyquist_validation` is `false` in config — tests are optional this phase |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| esbuild-bundled `functions` (workspace package) | Standalone `functions/` with npm + `package-lock.json` outside the workspace | Deploys cleanly too, but `pnpm -r build` won't see it and shared code still needs bundling or a `file:` tarball. No advantage. |
| esbuild-bundled `functions` | `isolate-package` / tarball `predeploy.js` (firecms.co, 2025-04) | More moving parts; the tarball approach exists precisely because people didn't bundle. Bundling is 1 command. |
| `onCall` for `joinWaitlist` | `onRequest` with `cors: true` | `onCall` gives typed client (`httpsCallable`), automatic `{data}` envelope, `HttpsError` codes, and no CORS config. Curl still works (body `{"data":{...}}`). Use `onCall`. |
| `firebase/firestore` `onSnapshot` (locked, D-10) | REST polling | Would be far lighter (~0 kB SDK) but D-10 locks `onSnapshot`; mitigate weight with dynamic import (Pattern 4). |
| Node 22 runtime (locked, D-01) | nodejs24 (GA since firebase-tools 14.26.0) | Locked; keep `nodejs22`. |

**Installation (exact, from the spike):**
```bash
# root
pnpm add -D -w typescript@6.0.3 concurrently@10.0.5
# apps/web
pnpm --filter @porchlight/web add react@19.2.7 react-dom@19.2.7 firebase@12.15.0 zod@4.4.3 '@porchlight/shared@workspace:*'
pnpm --filter @porchlight/web add -D vite@8.1.3 @vitejs/plugin-react@6.0.3 tailwindcss@4.3.2 @tailwindcss/vite@4.3.2 typescript@6.0.3 @types/node@24.13.2 @types/react@19.2.17 @types/react-dom@19.2.3
# then, inside apps/web (needs tsconfig.json + tsconfig.app.json with paths first — see Pitfall 5)
pnpm dlx shadcn@4.21.0 init -y --base radix --preset nova
pnpm dlx shadcn@4.21.0 add -y button input card badge label
# functions
pnpm --filter @porchlight/functions add firebase-functions@7.4.0 firebase-admin@14.4.0 zod@4.4.3
pnpm --filter @porchlight/functions add -D esbuild@0.28.2 typescript@6.0.3 @types/node@24.13.2
# packages/shared
pnpm --filter @porchlight/shared add zod@4.4.3
```

## Package Legitimacy Audit

Seam: `gsd_run query package-legitimacy check --ecosystem npm …` run this session. Every `SUS` verdict below has reason `too-new` only, which the seam derives from the **latest release date** (<30 days) — not package age. All are multi-year packages with 1M-320M weekly downloads and canonical repos, and (except `cn`) are pinned to older, proven versions anyway.

| Package | Registry | Age | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|-----|--------------|-------------|---------|-------------|
| vite | npm | years | 132M | github.com/vitejs/vite | SUS (too-new latest) | Approved — pin 8.1.3 |
| @vitejs/plugin-react | npm | years | 68M | github.com/vitejs/vite-plugin-react | SUS (too-new) | Approved — pin 6.0.3 |
| react / react-dom | npm | years | 133M / 126M | github.com/facebook/react | SUS (too-new) | Approved — pin 19.2.7 |
| tailwindcss / @tailwindcss/vite | npm | years | 96M / 35M | github.com/tailwindlabs/tailwindcss | OK | Approved — pin 4.3.2 |
| shadcn | npm | years | 6.8M | github.com/shadcn-ui/ui | SUS (too-new) | Approved — 4.21.0 (executed in spike) |
| cn | npm | created 2013-06-12 | 2.9M | github.com/shadcn-ui/cn | SUS (too-new; 0.3.2 published today) | Approved — installed by the official shadcn CLI; verify `npm view cn repository.url` = shadcn-ui org (it does) |
| @fontsource-variable/geist | npm | years | 1.4M | github.com/fontsource/font-files | OK | Approved (optional; removable) |
| firebase | npm | years | 7.4M | github.com/firebase/firebase-js-sdk | SUS (too-new) | Approved — pin 12.15.0 |
| firebase-functions | npm | years | 1.8M | github.com/firebase/firebase-functions | SUS (too-new: 7.4.0 on 2026-09-15) | Approved — 7.4.0 (loaded in spike + emulator) |
| firebase-admin | npm | years | 6.5M | github.com/firebase/firebase-admin-node | SUS (too-new) | Approved — 14.4.0 |
| zod | npm | years | 214M | github.com/colinhacks/zod | SUS (too-new) | Approved — pin 4.4.3 |
| typescript | npm | years | 209M | github.com/microsoft/TypeScript | OK | Approved — pin 6.0.3 |
| esbuild | npm | years | 203M | github.com/evanw/esbuild | OK | Approved — 0.28.2 |
| radix-ui, lucide-react, class-variance-authority, tw-animate-css, concurrently, vitest, @types/* | npm | years | 10M-321M | canonical | OK or SUS(too-new) | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** listed above; all `too-new`-only on the *latest* release. Planner may treat as approved without a checkpoint — pins avoid the fresh releases except `cn@0.3.2` and `firebase-functions@7.4.0`, both exercised in the spike. `postinstall` check: none of the direct deps have a postinstall; the transitive `@firebase/util`, `esbuild`, `protobufjs` postinstalls are the well-known ones and must be allow-listed (Pitfall 1).

## Architecture Patterns

### System Architecture Diagram

```
 Visitor phone/laptop (QR / LinkedIn / Reddit link with ?ref=xyz)
        │
        ▼
 Firebase Hosting (CDN)  ── serves apps/web/dist, SPA rewrite ** → /index.html
        │
        ▼
 Browser: React app
   ├─ on load: read ?ref= → sessionStorage['ref'] (default 'direct')
   ├─ first paint: pitch + form (main chunk ~77-90 kB gz, no Firebase)
   └─ then dynamic import('./lib/firebase') ──────────────────────────┐
         ├─ onSnapshot(doc 'stats/waitlist') ◄──── Firestore (read allowed by rules)
         └─ submit: httpsCallable('joinWaitlist')({email, protecting?, ref})
                       │  POST https://us-central1-<proj>.cloudfunctions.net/joinWaitlist  {"data":{...}}
                       ▼
 Cloud Functions v2 (nodejs22, us-central1)   [bundled lib/index.js, shared inlined]
   joinWaitlist (onCall)
     ├─ zod WaitlistPayload.safeParse → HttpsError('invalid-argument') on fail
     └─ admin.firestore().collection('waitlist').add({...,createdAt: serverTimestamp}) ─┐
                                                                                        ▼
                                                                    Firestore  waitlist/{autoId}
                                                                                        │ (Eventarc event)
   onWaitlistCreated (onDocumentCreated 'waitlist/{id}') ◄──────────────────────────────┘
     └─ doc('stats/waitlist').set({count: increment(1)}, {merge:true}) ──► Firestore stats/waitlist
                                                                                        │
                                                        realtime push to every open onSnapshot listener
                                                                                        ▼
                                                                          Counter ticks on all browsers
 Secrets: Secret Manager (ANTHROPIC_API_KEY …) ──defineSecret──► functions runtime only (not used by joinWaitlist tonight)
```

### Recommended Project Structure

```
cool/
├── package.json                 # name porchlight, private, packageManager pnpm@11.9.0, scripts dev/build/deploy
├── pnpm-workspace.yaml          # packages: apps/*, packages/*, functions ; allowBuilds ; overrides zod
├── firebase.json                # hosting.public apps/web/dist ; functions.source functions ; firestore.rules
├── .firebaserc                  # { "projects": { "default": "porchlight-xxxx" } }  (committed per D-03)
├── firestore.rules
├── firestore.indexes.json       # {"indexes":[],"fieldOverrides":[]}
├── .gitignore                   # + functions/.secret.local, functions/lib, apps/web/.env.local, .firebase/
├── apps/web/
│   ├── package.json             # @porchlight/web
│   ├── index.html
│   ├── vite.config.ts           # react(), tailwindcss(), alias @ → src
│   ├── tsconfig.json            # references + paths (NO baseUrl — TS 6 errors)
│   ├── tsconfig.app.json
│   ├── components.json          # written by shadcn init
│   ├── .env.example             # VITE_FIREBASE_API_KEY=… etc (committed)
│   ├── .env.local               # real values (gitignored)
│   └── src/
│       ├── main.tsx
│       ├── index.css            # @import "tailwindcss"; shadcn theme vars → warm amber palette
│       ├── lib/utils.ts         # export { cn } from "cn"   (shadcn 4 output)
│       ├── lib/firebase.ts      # initializeApp(import.meta.env.VITE_*), getFirestore, getFunctions('us-central1')
│       ├── lib/ref.ts           # captureRef(): ?ref= → sessionStorage
│       ├── components/ui/       # button, input, card, badge, label (shadcn)
│       ├── components/Lamp.tsx  # CSS/SVG glow
│       ├── components/WaitlistForm.tsx
│       ├── components/LiveCounter.tsx   # lazy-loads lib/firebase, onSnapshot
│       └── pages/Landing.tsx
├── packages/shared/
│   ├── package.json             # @porchlight/shared, "exports": {".": "./src/index.ts"} (raw TS, no build)
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts             # re-exports
│       ├── calls.ts             # CallState union + CALL_STATES + CALL_TRANSITIONS + TACTICS + CallDoc type
│       ├── households.ts
│       └── waitlist.ts          # WaitlistPayload zod schema, WaitlistDoc, StatsWaitlistDoc
├── functions/
│   ├── package.json             # @porchlight/functions, main lib/index.js, engines.node "22", NO workspace: deps
│   ├── tsconfig.json            # paths: @porchlight/shared → ../packages/shared/src/index.ts (NO baseUrl)
│   ├── .secret.local            # ANTHROPIC_API_KEY=… (gitignored)
│   ├── src/index.ts             # joinWaitlist, onWaitlistCreated
│   └── lib/index.js             # esbuild output (gitignored)
├── pi/README.md                 # placeholder (D-01)
└── bridge/README.md             # placeholder (D-01)
```

### Pattern 1: Shared package as raw TypeScript source (no build step)

**What:** `packages/shared/package.json` points `exports` at `./src/index.ts`. Vite consumes workspace-linked TS directly; `functions` inlines it via esbuild; `tsc` in each consumer typechecks it via `paths`/`include`. No `pnpm --filter shared build` ordering problem.
**When to use:** Tonight — one fewer build step in `pnpm -r build`. (smash-tracker builds `dist/` with `tsc -p tsconfig.build.json`; that is the "proper" shape if Phase 2+ wants `.d.ts` for the bridge script, but it is not needed to ship.)
**Example:**
```json
// packages/shared/package.json   [VERIFIED: spike built both web and functions against this]
{
  "name": "@porchlight/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "4.4.3" }
}
```

### Pattern 2: `functions` = workspace package for dev, esbuild bundle for deploy

**What:** `functions/` is listed in `pnpm-workspace.yaml` so `pnpm install`/`pnpm -r build` cover it and pnpm links `firebase-functions`/`firebase-admin` into `functions/node_modules` (symlinks — Firebase CLI's local discovery resolves them fine, verified). Its `package.json` lists only real npm deps. Shared code is reached through `tsconfig.paths` (for `tsc`) and `--alias` (for esbuild) and is **inlined** into `lib/index.js`. Cloud Build only ever sees `package.json` + `lib/`.
**Why not `workspace:*` in functions/package.json:** the CLI uploads `package.json` as-is; remote `npm install` fails on the `workspace:` protocol (E404/"Unsupported URL Type") `[CITED: github.com/firebase/firebase-tools/issues/5552; firecms.co/blog/firebase_functions_monorepo (2025-04-12)]`.
**Example:**
```json
// functions/package.json   [VERIFIED: spike]
{
  "name": "@porchlight/functions",
  "version": "0.0.1",
  "private": true,
  "main": "lib/index.js",
  "engines": { "node": "22" },
  "scripts": {
    "build": "tsc -p tsconfig.json && esbuild src/index.ts --bundle --platform=node --target=node22 --format=cjs --packages=external --alias:@porchlight/shared=../packages/shared/src/index.ts --outfile=lib/index.js",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "firebase-admin": "14.4.0",
    "firebase-functions": "7.4.0",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@types/node": "24.13.2",
    "esbuild": "0.28.2",
    "typescript": "6.0.3"
  }
}
```
```json
// functions/tsconfig.json   [VERIFIED: spike — "TYPECHECK OK (no baseUrl)"]
{
  "compilerOptions": {
    "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext",
    "strict": true, "skipLibCheck": true, "esModuleInterop": true, "noEmit": true,
    "types": ["node"],
    "paths": { "@porchlight/shared": ["../packages/shared/src/index.ts"] }
  },
  "include": ["src", "../packages/shared/src"]
}
```
Spike evidence: bundle is 2.3 kB, `require()` lines are only `firebase-functions/*`, `firebase-admin/*`, `zod`; `CALL_STATES` and `safeParse` appear inline; `node -e "require('./lib/index.js')"` exposes `joinWaitlist.__endpoint.platform === "gcfv2"`, `region ["us-central1"]`, `secretEnvironmentVariables [{key:"ANTHROPIC_API_KEY"}]`, and `onWaitlistCreated.__endpoint.eventTrigger.eventType === "google.cloud.firestore.document.v1.created"`.

### Pattern 3: Callable + Firestore trigger + secrets (firebase-functions 7)

**What:** `onCall` from `firebase-functions/https` (v2 is the default entry in v7; `/v2/https` also works). Trigger from `firebase-functions/firestore`. `defineSecret` from `firebase-functions/params`, bound with `secrets: [...]`, read with `.value()` only inside the handler.
**Example:** see Code Examples §functions. Sources: `[CITED: firebase.google.com/docs/functions/callable]`, `[CITED: firebase.google.com/docs/functions/firestore-events]`, `[CITED: firebase.google.com/docs/functions/config-env]`, exports map `[VERIFIED: npm view firebase-functions@7.4.0 exports]`.

### Pattern 4: Lazy Firebase on the landing page

**What:** Render the pitch and form immediately; `import('./lib/firebase')` afterwards for the counter and the callable.
**Measured (spike, Vite 8, gzip):** everything eager = 705 kB / **211 kB gz** single chunk (Vite warns >500 kB). With dynamic import: main **250 kB / 76 kB gz** (React + zod + shared), `firebase-*.js` **463 kB / 138 kB gz** lazy. With shadcn + 5 components: main 286 kB / 90 kB gz. `[VERIFIED: spike build output]`
**When to use:** Always here — "QR-scanned in a room with bad Wi-Fi."

### Pattern 5: `firebase.json` and root scripts (one command)

```json
// firebase.json   [CITED: firebase.google.com/docs/hosting/full-config; firebase.google.com/docs/functions/manage-functions]
{
  "hosting": {
    "public": "apps/web/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [
      { "source": "/assets/**", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
    ]
  },
  "functions": {
    "source": "functions",
    "runtime": "nodejs22",
    "ignore": ["node_modules", ".git", "**/.*", "src", "tsconfig.json"]
  },
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "emulators": {
    "functions": { "port": 5001 },
    "firestore": { "port": 8080 },
    "hosting": { "port": 5000 },
    "ui": { "enabled": true }
  }
}
```
Notes: `functions.runtime` in `firebase.json` takes precedence over `engines` `[CITED: manage-functions]`; `"**/.*"` in `functions.ignore` keeps `.secret.local` out of the upload (the CLI never uploads it anyway, but be explicit). Do **not** use a Hosting→Function rewrite for `joinWaitlist`; the client calls the function URL directly via `httpsCallable`, so region colocation with Hosting is moot.

```json
// root package.json scripts   [pattern from smash-tracker; D-02]
{
  "name": "porchlight",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "packageManager": "pnpm@11.9.0",
  "scripts": {
    "dev": "concurrently -n web,fb -c cyan,yellow \"pnpm --filter @porchlight/web dev\" \"firebase emulators:start --only functions,firestore,hosting\"",
    "dev:web": "pnpm --filter @porchlight/web dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "deploy": "pnpm -r build && firebase deploy --only hosting,functions,firestore:rules",
    "deploy:web": "pnpm --filter @porchlight/web build && firebase deploy --only hosting"
  }
}
```
`pnpm dev` (with Firestore emulator) requires JDK 21 — see Environment Availability. Until Java is installed, use `dev:web` against the live project (`.env.local` points at the real project) and `firebase emulators:start --only functions` for callable smoke tests.

```yaml
# pnpm-workspace.yaml   [VERIFIED: spike — install failed until allowBuilds was present]
packages:
  - 'apps/*'
  - 'packages/*'
  - 'functions'
overrides:
  zod: 4.4.3
allowBuilds:
  '@firebase/util': true
  esbuild: true
  protobufjs: true
```

### Pattern 6: Project bootstrap (human checkpoint sequence, exact commands)

```bash
# 1. Create project (CLI syntax verified via --help this session)
firebase projects:create porchlight-ri -n "Porchlight"        # id must be globally unique; retry with suffix
firebase use porchlight-ri                                     # writes .firebaserc
# 2. Blaze upgrade — CONSOLE ONLY: https://console.firebase.google.com/project/porchlight-ri/usage/details
#    Without it, `firebase deploy --only functions` stops with:
#    "Error: Your project must be on the Blaze (pay-as-you-go) plan to complete this command.
#     Required API cloudbuild.googleapis.com can't be enabled until the upgrade is complete."
#    [CITED: firebase.google.com/docs/functions/get-started "To deploy functions, your project must be on the Blaze pricing plan";
#     error text from firebase-tools issue threads — wording ASSUMED to be current]
# 3. Firestore database (Native mode). Either:
firebase firestore:databases:create "(default)" --location nam5     # syntax verified via --help; "(default)" name [ASSUMED]
#    or console → Build → Firestore → Create database (production mode, nam5 or us-east1)
# 4. Web app + public config → apps/web/.env.local
firebase apps:create WEB porchlight-web
firebase apps:sdkconfig WEB                                    # prints apiKey/authDomain/projectId/appId → paste as VITE_FIREBASE_*
# 5. Secret (human types the key; not in shell history if prompted)
firebase functions:secrets:set ANTHROPIC_API_KEY               # prompts for value
firebase functions:secrets:access ANTHROPIC_API_KEY | head -c 12   # sanity (prints prefix only)
# 6. First deploy — expect 3-6 min; the CLI enables cloudfunctions/cloudbuild/artifactregistry/run/eventarc itself on Blaze.
pnpm deploy
# If the Firestore trigger fails with "Permission denied while using the Eventarc Service Agent" — wait 2-3 min and re-run
# `firebase deploy --only functions` [CITED: docs.cloud.google.com/eventarc/docs/troubleshooting]
```
Manual API enable fallback (only if the CLI's auto-enable fails) `[ASSUMED — standard gcloud syntax, not exercised]`:
```bash
gcloud services enable cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com eventarc.googleapis.com pubsub.googleapis.com --project porchlight-ri
```

### Anti-Patterns to Avoid
- **`workspace:*` anywhere in `functions/package.json`:** remote `npm install` cannot resolve it. Use `paths` + `--alias`.
- **`esbuild --packages=external` without `--alias` for shared:** leaves `require("@porchlight/shared")` in the bundle → `Cannot find module` at cold start. Verified in spike.
- **`baseUrl` in any tsconfig:** TS 6.0.3 emits `error TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0`. The shadcn docs page still tells you to add it — don't. `paths` alone works (smash-tracker does this).
- **Direct client writes to `waitlist/`:** locked out by D-10; rules deny all writes.
- **Importing the whole `firebase` package or `firebase/compat`:** use subpath imports; lazy-load.
- **`firebase/firestore/lite` for the counter:** the lite SDK has no `onSnapshot` `[ASSUMED — well known; docs page fetched did not state it]`.
- **Hosting rewrite to the function:** unnecessary for `httpsCallable`; adds region coupling.
- **Reading `secret.value()` at module top level:** values are only available during execution `[CITED: config-env]`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email/ref validation | Regex soup on both sides | zod `WaitlistPayload` in `packages/shared`, used by client (UX) and function (trust) | One schema, one error shape |
| Callable transport / CORS / error codes | `fetch` + custom JSON envelope on an `onRequest` | `onCall` + `httpsCallable` | Envelope, CORS, `HttpsError` codes, emulator wiring for free |
| Atomic counter | Read-modify-write in the callable | `onDocumentCreated` + `FieldValue.increment(1)` with `{merge:true}` | Increment is server-side atomic; trigger keeps write path single-purpose. (At-least-once delivery could double count in rare retries — acceptable for a demo counter; see Pitfall 8) |
| Secrets plumbing | `.env` with keys committed "just for tonight" | `defineSecret` + `functions:secrets:set` + `.secret.local` | Secret Manager, never in bundle or git |
| Monorepo functions packaging | tarball `predeploy.js`, `isolate-package`, `file:` deps | esbuild bundle (Pattern 2) | 1 flag set, verified |
| Component primitives | Hand-written buttons/inputs | shadcn `button input card badge label` | Accessible, themed via CSS vars |

## Common Pitfalls

### Pitfall 1: pnpm 11 hard-fails on ignored build scripts
**What goes wrong:** `pnpm install` exits 1 with `ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: @firebase/util, esbuild, protobufjs`.
**Why:** pnpm 11 blocks lifecycle scripts by default.
**How to avoid:** `allowBuilds` block in `pnpm-workspace.yaml` (Pattern 5) **before** the first install. `[VERIFIED: spike]`
**Warning signs:** the error above; `esbuild` binary missing.

### Pitfall 2: No Java → Firestore emulator will not start
**What goes wrong:** `firebase emulators:start --only firestore` fails; firebase-tools 15 requires **JDK 21+** (`[CITED: CLI release notes 15.0.0, 2025-12-10: "Removed support for running emulators with Java versions prior to 21"]`). `java -version` on this Mac: "Unable to locate a Java Runtime". `[VERIFIED: local probe]`
**How to avoid:** Either `brew install openjdk@21 && sudo ln -sfn /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-21.jdk` (`[ASSUMED]` brew formula name/symlink step — standard but not run), or skip the Firestore emulator tonight and test the counter on the live project. The **Functions** emulator alone runs fine without Java (verified) but logs `function ignored because the firestore emulator does not exist or is not running` for the trigger.
**Planner guidance:** make Java install an optional task; the deploy path is the real test.

### Pitfall 3: `--packages=external` externalizes the shared alias
Covered in Anti-Patterns; verified. Always include `--alias:@porchlight/shared=../packages/shared/src/index.ts`.

### Pitfall 4: `engines.node: "22"` warning under Node 24
**What goes wrong:** pnpm prints `[WARN] Unsupported engine: wanted: {"node":"22"} (current: {"node":"v24.11.1"})`; emulator prints `Your requested "node" version "22" doesn't match your global version "24". Using node@24 from host.` Both are warnings, not failures. `[VERIFIED: spike]`
**How to avoid:** ignore; do not set `engine-strict`. Keep `firebase.json` `"runtime": "nodejs22"` as the source of truth.

### Pitfall 5: shadcn init needs tsconfig files and a valid preset
**What goes wrong:** `init` fails with `Failed to load tsconfig.json. Couldn't find tsconfig.json`; `--preset base-nova` (the CLI's own `-d` default) is **invalid** — `Available presets: nova, vega, maia, lyra, mira, luma, sera, rhea`. `[VERIFIED: spike]`
**How to avoid:** create `tsconfig.json` (with `paths`) and `tsconfig.app.json` first, then `pnpm dlx shadcn@4.21.0 init -y --base radix --preset nova`. It writes `components.json` (`"style": "radix-nova"`, `"tailwind": {"config": "", "css": "src/index.css", "baseColor": "neutral", "cssVariables": true}`), `src/lib/utils.ts`, rewrites `src/index.css` with `@import "tailwindcss"; @import "tw-animate-css"; @import "shadcn/tailwind.css"; @import "@fontsource-variable/geist";` + theme vars, and adds runtime deps `shadcn`, `cn`, `radix-ui`, `lucide-react`, `class-variance-authority`, `tw-animate-css`, `@fontsource-variable/geist`.
**Theme:** override `:root` vars in `index.css` for the amber palette (e.g. `--primary: oklch(0.78 0.16 70)`; `--background: oklch(0.99 0.01 85)`), keep the `@theme inline` block shadcn generated.

### Pitfall 6: TS 7 is `latest` on npm
`npm view typescript version` → 7.0.2. Pin `6.0.3` explicitly everywhere (`pnpm add -D typescript@6.0.3`), or `pnpm add -D typescript` will pull 7 and behavior of `tsc -b`/`paths` is unverified. `[VERIFIED: registry]`

### Pitfall 7: Blaze / APIs / first-deploy latency
Functions deploy is blocked until Blaze (Pattern 6 error text). First 2nd-gen deploy typically 3-6 min; Eventarc trigger may need a retry (`Permission denied while using the Eventarc Service Agent` — "it may take a few minutes before all necessary permissions are propagated" `[CITED: docs.cloud.google.com/eventarc/docs/troubleshooting]`). Deploy Hosting first (`pnpm deploy:web`) so the page is public even if functions lag; the form can show "try again in a minute" until the callable is live.

### Pitfall 8: Trigger at-least-once delivery
`onDocumentCreated` is at-least-once `[CITED: firestore-events]`; a retried event would double-increment. Acceptable tonight. If a judge notices, `stats/waitlist.count` can be reconciled from `waitlist` collection size with a one-off admin script. Optional hardening (Phase 5 polish): store `event.id` in `stats/waitlist.lastEventId` and skip if equal — not worth 90-minute budget now.

### Pitfall 9: `.firebaserc` and `.gitignore`
smash-tracker's `.gitignore` ignores `.firebaserc`; **D-03 says commit it** — do not copy that line. Current repo `.gitignore` already has `.env`, `.env.*`, `!.env.example`, `node_modules/`, `dist/`, `.firebase/`. Add: `functions/.secret.local`, `functions/lib/`, `*.tsbuildinfo`, `*-debug.log` (emulator logs like `firebase-debug.log`, `ui-debug.log`).

### Pitfall 10: Public web config is not a secret, but the Anthropic key must never touch `apps/web`
`VITE_*` vars are inlined into the bundle by design. Only `VITE_FIREBASE_*` belongs there. The Functions secret is read by `defineSecret` only.

## Code Examples

### packages/shared — schema and constants (D-05/D-06/D-07)
```ts
// packages/shared/src/calls.ts
export const CALL_STATES = ['idle', 'screening', 'verifying', 'verified', 'scam', 'ended'] as const;
export type CallState = (typeof CALL_STATES)[number];

// D-05 / FND-03 state machine: idle → screening → verifying → verified | scam → ended
export const CALL_TRANSITIONS: Record<CallState, readonly CallState[]> = {
  idle: ['screening'],
  screening: ['verifying', 'scam', 'ended'],
  verifying: ['verified', 'scam', 'ended'],
  verified: ['ended'],
  scam: ['ended'],
  ended: [],
};

export const TACTICS = ['urgency', 'secrecy', 'payment_method', 'authority_bail', 'impersonation'] as const;
export type Tactic = (typeof TACTICS)[number];

export interface CallTurn { role: 'caller' | 'assistant'; text: string; at: number }
export interface CallDoc {
  householdId: string;
  state: CallState;
  from: string;
  startedAt: number;
  endedAt?: number;
  provider: 'elevenlabs' | 'simulator';
  providerCallId?: string;
  turns: CallTurn[];
  risk: { score: number; tactics: Tactic[]; claimedIdentity?: string; recommendedAction: 'continue' | 'verify' | 'end'; updatedAt: number };
  verification?: { memberId: string; promptedAt: number; answeredAt?: number; answer?: 'yes' | 'no' | 'timeout'; method?: 'passkey' | 'link' };
  outcome?: 'verified' | 'scam' | 'screened';
  report?: string;
}
```
(Timestamps as epoch-ms numbers keep the type identical across web SDK, Admin SDK, and the Python bridge consumer; `[ASSUMED]` design choice — Firestore `Timestamp` objects differ between `firebase` and `firebase-admin` typings, which is the reason.)

```ts
// packages/shared/src/waitlist.ts   [VERIFIED: spike compiled + ran safeParse]
import { z } from 'zod';
export const REFS = ['direct', 'li', 'reddit', 'fb', 'friends', 'qr', 'judges'] as const;
export const WaitlistPayload = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  protecting: z.string().trim().max(200).optional(),
  ref: z.string().trim().max(32).default('direct'),
});
export type WaitlistPayload = z.infer<typeof WaitlistPayload>;
export interface WaitlistDoc extends WaitlistPayload { createdAt: unknown; ua?: string }
export interface StatsWaitlistDoc { count: number }
```

### functions/src/index.ts   [VERIFIED: spike — bundled, loaded, emulator-served]
```ts
import { onCall, HttpsError } from 'firebase-functions/https';
import { onDocumentCreated } from 'firebase-functions/firestore';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { WaitlistPayload } from '@porchlight/shared';

initializeApp();
const REGION = 'us-central1';

// Declared now so `functions:secrets:set` + binding are exercised tonight; used in Phase 2.
export const anthropicKey = defineSecret('ANTHROPIC_API_KEY');

export const joinWaitlist = onCall({ region: REGION, cors: true }, async (req) => {
  const parsed = WaitlistPayload.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid signup', parsed.error.flatten());
  const ua = req.rawRequest.get('user-agent')?.slice(0, 200);
  const ref = await getFirestore().collection('waitlist').add({
    ...parsed.data,
    ua,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
});

export const onWaitlistCreated = onDocumentCreated({ document: 'waitlist/{id}', region: REGION }, async () => {
  await getFirestore().doc('stats/waitlist').set({ count: FieldValue.increment(1) }, { merge: true });
});
```
Seed `stats/waitlist` with `{count: 0}` once (console or `gcloud firestore` / admin script) so the counter renders `0` instead of `undefined` before the first signup — or default `?? 0` client-side (do both).

### Calling the function with curl (docs envelope `{"data": …}`)
```bash
# deployed
curl -s -X POST https://us-central1-porchlight-ri.cloudfunctions.net/joinWaitlist \
  -H 'Content-Type: application/json' \
  -d '{"data":{"email":"test+curl@example.com","protecting":"my mom","ref":"judges"}}'
# → {"result":{"id":"…"}}
# emulator
curl -s -X POST http://127.0.0.1:5001/porchlight-ri/us-central1/joinWaitlist -H 'Content-Type: application/json' -d '{"data":{"email":"x@y.co"}}'
# invalid → HTTP 400 {"error":{"message":"Invalid signup","status":"INVALID_ARGUMENT","details":{…}}}
```
`[CITED: firebase.google.com/docs/functions/callable — HTTP request format; emulator URL format VERIFIED from emulator log: http://127.0.0.1:5001/<project>/us-central1/joinWaitlist]`

### firestore.rules   [CITED: rules-structure — `read` = `get`+`list`; permissive OR across overlapping matches]
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Public single-doc read for the live counter (no auth required; request.auth is null for anonymous web clients)
    match /stats/waitlist {
      allow get: if true;
    }
    // Everything else closed to clients; Admin SDK in Functions bypasses rules
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```
`allow get` is sufficient for `onSnapshot(doc(...))` (a single-document listener is a `get`). No Firebase Auth needed on the web client.

### apps/web/src/lib/firebase.ts   [VERIFIED: spike build]
```ts
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { WaitlistPayload, StatsWaitlistDoc } from '@porchlight/shared';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});
export const db = getFirestore(app);
export const fns = getFunctions(app, 'us-central1');
export const joinWaitlist = httpsCallable<WaitlistPayload, { id: string }>(fns, 'joinWaitlist');
export function watchWaitlistCount(cb: (n: number) => void) {
  return onSnapshot(doc(db, 'stats', 'waitlist'), (snap) => cb((snap.data() as StatsWaitlistDoc | undefined)?.count ?? 0));
}
// Emulator wiring (only when running `pnpm dev` with emulators):
// import { connectFirestoreEmulator } from 'firebase/firestore'; import { connectFunctionsEmulator } from 'firebase/functions';
// if (import.meta.env.VITE_USE_EMULATORS === '1') { connectFirestoreEmulator(db, '127.0.0.1', 8080); connectFunctionsEmulator(fns, '127.0.0.1', 5001); }
```
Consumers must `import('@/lib/firebase')` lazily (Pattern 4). `[CITED: firebase.google.com/docs/firestore/query-data/listen — onSnapshot(doc(db,…)) returns unsubscribe]`

### apps/web/src/lib/ref.ts (D-11)
```ts
const KEY = 'porchlight:ref';
export function captureRef(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('ref');
  if (fromUrl) sessionStorage.setItem(KEY, fromUrl.slice(0, 32));
  return sessionStorage.getItem(KEY) ?? 'direct';
}
```
Call `captureRef()` once in `main.tsx` before render; read `sessionStorage` again at submit. `[ASSUMED — trivial browser APIs]`

### LiveCounter (lazy)
```tsx
import { useEffect, useState } from 'react';
export function LiveCounter() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let unsub = () => {};
    import('@/lib/firebase').then(({ watchWaitlistCount }) => { unsub = watchWaitlistCount(setN); });
    return () => unsub();
  }, []);
  return <p className="text-3xl font-semibold tabular-nums">{n ?? '…'} families on the waitlist</p>;
}
```

### .env.example (committed) / .env.local (gitignored)
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=porchlight-ri.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=porchlight-ri
VITE_FIREBASE_APP_ID=
```
`functions/.secret.local` (gitignored): `ANTHROPIC_API_KEY=sk-ant-…` — the emulator reads it (`[CITED: config-env — ".secret.local file in the functions folder with secret names and values on each line"]`; spike started with it present, no error).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `firebase-functions/v2/https` + v1 default entry | `firebase-functions/https` (v2 is the default export in v7) | firebase-functions 7.0.0 (2025-11-10) | Both paths work; use the short one |
| `functions.config()` | `params` (`defineSecret`, `defineString`) | removed in v7 | No `.runtimeconfig.json` |
| Tailwind `tailwind.config.js` + PostCSS | `@tailwindcss/vite` + `@import "tailwindcss"` | Tailwind 4 | `components.json` `tailwind.config: ""` |
| shadcn `new-york` style, `@radix-ui/react-*` per-package | shadcn 4 presets (`nova`…), `--base radix`, unified `radix-ui` pkg, `cn` pkg, `shadcn/tailwind.css` runtime import | shadcn 4.x (2026) | `shadcn` is now a runtime dependency |
| Java 11 for emulators | JDK 21+ | firebase-tools 15.0.0 (2025-12-10) | Mac has none |
| TS 5/6 `baseUrl` | `paths` only | TS 6 deprecates (`TS5101`), TS 7 removes | shadcn docs lag |
| Node 18/20 functions | nodejs22 GA (locked), nodejs24 available (CLI 14.26.0) | 2025 | Pin `nodejs22` |

**Deprecated/outdated:** `firebase init functions` template's `"engines": {"node": "18"}` in the get-started doc excerpt — Node 18 is deprecated; use 22.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Cloud Build's remote `npm install` succeeds for `functions/package.json` with only registry deps (no lockfile uploaded since the pnpm lockfile lives at root) | Pattern 2 | Deploy fails → fallback: add `npm install --package-lock-only` in functions to generate `package-lock.json` before deploy, or vendor a lockfile |
| A2 | Exact Blaze error wording | Pattern 6 | Cosmetic |
| A3 | `firebase firestore:databases:create "(default)" --location nam5` creates the default DB (flag syntax verified; the `(default)` name not exercised) | Pattern 6 | Use console instead (1 minute) |
| A4 | `gcloud services enable …` list | Pattern 6 | Only needed if CLI auto-enable fails |
| A5 | `brew install openjdk@21` + symlink step | Pitfall 2 | Skip emulators; test live |
| A6 | `firebase/firestore/lite` lacks `onSnapshot` | Anti-patterns | Irrelevant if full SDK is used as recommended |
| A7 | epoch-ms numbers for timestamps in shared types | Code Examples | Phase 2 can switch to `Timestamp`; keep `createdAt` on waitlist as `serverTimestamp()` regardless |
| A8 | `req.rawRequest.get('user-agent')` available on `CallableRequest` | functions example | Drop `ua` if typing complains (optional field per D-06) |

## Open Questions

1. **Does Cloud Build honor a root-only pnpm setup?** — What we know: CLI uploads only `functions/`; no lockfile there → `npm install`. What's unclear: whether GCF's buildpack complains about missing lockfile (it does not; it just installs). Recommendation: proceed; on failure apply A1 fallback.
2. **Firestore location** — `nam5` (multi-region US) vs `us-east1` (smash-tracker uses `us-east1`). Functions are `us-central1` either way. Recommendation: `nam5` for zero-thought reliability; latency differences are irrelevant for a counter.
3. **Java install tonight?** Recommendation: no — 90-minute window; deploy is the test. Add as optional task for Phase 2 (call pipeline benefits from local Firestore triggers).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | everything | ✓ | v24.11.1 | — |
| pnpm | workspace | ✓ | 11.9.0 | — |
| npm | `npm view` checks only | ✓ | 11.6.2 | — |
| firebase-tools | deploy/emulators | ✓ | 15.22.4, logged in as bsmerbeck@gmail.com | — |
| gcloud SDK | API enable fallback, `gcloud firestore` reads | ✓ | 585.0.0 | Firebase console |
| Java JDK 21+ | Firestore emulator (`pnpm dev`) | ✗ | — | `brew install openjdk@21` or test on live project |
| Homebrew | JDK install | ✓ | 7.0.1 | — |
| Firebase project `porchlight-*` | FND-02, deploy | ✗ (not in `firebase projects:list`) | — | Human checkpoint (Pattern 6) |
| Blaze billing | Functions deploy | ✗ | — | Human checkpoint; deploy hosting-only meanwhile |
| Anthropic API key | `functions:secrets:set` | exists (per PROJECT.md), not in shell | — | Human checkpoint |
| Context7 / ctx7 CLI | research only | ✗ | — | Official docs via WebFetch (used) |

**Missing dependencies with no fallback:** Firebase project + Blaze (human, ~5 min, on critical path before `pnpm deploy`).
**Missing dependencies with fallback:** Java (skip emulators tonight).

## Runtime State Inventory

Not applicable — greenfield phase (no rename/refactor/migration). Verified: repo contains only `.planning/`, `.gitignore`, `.claude/CLAUDE.md`, `.git/`.

## Verification Commands (per requirement)

> `workflow.nyquist_validation` is `false` in `.planning/config.json`, so no Validation Architecture section / Wave 0 test scaffolding is required. These are the executor-runnable proofs the phase goal asks for.

| Req | Proof command | Expected |
|-----|---------------|----------|
| FND-01 | `pnpm install && pnpm -r build && ls apps/web/dist/index.html functions/lib/index.js` | both files exist; `pnpm -r typecheck` exits 0 |
| FND-01 | `pnpm deploy` (after checkpoint) | ends with `✔ Deploy complete!` and prints `Hosting URL: https://<project>.web.app` |
| FND-02 | `firebase projects:list \| grep porchlight`; `firebase functions:secrets:access ANTHROPIC_API_KEY \| cut -c1-7` | project row; `sk-ant-` |
| FND-02 | `git ls-files \| grep -Ei '\.env($\|\.local)\|secret\.local'` → empty; `git grep -Ei 'sk-ant-\|AC[0-9a-f]{32}'` → empty | nothing secret tracked |
| FND-03 | `grep -l "@porchlight/shared" apps/web/src/**/*.ts* functions/src/index.ts`; `grep -c CALL_STATES functions/lib/index.js` | both import it; constant inlined in bundle |
| LAND-01 | `curl -sI https://<project>.web.app \| head -1`; `curl -s https://<project>.web.app \| grep -o '<title>[^<]*'` | `HTTP/2 200`; title present. Phone check is human (end-of-phase `human_verify_mode`) |
| LAND-02 | curl the callable (Code Examples) then `gcloud firestore documents list`-style read is not available; use `node -e` with firebase-admin + ADC: `GOOGLE_CLOUD_PROJECT=<project> node -e "require('firebase-admin/app').initializeApp();require('firebase-admin/firestore').getFirestore().collection('waitlist').orderBy('createdAt','desc').limit(1).get().then(s=>console.log(s.docs[0].data()))"` (run from `functions/`) | prints the email/ref just submitted |
| LAND-03 | same admin one-liner on `doc('stats/waitlist')` before/after a curl signup | `count` increments by 1 within ~2 s; two browsers open → both tick (human) |
| LAND-04 | curl with `"ref":"judges"` then read doc | `ref: 'judges'`; page load with `?ref=qr` → `sessionStorage['porchlight:ref'] === 'qr'` (DevTools) |
| Logs | `firebase functions:log --only joinWaitlist` | request lines `[CITED: writing-and-viewing-logs]` |

## Security Domain

`security_enforcement: true`, ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (public landing; no accounts this phase) | — (Phase 4 adds passkeys) |
| V3 Session Management | no | — |
| V4 Access Control | yes | Firestore rules: client read only on `stats/waitlist`, all writes denied; Admin SDK only in Functions |
| V5 Input Validation | yes | zod `WaitlistPayload` in `joinWaitlist` (server-side, trust boundary); `HttpsError('invalid-argument')` on failure; lengths capped (email 254, protecting 200, ref 32) |
| V6 Cryptography | no hand-rolled crypto | Secrets in Secret Manager via `defineSecret`; TLS by Hosting/Functions |
| V14 Configuration | yes | `.env.local`/`.secret.local` gitignored; `.env.example` committed; `VITE_*` limited to public Firebase config |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Waitlist spam / counter inflation via curl | Tampering / DoS | zod validation; email normalization (trim/lowercase) reduces dupes; `maxInstances: 5` on `joinWaitlist` caps cost; App Check explicitly not required (D-10). Optional 1-line dedupe: `where('email','==',…)` check before add `[ASSUMED]` |
| Secret leakage into web bundle | Information disclosure | Only `VITE_FIREBASE_*` in `apps/web`; `git ls-files` check in verification |
| Open Firestore rules | Elevation of privilege | Rules above; test with `firebase deploy --only firestore:rules` then an unauthenticated client `setDoc` must fail `permission-denied` |
| CORS misconfiguration | Spoofing | `onCall` handles CORS; `cors: true` is acceptable for a public signup |
| Dependency supply chain (`cn`, `firebase-functions` fresh releases) | Tampering | Pinned versions; legitimacy audit above; `allowBuilds` limited to 3 known postinstalls |
| XSS via "who are you protecting?" text | Tampering | React escapes by default; never `dangerouslySetInnerHTML`; value is only shown to admins later |

## Sources

### Primary (HIGH confidence — executed or read this session)
- Local spike `scratchpad/spike` — pnpm 11.9.0 install with `allowBuilds`; esbuild 0.28.2 bundle of `functions` with/without `--alias`; `tsc` 6.0.3 with/without `baseUrl`; Vite 8.1.3 + Tailwind 4.3.2 + React 19.2.7 + firebase 12.15.0 build and chunk sizes; shadcn 4.21.0 `init`/`add` outputs; `firebase emulators:start --only functions` log
- `npm view` — versions, `engines`, `peerDependencies`, `exports` maps for firebase-functions@7.4.0, firebase-admin@14.4.0, firebase@12.19.0, vite@8.3.0, typescript
- `firebase --help` for `projects:create`, `firestore:databases:create`, `functions:secrets:set|access`, `apps:create`, `apps:sdkconfig`; `firebase projects:list`; `firebase login:list`
- `/Users/bsmerbeck/git/grandfinals/smash-tracker` — `package.json`, `pnpm-workspace.yaml`, `firebase.json`, `apps/web/{package.json,vite.config.ts,tsconfig*.json,components.json,src/index.css}`, `packages/shared/{package.json,tsconfig.json}`, `pnpm-lock.yaml` resolved versions

### Secondary (MEDIUM confidence — official docs via WebFetch)
- ui.shadcn.com/docs/installation/vite — install steps (note: still says add `baseUrl`)
- firebase.google.com/docs/functions/{callable,http-events,firestore-events,config-env,manage-functions,get-started,writing-and-viewing-logs}
- firebase.google.com/docs/hosting/{full-config,functions}
- firebase.google.com/docs/firestore/{security/get-started,security/rules-structure,query-data/listen}
- firebase.google.com/docs/emulator-suite/install_and_configure
- firebase.google.com/support/release-notes/cli (15.0.0 Java 21; 14.26.0 nodejs24 + functions 7 template)
- github.com/firebase/firebase-functions/releases/tag/v7.0.0 (2025-11-10)
- docs.cloud.google.com/eventarc/docs/troubleshooting (service-agent propagation)

### Tertiary (LOW confidence — community, cross-checked with spike where possible)
- github.com/firebase/firebase-tools/issues/5552 (pnpm workspace deps); firecms.co/blog/firebase_functions_monorepo (2025-04-12, tarball approach); codejam.info 2023 monorepo write-up; firebase-tools issues #5520/#7401 (`.secret.local` behavior, fixed ≥13.15.1)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every pin installed and built in the spike
- Architecture (functions bundling, lazy Firebase, rules): HIGH — bundling + emulator load verified; rules syntax from official docs
- Remote deploy behavior (Cloud Build install, Eventarc first-deploy): MEDIUM — cannot exercise without a project; well-documented failure modes with retries listed
- Pitfalls: HIGH — 6 of 10 reproduced locally

**Research date:** 2026-09-21
**Valid until:** 2026-09-23 (end of hackathon) — the stack is pinned, so it remains valid; refresh only if pins change.
