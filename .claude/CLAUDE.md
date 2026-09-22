<!-- GSD:project-start source:PROJECT.md -->

## Project

**Porchlight**

Porchlight is a guardian for an aging parent's phone. An AI assistant answers unknown calls, detects scam scripts and cloned voices in real time, verifies real family members with one tap, and turns a lamp beside the phone red (scam) or green (verified family) so the senior never has to read an app. The family sees every screened call, transcript, and risk reason in a shared dashboard.

This repo is the 24-hour hackathon build for the yconic hackathon at RI Startup Week (Providence). The build is scoped to exactly what the 3-minute live demo needs, plus a landing page that collects real signups during the event.

**Core Value:** A scam call claiming to be family gets caught live on stage: the AI screens it, the real family member taps "No, that's not me", and the lamp turns red. If everything else fails, that one loop must work.

### Constraints

- **Timeline**: Demo 9PM Tue 2026-09-22; feature freeze 5PM; sleep 2-7AM is non-negotiable — a solo builder has to pitch well at hour 25.
- **Scope**: The demo script in `../PLAN.md` is the spec. Anything not visible in the 3-minute demo or on the traction slide is out.
- **Tech stack**: TypeScript + React 19 + Vite + Tailwind v4 + shadcn + Firebase (Firestore, Functions v2, Hosting) — fastest stack for this builder. Python 3.9-compatible code on the Pi, standard library + preinstalled `sense_hat` only (Pi cannot `pip install` without internet).
- **Models**: `claude-haiku-4-5` for in-call risk scoring (latency), `claude-sonnet-5` for the post-call family report.
- **Network**: Demo must survive bad venue Wi-Fi — Mac on phone hotspot as fallback; lamp is driven from the Mac over the ethernet cable, never over Wi-Fi.
- **Security**: API keys only in untracked env files / Firebase secrets. Twilio webhooks validated. No real senior's data; demo household only.
- **Ethics/consent**: Voice clone only of the builder or a judge who consents on stage; say so in the pitch.
- **Budget**: Small — Twilio upgrade (~$20, removes trial-call announcement), ElevenLabs Starter/Creator, Firebase Blaze (pennies at this volume), Claude API.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->

## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
