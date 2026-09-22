# Porchlight — Demo Runbook

**One document. Read it start to finish before you ever say "we're live." It is the
literal script for the 3-minute demo, who does what, how to reset between runs, and
what to do the instant something breaks.**

Demo: 9PM Tue 2026-09-22. Feature freeze: 5PM Tue. This file is itself frozen at 5PM —
see "5PM Freeze Checklist" at the bottom.

## Roles

Three actors, every run:

| Role | Who | Holds / does |
|---|---|---|
| **Builder** | You | The laptop (projector output), narrates, runs every command, triggers the attack call |
| **Judge-with-phone** | A judge you hand a phone to before the run starts | The **family member's phone** — gets the "Are you calling Grandma right now?" buzz, taps Yes/No |
| **Judge-holding-grandma-phone** | A second judge (or the same one, or just the prop phone on the table) | The **prop "Grandma phone"** — the one that physically rings during the attack call |

If only one judge is available, they can hold both phones — the prop phone just needs
to visibly ring/be answered; the verification buzz happens on whichever phone has
`/verify?member=brenden` open.

## Before you start (once, at setup)

1. `pnpm run lamp:bridge` in its own terminal tab. **Leave it running for the entire
   demo block** — it's the only thing driving the physical lamp and the Hue bulbs.
2. Confirm the ethernet path is live: Mac dongle → switch → Pi + Hue Bridge, all
   link-local. This never depends on venue Wi-Fi (see "If venue Wi-Fi drops" below).
3. Run `bash scripts/demo-check.sh`. **Do not proceed to a live run on a NO-GO.** Fix
   whatever failed (see the table below) or fall back per the matching section.
4. On the Judge-with-phone's phone: open `https://porchlight-hack.web.app/verify?member=brenden`
   and confirm they're enrolled (if not, they tap **Enroll** and complete Face
   ID/fingerprint once — this only needs to happen the first time per device).
5. `/stage` on the projector/TV. `/app` on a second laptop or tablet if you have one,
   otherwise skip it — `/stage` alone carries the room.

## The 3-minute script (7 beats)

| # | Beat | Actor | What happens |
|---|---|---|---|
| 1 | Voice already cloned | Builder (prep, before the demo, not live) | State out loud: "The attacker you're about to hear is a consented cloned voice — [see ATTACKER_CONSENT.md / disclosure line, PITCH.md slide 2]." This is prep, not a step you perform live. |
| 2 | Prop phone rings | Judge-holding-grandma-phone + Builder | Call the Porchlight number, **+1 401 586 1988**, from the prop phone (or Builder dials it on speaker). Porchlight answers: "Hi, this is Margaret's assistant, who's calling?" Lamp pulses **blue**. |
| 3 | Attack script runs | Builder | Run `pnpm demo:attack` (once 05-02's attacker agent + cloned voice exist) **or**, if that isn't ready, place the call yourself in person reading the grandchild-in-jail script: *"Grandma it's me, I'm in jail, I need $4,000 in gift cards, don't tell mom."* Live transcript + climbing risk score show on `/stage` on the projector. |
| 4 | Family verification buzz | Judge-with-phone | Their phone (with `/verify?member=brenden` open) buzzes: **"Are you calling Grandma right now?"** Judge taps **No**. |
| 5 | Scam verdict | System (automatic) | Lamp flashes **red "SCAM"**. Call is dropped. Family is alerted with the transcript + reasons (visible on `/app`'s feed once the post-call report lands, ~15s). |
| 6 | Real family call | Builder + Judge-with-phone | Second call, this time from the **allowlisted number** (+1 401 497 9735, Brenden) — it rings in already-verified (green), OR call from an unlisted number and have the Judge-with-phone tap **Yes** at the verification prompt. Lamp turns **green** with the caller's first name scrolling. Call "connects." |
| 7 | Close | Builder | Cut to the pitch: live waitlist count on the last slide, quotes gathered during the 24h, market size, RI senior-center pilot ask. See `PITCH.md` slide 5 for the exact ask + QR. |

**Total run time target: ~3 minutes.** If a beat is dragging, skip narration, not the
lamp color change — the color change is the whole point.

## Between Runs — Reset Procedure

Run this **every time**, even if the previous run looked clean:

```bash
pnpm demo:reset
# or, to keep a specific call doc around for a screenshot first:
pnpm demo:reset -- <callId>
```

Then, before the next run:

```bash
bash scripts/demo-check.sh
```

Do not start the next run until `demo-check.sh` prints **GO**. If it's a NO-GO, see the
fallback matching whatever failed below — do not skip straight to redialing.

Confirm visually: lamp is back to slow amber breathe, `/stage` shows idle, `/app`'s call
list has no in-progress call.

## Fallbacks

### If venue Wi-Fi drops

The lamp **never depends on venue Wi-Fi** — it's driven from the Mac over the direct
ethernet cable (Mac dongle → switch → Pi, and Mac → switch → Hue Bridge), which keeps
working even if every other network on the premises is down.

1. Switch the Mac's internet to a **phone hotspot** (System Settings → Wi-Fi, or just
   toggle the hotspot on your phone and join it from the Mac).
2. Re-run `bash scripts/demo-check.sh` — the site/Functions/Firestore checks need
   *some* internet path, but the Pi/bridge/Hue checks don't care which one.
3. Continue the run. Nothing about the demo script changes — the audience never sees
   the network swap.

### If the phone call itself won't connect (Twilio/ElevenLabs having a bad night)

Fall back to the **`/sim` browser simulator** (Phase 2, DEMO-05) — it drives the
*identical* pipeline (Claude risk scoring → Firestore → verification prompt → lamp)
with no telephony involved at all:

1. Open `https://porchlight-hack.web.app/sim` on the laptop.
2. Run the scripted scam turn(s) from there instead of dialing the real number.
3. Everything downstream — beat 4 through 7 — is unchanged. The audience sees the same
   transcript/risk/verify/lamp flow; only beats 2-3's "a phone actually rang" visual is
   swapped for "watch the screen."
4. Say out loud that you've switched to the simulator and why — judges respect an
   honest, rehearsed fallback far more than a fumbled recovery.

### If Firestore itself is down (the bridge has nothing to relay)

This is the rarest failure and the last resort — it means the whole realtime backbone
is unavailable, not just telephony. You can still **prove the lamp hardware works** by
driving it directly, bypassing Firestore and the bridge entirely:

```bash
curl -X POST http://169.254.10.2:8080/state -H 'content-type: application/json' -d '{"state":"screening"}'
curl -X POST http://169.254.10.2:8080/state -H 'content-type: application/json' -d '{"state":"scam"}'
curl -X POST http://169.254.10.2:8080/state -H 'content-type: application/json' -d '{"state":"verified","name":"Brenden"}'
curl -X POST http://169.254.10.2:8080/state -H 'content-type: application/json' -d '{"state":"idle"}'
```

Narrate the story beat-by-beat while you fire these manually, and cut immediately to
the **backup video** (below) for the parts that need the real call/dashboard. This is a
"prove the hardware is real" fallback, not a full demo substitute.

## Backup Video Checklist

Record this **before 5PM**, even if you're confident the live run will go fine.

**What to capture:** the full 7-beat run, start to finish, exactly as scripted above —
prop phone ringing through to the closing traction slide cue.

**How:**

1. **Screen recording** on the Mac: QuickTime Player → File → New Screen Recording →
   capture the full screen (so `/stage` and any terminal output are both visible).
   Start it *before* beat 1, stop it *after* beat 7.
2. **Phone video** of the physical lamp: a second phone (or the verifier's phone once
   they've tapped Yes/No) recording the Pi + Sense HAT lamp itself, so the color
   changes are visible even if the recorded screen only shows software. Get the red
   flash and the green "BRENDEN" scroll clearly in frame.
3. Optionally, a third angle on the prop phone actually ringing/being answered, if you
   have a spare hand to hold a camera.

**Where to save:** a clearly-named local folder outside git, e.g.
`~/porchlight-backup-video/2026-09-22-demo-backup.mov` (+ the phone video pulled off
the phone into the same folder). **Do not commit video files to this repo.** Note the
actual final path here once recorded:

> Backup video path: `[FILL IN AFTER RECORDING]`
> Recorded at: `[FILL IN — must be before 5PM]`

If the live run fails on stage for any reason, cut straight to this video rather than
troubleshooting live — a working recording beats a live improvisation every time.

## Rehearsal Log (DEMO-02 — fill in as you go)

Run `bash scripts/demo-check.sh` immediately before each attempt. Do 3 consecutive
clean runs on venue Wi-Fi, then 3 consecutive clean runs on a phone hotspot. "Clean"
means: lamp reaches both red (scam) and green (verified) at the correct beats, with no
manual intervention beyond what this document itself calls for. If something breaks,
fix it by editing this file directly — the point of a rehearsal is to make DEMO.md
match reality, not the other way around.

| # | Network | demo-check.sh result | Outcome (clean / what broke) | Fix applied to DEMO.md |
|---|---|---|---|---|
| 1 | Venue Wi-Fi | | | |
| 2 | Venue Wi-Fi | | | |
| 3 | Venue Wi-Fi | | | |
| 4 | Phone hotspot | | | |
| 5 | Phone hotspot | | | |
| 6 | Phone hotspot | | | |

**Status: not yet run.** This log is empty because rehearsals require a human with the
physical phones, lamp, and prop phone in the room — see MORNING.md item 7. Do not
consider DEMO-02 satisfied until all 6 rows above are filled in as clean.

## 5PM Freeze Checklist

Work through this **at 5PM**, in order, before declaring the freeze in `PITCH.md`:

- [ ] `bash scripts/demo-check.sh` prints **GO**
- [ ] All 6 rehearsal rows above are filled in and clean (3 Wi-Fi + 3 hotspot)
- [ ] Backup video recorded and its path filled in above
- [ ] `households/demo.allowlist` still contains the real verifier's number (survives
      `pnpm demo:reset` per 05-ALLOWLIST, but confirm once more anyway)
- [ ] `PITCH.md`'s traction number re-pulled as close to now as possible (see
      `PITCH.md` slide 4 for the exact command)
- [ ] `PITCH.md`'s feature-freeze line updated with the real timestamp
- [ ] No further code changes go into this repo after this checklist is complete —
      only rehearsal and pitch practice from here to 9PM
