# Phase 1: Foundation and Landing Page Live - Context

**Gathered:** 2026-09-21 (decisions captured from PLAN.md + project kickoff; no separate discuss session — hackathon clock)
**Status:** Ready for planning

<domain>
## Phase Boundary

The Porchlight monorepo builds and deploys with one command, vendor secrets are wired without touching git, the shared `calls/{id}` schema exists once, and the public landing page is collecting attributed waitlist signups with a live counter. Target window: Mon 8:30–10PM. Nothing about telephony, Claude scoring, the lamp, or verification is built in this phase — only the schema types they will share.

</domain>

<decisions>
## Implementation Decisions

### Repo layout and tooling
- **D-01:** pnpm workspace monorepo at repo root (`/Users/bsmerbeck/git/hackathon/cool`, already `git init`'d, Node 24, pnpm 11). Packages: `apps/web` (Vite + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui), `functions` (Firebase Functions v2, TypeScript, Node 22 runtime), `packages/shared` (types + Firestore schema + zod validators), `pi/` (Python 3.9 stdlib only — created empty with a README in this phase), `bridge/` (Node script — created empty with a README in this phase).
- **D-02:** One-command deploy: root `pnpm deploy` runs `pnpm -r build` then `firebase deploy --only hosting,functions,firestore:rules`. Root `pnpm dev` runs Vite + Firebase emulators concurrently.
- **D-03:** Firebase project is created by the human (checkpoint) via `firebase projects:create` or console; CLI is already logged in as bsmerbeck@gmail.com. Project id pattern: `porchlight-<something>`. `firebase use` writes `.firebaserc` (committed). Blaze upgrade is a human checkpoint before Functions deploy.
- **D-04:** Secrets: Functions read `ANTHROPIC_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `ELEVENLABS_API_KEY` via `defineSecret` (Secret Manager, set with `firebase functions:secrets:set`). Local dev uses `functions/.secret.local` (gitignored). Web uses `VITE_FIREBASE_*` public config in `apps/web/.env.local` (gitignored) with a committed `.env.example`. Only the Anthropic key exists tonight; the others are placeholders until Phase 2's human checkpoint.

### Shared schema (`packages/shared`)
- **D-05:** `calls/{callId}` document: `{ householdId, state: 'idle'|'screening'|'verifying'|'verified'|'scam'|'ended', from: string, startedAt, endedAt?, provider: 'elevenlabs'|'simulator', providerCallId?, turns: Array<{ role:'caller'|'assistant', text, at }>, risk: { score:number, tactics:string[], claimedIdentity?:string, recommendedAction:'continue'|'verify'|'end', updatedAt }, verification?: { memberId, promptedAt, answeredAt?, answer?:'yes'|'no'|'timeout', method?:'passkey'|'link' }, outcome?: 'verified'|'scam'|'screened', report?: string }`. Turns live inline on the doc (small, demo-scale) so one `onSnapshot` drives everything.
- **D-06:** `households/{id}`: `{ name, seniorName:'Margaret', members: Array<{ id, name, relation, aliases:string[], passkeyCredentialIds:string[] }> }`. `waitlist/{id}`: `{ email, protecting?:string, ref:string, createdAt, ua? }`. `stats/waitlist`: `{ count:number }` maintained by a Firestore trigger so the counter is one cheap listener.
- **D-07:** State transitions and tactic enum exported as constants from `packages/shared` and imported by both web and functions; zod schemas for the waitlist payload.

### Landing page
- **D-08:** Route `/` is the landing page; `/app/*` reserved for the family dashboard (Phase 4), `/stage` for the projector view. Single Vite app.
- **D-09:** Content: headline + one-paragraph problem with the FBI IC3 number (marked "verify" in copy until the human confirms), 3-step "how it works" (screens → verifies family → lamp), lamp illustration (simple CSS/SVG glow — no photo needed tonight), waitlist form (email + optional "Who are you protecting?" free text), live counter "N families on the waitlist", footer "Built in 24h at RI Startup Week".
- **D-10:** Waitlist write goes through a callable/HTTPS Function (`joinWaitlist`) that validates with zod and writes Firestore — not direct client writes — so rules stay closed and abuse is limited. Counter reads `stats/waitlist` via `onSnapshot`. Firestore rules: deny all client writes; allow client read of `stats/waitlist` only.
- **D-11:** `?ref=` captured from URL on load, persisted in `sessionStorage`, sent with the signup. Default ref `direct`. Planned refs: `li`, `reddit`, `fb`, `friends`, `qr`, `judges`.
- **D-12:** Firebase Hosting default domain (`<project>.web.app`) is fine; custom domain is out of scope tonight.

### Claude's Discretion
- shadcn component selection, Tailwind theme (warm amber/porchlight palette suggested), exact copy, SVG lamp illustration, folder naming inside packages, test framework choice (Vitest expected), whether `functions` is a workspace package or standalone `package.json` — pick whatever deploys cleanly with Firebase CLI 15.

</decisions>

<specifics>
## Specific Ideas

- Look and feel: warm, calm, trustworthy — a porch light at dusk, not a security-vendor red/black. Large type; a senior's adult child should read it on a phone in 20 seconds.
- Counter must visibly tick when a second browser signs up (this is demoed to judges).
- Keep the landing page's JS light; it will be QR-scanned in a room with bad Wi-Fi.
- Human checkpoints in this phase (planner: make these explicit `checkpoint` tasks, not automated): create Firebase project + Blaze; put Anthropic key in secrets; post the page with refs.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `/Users/bsmerbeck/git/hackathon/PLAN.md` — strategy, demo script, hour-by-hour timeline
- `.planning/PROJECT.md` — constraints, key decisions, environment facts
- `.planning/REQUIREMENTS.md` — FND-01..03, LAND-01..04
- `/Users/bsmerbeck/git/grandfinals/smash-tracker/package.json`, `pnpm-workspace.yaml`, `firebase.json`, `apps/web/vite.config.ts`, `apps/web/tailwind` config — the builder's proven Vite/React/Firebase monorepo shape; copy conventions, not code

</canonical_refs>

<deferred>
## Deferred Ideas

- Custom domain (porchlight.family or similar) — after the hackathon
- Email confirmation to waitlist signups — needs a mail provider; skip
- Analytics beyond `?ref=` counts — skip

</deferred>

---

*Phase: 01-foundation-and-landing-page-live*
*Context gathered: 2026-09-21*
