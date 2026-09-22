---
phase: 05-attack-simulator-demo-hardening-and-pitch
plan: CLIPS
subsystem: infra
tags: [firebase-functions, elevenlabs, text-to-speech, demo-tooling, react]

# Dependency graph
requires:
  - phase: 05-attack-simulator-demo-hardening-and-pitch
    provides: "resetDemo/attackCall's DEMO_TOKEN timingSafeEqual gate pattern (05-01/05-02), reused verbatim by attackClips; ATTACKER_CONSENT.md's consented cloned voice, reused for TTS instead of the blocked conversational agent"
provides:
  - "attackClips onCall Function (DEMO_TOKEN-gated) -- resolves the consented 'Brenden' cloned voice via GET /v2/voices (cached), synthesizes the ATTACK_LINES script via ElevenLabs plain Text-to-Speech (cached per line), returns base64 MP3 clips without ever exposing the API key to the client"
  - "ATTACK_LINES fixture (packages/shared) -- the five-line grandchild-scam script used by the soundboard"
  - "Attacker soundboard on /sim -- per-line play buttons + a 'Play all (2s gaps)' button, both invoking attackClips via httpsCallable"
affects: [pitch-day runbook, rehearsal plans]

# Actuals (#2632)
actuals:
  tokens: 6109
  tasks: 4
  commits: 3
  plan_head_before: e77f382996a2765e0ba2b598dfa33608419d0cb7

tech-stack:
  added: []
  patterns:
    - "Voice discovery is dynamic (GET /v2/voices, matched by case-insensitive name substring 'brenden') rather than a hardcoded voice_id secret -- avoids a fourth ElevenLabs secret and self-heals if the voice is recreated, at the cost of one extra cached Firestore read on first use"
    - "Per-line TTS caching under demo/attackClips/lines/{index} (a subcollection, not fields on the parent doc) -- keeps each cached clip's base64 payload well under Firestore's 1 MiB document limit even though five clips combined could exceed it"
    - "Same DEMO_TOKEN timingSafeEqual gate function body duplicated per-file (matching attackCall.ts/resetDemo.ts's existing pattern), checked before any network call"

key-files:
  created:
    - functions/src/demo/attackClips.ts
    - functions/src/demo/attackClips.test.ts
  modified:
    - packages/shared/src/fixtures.ts
    - functions/src/index.ts
    - apps/web/src/pages/Sim.tsx

key-decisions:
  - "Built this as a full fallback (not a stopgap) per the dispatched objective: the ElevenLabs conversational 'Attacker' agent is blocked by vendor moderation ('Agent ... is unsafe', see 05-02-SUMMARY.md), so the demo now relies on pre-generated cloned-voice audio played through a soundboard instead of a live agent call."
  - "ATTACK_LINES is a distinct fixture from JAIL_SCRIPT (different wording: a police-station bail scenario, not jail) so the soundboard reads as its own five-line arc rather than reusing the exact scam script written for the conversational agent's system prompt (which is what triggered the moderation block in the first place)."
  - "Voice id resolution is dynamic (GET /v2/voices, cached) rather than a new hardcoded secret -- the existing ELEVENLABS_API_KEY secret is sufficient; no new secret was added."
  - "Cache keyed on exact fixture text match (cached.text === text) so editing an ATTACK_LINES entry automatically invalidates its cached clip rather than silently serving stale audio."

requirements-completed: [ATK-01]

coverage:
  - id: D1
    description: "attackClips onCall (DEMO_TOKEN-gated) resolves the consented cloned voice and returns base64 MP3 clips for the ATTACK_LINES script via plain ElevenLabs TTS, with per-line and voice-id caching in Firestore"
    requirement: "ATK-01"
    verification:
      - kind: unit
        ref: "functions/src/demo/attackClips.test.ts (7 tests: wrong/missing token never call fetch, voice discovery + caching + all-five generation, single-index cache hit with zero fetch calls, failed-precondition naming voices seen when no match, model fallback on a 4xx naming the model, verbatim moderation-style 4xx error)"
        status: pass
      - kind: integration
        ref: "live against deployed porchlight-hack: a standalone verification script POSTed {token, index:0} to the deployed attackClips callable, decoded audioBase64 to 12373 bytes starting with an ID3 header, and wrote it to /tmp/attack-0.mp3"
        status: pass
    human_judgment: false
  - id: D2
    description: "'Attacker soundboard (cloned voice)' section on /sim -- one button per line (fetches once, plays through the speaker) plus a 'Play all (2s gaps)' button and a note to hold the calling phone's mic near the speaker"
    verification:
      - kind: automated_ui
        ref: "pnpm --filter @porchlight/web typecheck && build (both pass); manual code review of the rendered JSX (five per-line buttons + Play all button + note)"
        status: pass
    human_judgment: true
    rationale: "Actual audio playback through a physical speaker, and whether it's audible/clear enough for a phone mic to pick up during the live pitch, requires a human to listen on the actual demo hardware -- this cannot be verified by a headless script."

duration: 12min
completed: 2026-09-22
status: complete
---

# Phase 5 Plan CLIPS: Attacker soundboard (cloned-voice TTS fallback) Summary

**`attackClips` onCall Function generates the five-line ATTACK_LINES script as cached base64 MP3 clips via plain ElevenLabs Text-to-Speech in the consented cloned voice, played back through a new "Attacker soundboard" on /sim -- working around the ElevenLabs conversational "Attacker" agent's vendor-side safety-moderation block discovered in 05-02.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-22T12:25:52-04:00
- **Completed:** 2026-09-22T12:37:22-04:00
- **Tasks:** 4 (voice discovery + attackClips onCall, /sim soundboard, live verify + deploy + tests)
- **Files modified:** 5

## Accomplishments
- `attackClips` onCall Function: DEMO_TOKEN-gated (identical timingSafeEqual pattern to `attackCall`/`resetDemo`), resolves the consented "Brenden" cloned voice via `GET /v2/voices` (case-insensitive name match, cached in `demo/attackClips.voiceId`), then synthesizes each of five `ATTACK_LINES` via `POST /v1/text-to-speech/{voiceId}` with `eleven_turbo_v2_5` (falling back to `eleven_multilingual_v2` on a 4xx that names the model), caching each clip's base64 under `demo/attackClips/lines/{index}` so TTS only ever runs once per line
- Moderation-style 4xx errors from TTS are surfaced verbatim in the callable error, so a human can see ElevenLabs' own error text if it ever blocks plain TTS too (it did not, in live testing)
- `ATTACK_LINES` fixture added to `packages/shared/src/fixtures.ts` -- a five-line grandchild-scam script, deliberately distinct wording from `JAIL_SCRIPT`
- New "Attacker soundboard (cloned voice)" section on `/sim`: one button per line (fetches once via `httpsCallable`, caches the resulting `HTMLAudioElement` in a ref, plays through the laptop speaker) plus a "Play all (2s gaps)" button that sequences all five with a 2-second pause, and a note to hold the calling phone's mic near the speaker; reuses the existing DEMO_TOKEN `localStorage` prompt from the attack-call button
- Deployed `attackClips` + hosting to `porchlight-hack`
- Live-verified: a standalone script POSTed `{token, index:0}` to the deployed `attackClips` callable and got back real synthesized audio -- **plain TTS is NOT blocked by ElevenLabs moderation**, only the conversational agent is. Decoded audio was 12,373 bytes, started with an ID3 header, and was written to `/tmp/attack-0.mp3`. The voice-discovery step also succeeded live: it found a voice matching "Brenden" in the account's voice list on the first real call.
- Ran `pnpm demo:reset` afterward to clear any test call docs and confirm the lamp is back to idle

## Task Commits

Each task was committed atomically:

1. **Task 1+2: attackClips onCall (voice discovery + TTS + caching)** - `d1c5093` (feat)
2. **Task 3: Attacker soundboard on /sim** - `7da6586` (feat)

_Task 4 (live verify + `pnpm demo:reset` + deploy) produced no new code changes beyond what Tasks 1-3 already committed -- see Issues Encountered / Next Phase Readiness for the live-verification results._

## Files Created/Modified
- `functions/src/demo/attackClips.ts` - DEMO_TOKEN-gated onCall; voice discovery + TTS synthesis + Firestore caching
- `functions/src/demo/attackClips.test.ts` - 7 unit tests (auth gate, voice discovery/caching, cache-hit, missing-voice error, model fallback, verbatim moderation error)
- `packages/shared/src/fixtures.ts` - added `ATTACK_LINES`
- `functions/src/index.ts` - exported `attackClips`
- `apps/web/src/pages/Sim.tsx` - "Attacker soundboard (cloned voice)" section (per-line buttons, "Play all" button, DEMO_TOKEN reuse)

## Decisions Made
- Chose dynamic voice discovery (`GET /v2/voices`, cached) over a new hardcoded voice-id secret -- self-heals if the clone is recreated in the dashboard, and avoids adding a fifth ElevenLabs secret when the existing `ELEVENLABS_API_KEY` is sufficient.
- Cached each line's clip under its own subcollection document (`demo/attackClips/lines/{index}`) rather than as fields on one parent doc, to stay well clear of Firestore's 1 MiB document size limit if all five clips are cached at once.
- Wrote `ATTACK_LINES` as a distinct fixture from `JAIL_SCRIPT` (different scenario wording -- police station, not jail) so the soundboard doesn't reuse the exact script that appears to have triggered the conversational agent's moderation block in 05-02.
- Cache correctness check compares the cached `text` field against the current fixture text, so editing `ATTACK_LINES` later automatically invalidates stale cached audio instead of silently serving mismatched clips.

## Deviations from Plan

None - executed per the dispatched objective (this prompt was itself the plan; no separate PLAN.md existed for this task).

## Issues Encountered

None. Plain ElevenLabs Text-to-Speech was not blocked by the vendor moderation that blocks the conversational "Attacker" agent (see 05-02-SUMMARY.md) -- the live-verification call against the deployed `attackClips` Function succeeded on the first attempt, resolving the "Brenden" voice and returning real synthesized audio.

## User Setup Required

None. The consented cloned voice used here is the same one already created for the (now-fallback) conversational agent in 05-02's human checkpoint (see `ATTACKER_CONSENT.md`) -- no new ElevenLabs dashboard configuration was needed.

## Next Phase Readiness

- The demo now has a working, verified attacker-voice fallback that does not depend on ElevenLabs' conversational-agent moderation review: `/sim`'s "Attacker soundboard" plays five cloned-voice lines through the laptop speaker, held up to the calling phone's mic, in place of the blocked live `attackCall` agent flow.
- Before the pitch, a human should do one live rehearsal: open `/sim`, click through all five soundboard buttons (or "Play all"), and confirm the audio is clear enough for the phone's mic to pick up and for the screening pipeline to react to it end-to-end.
- `functions/src/attack/attackCall.ts` (the original conversational-agent path) is left in place and undisturbed -- if ElevenLabs' agent-safety review ever clears the "Attacker" agent, both paths remain available.

---
*Phase: 05-attack-simulator-demo-hardening-and-pitch*
*Completed: 2026-09-22*

## Self-Check: PASSED

All created files confirmed present on disk (functions/src/demo/attackClips.ts,
functions/src/demo/attackClips.test.ts, this SUMMARY.md). Both task commits (d1c5093,
7da6586) confirmed present in `git log`. Live verification against deployed
`porchlight-hack` confirmed real synthesized audio (12373 bytes, ID3 header) at
`/tmp/attack-0.mp3`.
