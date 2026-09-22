# Walking Skeleton — Porchlight

**Phase:** 1
**Generated:** 2026-09-21

## Capability Proven End-to-End

> A visitor on the public landing page submits their email (with `?ref=` attribution) and watches the "families on the waitlist" counter tick on every open browser — served by Firebase Hosting, written by a Functions v2 callable, counted by a Firestore trigger, read by `onSnapshot`.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Repo shape | pnpm 11 workspace: `apps/web`, `packages/shared`, `functions` (+ `pi/`, `bridge/` placeholders) | D-01; proven in the builder's smash-tracker repo; one `pnpm -r build` covers everything |
| Web framework | Vite 8.1.3 + React 19.2.7 + TypeScript 6.0.3 (strict, `paths` only, no deprecated base-URL option) | D-01; fastest stack for this builder; TS 7 unverified with this toolchain |
| Styling | Tailwind 4.3.2 via `@tailwindcss/vite` + shadcn 4.21 (`--base radix --preset nova`), warm amber theme vars in `index.css` | D-01; shadcn gives accessible primitives; amber = porch light at dusk |
| Routing | Pathname switch in `App.tsx` (`/`, `/app*`, `/stage`), Hosting SPA rewrite | D-08; zero-dependency keeps the QR-scanned page light; Phase 4 may add a router |
| Shared schema | `packages/shared` as raw TS (`exports: ./src/index.ts`), zod 4.4.3 for payloads; `calls/{id}`, `households`, `waitlist`, `stats/waitlist` types + `CALL_STATES`/`CALL_TRANSITIONS`/`TACTICS` constants | D-05/06/07, FND-03; consumed by Vite directly and inlined into functions by esbuild `--alias` |
| Backend | Firebase Functions v2 (`firebase-functions` 7.4.0, `firebase-admin` 14.4.0), Node 22 runtime, `us-central1`, esbuild-bundled to `functions/lib/index.js` with `--packages=external --alias:@porchlight/shared=...` | D-01; bundling avoids the pnpm `workspace:` protocol that Cloud Build cannot resolve |
| Data layer | Firestore (Native, `nam5`); clients never write; Admin SDK in Functions is the only writer; `stats/waitlist.count` maintained by `onDocumentCreated` + `FieldValue.increment(1)` | D-06/D-10; one cheap listener for the counter; rules stay closed |
| Access control | `firestore.rules`: deny all; `match /stats/waitlist { allow get: if true }` | D-10; ASVS L1 V4 |
| Auth | None this phase (public landing). Phase 4 adds passkeys for family verification | D-10; no accounts needed for signups |
| Secrets | `defineSecret` for `ANTHROPIC_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `ELEVENLABS_API_KEY` (Secret Manager); `functions/.secret.local` + `apps/web/.env.local` gitignored; `.env.example` committed | D-04; only `VITE_FIREBASE_*` public config reaches the bundle |
| Deployment target | Firebase Hosting `<id>.web.app` + Functions + rules via root `pnpm run deploy` (`pnpm -r build && firebase deploy --only hosting,functions,firestore:rules`) | D-02/D-12; one command from a clean checkout; custom domain deferred |
| Attribution | `?ref=` -> `sessionStorage['porchlight:ref']` (default `direct`), sent with every signup; refs `li`, `reddit`, `fb`, `friends`, `qr`, `judges` | D-11 |
| Bundle discipline | `apps/web/src/lib/firebase.ts` reached only via dynamic `import()` from `WaitlistForm`/`LiveCounter` | RESEARCH Pattern 4: 76-90 kB gz first paint vs 211 kB eager; bad venue Wi-Fi |
| Local dev | `pnpm dev:web` against the live project; functions emulator only (`--only functions`); no Firestore emulator (no JDK 21 on the Mac) | RESEARCH Pitfall 2; the deploy is the test |
| Directory layout | `apps/web/src/{pages,components,components/ui,lib}`; `packages/shared/src/{calls,households,waitlist}.ts`; `functions/src/index.ts` | Claude's discretion; mirrors smash-tracker |

## Stack Touched in Phase 1

- [x] Project scaffold (pnpm workspace, Vite build, tsc typecheck; test runner deferred — `nyquist_validation` is off)
- [x] Routing — `/` landing, `/app` and `/stage` placeholders (pathname switch + Hosting SPA rewrite)
- [x] Database — real write (`joinWaitlist` -> `waitlist/{id}`, trigger -> `stats/waitlist`) AND real read (`onSnapshot` on `stats/waitlist`)
- [x] UI — waitlist form submit -> callable; counter ticks live across browsers
- [x] Deployment — `pnpm run deploy` to Firebase Hosting + Functions + rules; public URL

## Out of Scope (Deferred to Later Slices)

- Telephony (Twilio/ElevenLabs), Claude risk scoring, post-call report — Phase 2
- Lamp bridge (`bridge/`) and Pi controller (`pi/`) — Phase 3 (only READMEs exist)
- Family dashboard at `/app/*`, passkey verification, Firebase Auth — Phase 4
- Custom domain, email confirmation to signups, analytics beyond `?ref=` — deferred (CONTEXT Deferred Ideas)
- App Check / per-IP rate limiting on `joinWaitlist` — accepted risk tonight (D-10)
- Firestore emulator / JDK 21 install — optional later; deploy is the test tonight
- Counter idempotency on Eventarc retries — accepted (RESEARCH Pitfall 8); reconcile from `waitlist` size if asked

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: A simulated or real inbound call creates `calls/{id}`, transcript turns append inline, Claude Haiku scores risk and updates `risk` — same shared `CallDoc`, same Functions bundle, secrets already bound
- Phase 3: `bridge/` watches `calls/{id}` via Admin SDK and drives the Pi lamp (`pi/`) red/green over ethernet; `/stage` reuses `<Lamp color>`
- Phase 4: Family dashboard at `/app/*` with `onSnapshot` on `calls`, one-tap "No, that's not me" verification writing `verification` via a callable; passkeys via Firebase Auth
- Phase 5: Demo polish, traction slide reads `stats/waitlist.count` minus the recorded baseline
