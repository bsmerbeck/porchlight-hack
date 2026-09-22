# Porchlight

A guardian for an aging parent's phone. An AI assistant answers unknown calls, catches scam
scripts and cloned voices live, verifies real family members with one tap, and turns a lamp
beside the phone red (scam) or green (verified family). Built in 24h for the yconic hackathon
at RI Startup Week.

## Layout

| Path              | What it is                                                          |
| ------------------ | -------------------------------------------------------------------- |
| `apps/web`        | Vite + React 19 + Tailwind v4 + shadcn landing page / dashboard app |
| `functions`       | Firebase Functions v2 (TypeScript, Node 22 runtime)                 |
| `packages/shared` | Shared Firestore schema + zod validators, imported by web and functions |
| `pi/`             | Raspberry Pi + Sense HAT lamp driver (Python 3.9, stdlib + `sense_hat` only) |
| `bridge/`         | Mac-side bridge: Firestore listener → HTTP POST to the Pi over ethernet |

## Prerequisites

- Node 24, pnpm 11
- `firebase-tools` 15, logged in (`firebase login`)
- JDK 21+ **only** if you want the Firestore emulator — not installed tonight; skip it and test
  against the live project instead (see Run below)

## Run

```bash
pnpm install
pnpm dev:web    # Vite dev server against the live Firebase project, via apps/web/.env.local
pnpm dev        # Vite + all emulators concurrently — needs JDK 21 for the Firestore emulator
firebase emulators:start --only functions   # callable smoke tests without Firestore emulator
```

## Build

```bash
pnpm -r build
```

## Deploy

```bash
pnpm run deploy       # builds every package, then firebase deploy --only hosting,functions,firestore:rules
pnpm deploy:web       # builds apps/web only, then firebase deploy --only hosting
```

> The script is named `deploy`, but `pnpm` has a builtin `deploy` subcommand — always invoke it
> as `pnpm run deploy`, never bare `pnpm deploy` for the root script (bare `pnpm deploy:web`
> works fine since `deploy:web` isn't a builtin name).

## Secrets

Functions read four vendor secrets via `defineSecret` (Secret Manager):

- `ANTHROPIC_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `ELEVENLABS_API_KEY`

Set a secret with:

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
```

Local emulator values go in `functions/.secret.local` (gitignored, never committed).

Web public config (`VITE_FIREBASE_*`) goes in `apps/web/.env.local` (gitignored), sourced from:

```bash
firebase apps:sdkconfig WEB
```

A committed `apps/web/.env.example` documents the required keys with no real values.

## Waitlist attribution

`?ref=` is captured from the URL on load and persisted to `sessionStorage`, then sent with the
signup. Planned values: `li`, `reddit`, `fb`, `friends`, `qr`, `judges`. Default: `direct`.

## Verify live

```bash
# joinWaitlist callable (envelope is {"data": {...}} per Firebase's callable HTTP format)
curl -s -X POST https://us-central1-<project-id>.cloudfunctions.net/joinWaitlist \
  -H 'Content-Type: application/json' \
  -d '{"data":{"email":"test+curl@example.com","protecting":"my mom","ref":"judges"}}'

# stats/waitlist REST read (public, single-doc get only — see firestore.rules)
curl -s "https://firestore.googleapis.com/v1/projects/<project-id>/databases/(default)/documents/stats/waitlist"
```

`<project-id>` is filled in once the Firebase project exists (Plan 03's human checkpoint).
