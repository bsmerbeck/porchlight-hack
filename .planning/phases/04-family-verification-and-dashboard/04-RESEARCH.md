# Phase 4: Family Verification and Dashboard - Research

**Researched:** 2026-09-21
**Domain:** WebAuthn passkeys without Firebase Auth, Firestore-mirror realtime UX, dashboard/stage views
**Confidence:** MEDIUM (core WebAuthn API surface HIGH/CITED; UX/quirk claims MEDIUM; several architectural choices are this document's own recommendation, not a verified fact)

## Summary

Phase 4 has no Firebase Auth, so every verification primitive has to be built from three ingredients the repo already has: `@simplewebauthn/{server,browser}` for the passkey ceremony, the Firestore-mirror pattern Phase 3 establishes (`onDocumentWritten('calls/{id}')` → narrow public-read docs), and the `onCall` Function style already used by `joinWaitlist`/`forceVerdict`. The existing `households/demo.members[].passkeyCredentialIds: string[]` field **cannot** support real WebAuthn verification — it stores only credential IDs, not the public key or signature counter `verifyAuthenticationResponse` needs — so this phase's first real task is a schema extension, not just new Functions. The realtime prompt and dashboard both reuse Phase 3's mirror-Function shape: one `onDocumentWritten` trigger on `calls/{id}` writes `lamp/current` (Phase 3), `prompts/{memberId}` (this phase, VER-02), and `households/demo/feed/{callId}` (this phase, DASH-01/02) — three narrow public-read docs instead of opening `calls/{id}` itself.

**Primary recommendation:** Extend the household schema with a `passkeys: PasskeyCredential[]` array (id/publicKey/counter/transports), add four `onCall` Functions (`startPasskeyRegistration`/`finishPasskeyRegistration`/`startPasskeyAuthentication`/`answerVerification`), extend Phase 3's mirror Function to also write `prompts/{memberId}` and `households/demo/feed/{callId}`, and drive `verifying` state for all manual testing via the already-working `/sim` page (its `JAIL_SCRIPT[0]` — `"Hi grandma, it's me, Brenden."` — already triggers `state:'verifying'` through the existing `runTurn`/`matchIdentity` path with zero new code).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Passkey registration ceremony (challenge, options) | API/Backend (`onCall`) | Browser (`startRegistration`) | Challenge must be generated and verified server-side; browser only relays the WebAuthn ceremony |
| Passkey assertion verification | API/Backend (`onCall`) | Browser (`startAuthentication`) | Same split — server owns `expectedChallenge`/`expectedOrigin`/counter bookkeeping |
| Realtime "are you calling now?" prompt | Database/Storage (`prompts/{memberId}` mirror doc) | Browser (`onSnapshot` + full-screen modal) | Client cannot read `calls/{id}` (rules deny-all); a narrow mirror doc is the only channel |
| Verdict application (verified/scam) | API/Backend (`onCall answerVerification` → Phase 2's `releaseCall`/`forceEndCall`) | — | Same trust tier as Phase 2's `forceVerdict`; this phase's callable becomes the real caller of that logic |
| Live dashboard view | Database/Storage (`households/demo/feed/{callId}` mirror) | Browser (`onSnapshot` list) | Same reasoning as the prompt doc — `calls/{id}` stays closed |
| Stage view | Browser (React) | — | Pure presentation over the same feed doc(s); no new backend surface |
| Signed-link fallback (VER-05) | API/Backend (HMAC verify) | Browser (Yes/No buttons, no WebAuthn) | Removes the browser-tier WebAuthn dependency entirely when the timebox is blown |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VER-01 | Family member enrolls a device by creating a passkey tied to household identity | `startPasskeyRegistration`/`finishPasskeyRegistration` pattern below; schema extension for `passkeys[]` |
| VER-02 | Enrolled device shows a full-screen Yes/No prompt within ~2s | `prompts/{memberId}` mirror doc + `onSnapshot` modal pattern |
| VER-03 | "Yes" requires a passkey assertion; success marks `verified` | `startPasskeyAuthentication`/`answerVerification` pattern; `verifyAuthenticationResponse` code example |
| VER-04 | "No" or 20s timeout marks `scam`, ends call, alerts household | Client-side countdown + `answerVerification({answer:'no'|'timeout'})` → `forceEndCall` |
| VER-05 | Signed single-use link fallback if WebAuthn overruns 2h timebox | HMAC-token-in-mirror-doc design, same UI, no WebAuthn dependency |
| DASH-01 | Live transcript, risk meter, tactics, claimed identity, state | `households/demo/feed/{callId}` mirror doc, full `CallDoc` shape, `onSnapshot` |
| DASH-02 | Call history with outcome badges, opens transcript + report | Same feed collection, ordered by `startedAt`; `outcome` → badge mapping |
| DASH-03 | Projector-friendly stage view | `/stage` page pattern (skeleton already exists), same feed doc, CSS-only meter |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@simplewebauthn/server` | 14.0.2 `[VERIFIED: npm registry]` | Registration/authentication options + verification (Functions side) | The de facto Node WebAuthn library; canonical repo `github.com/MasterKale/SimpleWebAuthn`, 3.3M weekly downloads `[VERIFIED: npm registry]` |
| `@simplewebauthn/browser` | 14.0.0 `[VERIFIED: npm registry]` | `startRegistration`/`startAuthentication` browser ceremony helpers | Same project, browser half; 3.5M weekly downloads `[VERIFIED: npm registry]` |

Package names discovered via WebSearch/training data, not an authoritative source — tagged `[ASSUMED]` for the *name itself* per the provenance rule even though registry existence is `[VERIFIED]`. Both are exactly the packages named in this phase's own task brief and match the canonical `simplewebauthn.dev` documentation domain, which is strong corroboration.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `firebase-functions` | 7.4.0 (already installed) | `onCall`/`onDocumentWritten` for all new Functions | Already the project's pattern (`joinWaitlist`, Phase 3's mirror Function) |
| `firebase-admin` | 14.4.0 (already installed) | Firestore reads/writes with Admin SDK, bypassing rules | Same as every other Function in this repo |
| `firebase` (web) | 12.15.0 (already pinned in `apps/web/package.json:8` `[VERIFIED: apps/web/package.json:8]` `"firebase": "12.15.0"`) | `onSnapshot`, `httpsCallable` from the dashboard/prompt pages | Do not bump to the registry's current 12.19.0 `[VERIFIED: npm registry]` — Phase 3's own research note says pin to the monorepo's existing version, not `latest` |
| Node `crypto` (`createHmac`) | stdlib | VER-05 signed-link token | No package needed — built into Node 22 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@simplewebauthn/*` | `webauthn-json` / hand-rolled `navigator.credentials.*` | Hand-rolling ASN.1/COSE key parsing for attestation verification in a 4h window is exactly the kind of complexity `@simplewebauthn/server` exists to absorb — do not hand-roll (see below) |
| Mirror-doc realtime prompt | `calls/{id}` made partially public via field-level security rules | Firestore rules don't support field-level read restriction on a single document (only per-collection/document `allow get`) — a narrower mirror doc is the only closed-rules-compatible option |
| Firestore-mirror dashboard | A polling `onCall` Function the dashboard calls every N seconds | `onSnapshot` is free (already the project's pattern everywhere else) and lower latency; polling adds Function invocation cost and code with no benefit here |

**Installation:**
```bash
pnpm --filter functions add @simplewebauthn/server@14.0.2
pnpm --filter web add @simplewebauthn/browser@14.0.0
```

**Version verification:** confirmed via `npm view @simplewebauthn/server version` → `14.0.2`, `npm view @simplewebauthn/browser version` → `14.0.0` (2026-09-21). `engines.node` for `@simplewebauthn/server` is `>=20.0.0` `[VERIFIED: npm registry]` — compatible with the project's Node 22 Functions runtime (`functions/package.json:7` `"node": "22"`).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|-------------|
| `@simplewebauthn/server` | npm | v14.0.2 published 2026-09-13 (project itself is ~6 years old) | 3.38M/wk | `github.com/MasterKale/SimpleWebAuthn` | SUS (reason: `too-new`) | Flagged — planner must add `checkpoint:human-verify` |
| `@simplewebauthn/browser` | npm | v14.0.0 published 2026-09-02 | 3.49M/wk | `github.com/MasterKale/SimpleWebAuthn` | SUS (reason: `too-new`) | Flagged — planner must add `checkpoint:human-verify` |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `@simplewebauthn/server`, `@simplewebauthn/browser` — both flagged purely because their *most recent version* was published within the automated heuristic's "too new" window, not because the project itself is new. The 3.3-3.5M/week download counts and the canonical `MasterKale/SimpleWebAuthn` repository (the reference implementation cited by `simplewebauthn.dev`, the official docs site this research cites throughout) are strong signals this is the legitimate, long-established library, not a slopsquat. Per protocol the planner must still gate the `pnpm add` behind a `checkpoint:human-verify` task — a one-line "confirm `npm view @simplewebauthn/server repository.url` still points to MasterKale/SimpleWebAuthn before installing" check is sufficient given the above.

`twilio` (used by Phase 2's `endCall.ts`, which this phase calls into) was already audited in `02-RESEARCH.md`; no new audit needed here.

## Architecture Patterns

### System Architecture Diagram

```
Caller says "it's Brenden" ──▶ runTurn() (Phase 2, existing) ──▶ calls/{id}
                                                                  state: 'verifying'
                                                                  verification: {memberId, promptedAt}
                                                                        │
                                                          onDocumentWritten('calls/{id}')
                                                        (extends Phase 3's mirror Function)
                                                                        │
                        ┌───────────────────────────────┬─────────────┴──────────────┐
                        ▼                                ▼                            ▼
                  lamp/current                    prompts/{memberId}         households/demo/feed/{callId}
                  (Phase 3, unchanged)             {callId, state:'verifying',   (full CallDoc mirror:
                                                     claimedIdentity, promptedAt,  turns, risk, verification,
                                                     token}                       outcome, report)
                        │                                │                            │
                        ▼                                ▼                            ▼
                  Pi lamp (bridge)          Family phone /app: onSnapshot     Dashboard /app + /stage:
                                            → full-screen Yes/No modal        onSnapshot(list) → live call +
                                            (armed audio + vibrate)           history with outcome badges
                                                        │
                                    Yes → startPasskeyAuthentication → WebAuthn ceremony
                                    No / 20s timeout → skip ceremony
                                                        │
                                                        ▼
                                    answerVerification({callId, memberId, answer, response?})
                                    (onCall) — verifies passkey assertion if answer==='yes',
                                    then calls Phase 2's releaseCall() / forceEndCall()
                                                        │
                                                        ▼
                                          calls/{id}.state = 'verified' | 'scam'
                                          (loops back to the mirror Function above)
```

A reader can trace the whole loop: caller claim → `verifying` write → mirror fan-out → phone prompt → passkey ceremony (or fallback) → `answerVerification` → verdict write → mirror fan-out again (lamp turns green/red, dashboard updates, prompt doc clears).

### Recommended Project Structure
```
functions/src/
├── verification/
│   ├── webauthn.ts          # rpID/origin constants, generate*/verify* wrappers
│   ├── passkeyRegistration.ts   # startPasskeyRegistration, finishPasskeyRegistration (onCall)
│   ├── passkeyAuthentication.ts # startPasskeyAuthentication, answerVerification (onCall)
│   ├── verifyLink.ts        # VER-05 HMAC token mint/check helpers
│   └── mirror.ts            # extends/co-locates with Phase 3's lamp.ts mirror trigger
apps/web/src/
├── pages/
│   ├── Verify.tsx           # /verify/:callId — full-screen Yes/No + passkey ceremony
│   ├── Dashboard.tsx        # /app — live call + history (replaces AppPlaceholder)
│   └── Stage.tsx            # /stage — fills in the existing skeleton
├── lib/
│   ├── webauthn.ts          # thin startRegistration/startAuthentication wrapper
│   └── memberSession.ts     # localStorage memberId pairing (see Pitfall: no auth)
```

### Pattern 1: Registration ceremony (VER-01)
**What:** Two `onCall` Functions bracket the browser's `startRegistration()` call.
**When to use:** Once per family member, on the phone that will be handed to a judge.
**Example (server side, adapted from official docs):**
```typescript
// Source: https://simplewebauthn.dev/docs/packages/server [CITED]
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers'; // [CITED: simplewebauthn.dev search result]
import { randomUUID } from 'crypto';

const rpID = 'porchlight-hack.web.app';
const origin = `https://${rpID}`;

export const startPasskeyRegistration = onCall({ region: REGION }, async (req) => {
  const { memberId } = req.data as { memberId: string };
  const household = await getFirestore().doc('households/demo').get();
  const member = household.data()?.members.find((m: any) => m.id === memberId);
  const options = await generateRegistrationOptions({
    rpName: 'Porchlight',
    rpID,
    userName: member.name,
    userID: isoUint8Array.fromUTF8String(randomUUID()),
    attestationType: 'none',
    excludeCredentials: (member.passkeys ?? []).map((p: any) => ({ id: p.id, transports: p.transports })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
  await getFirestore().doc(`webauthnChallenges/${memberId}`).set({
    challenge: options.challenge,
    expiresAt: Date.now() + 5 * 60_000, // 5 min TTL, checked (not enforced by Firestore itself) in finish*
  });
  return options;
});
```
```typescript
export const finishPasskeyRegistration = onCall({ region: REGION }, async (req) => {
  const { memberId, response } = req.data as { memberId: string; response: unknown };
  const challengeDoc = await getFirestore().doc(`webauthnChallenges/${memberId}`).get();
  if (!challengeDoc.exists || challengeDoc.data()!.expiresAt < Date.now()) {
    throw new HttpsError('deadline-exceeded', 'Registration challenge expired, retry');
  }
  const verification = await verifyRegistrationResponse({
    response: response as any,
    expectedChallenge: challengeDoc.data()!.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new HttpsError('permission-denied', 'Passkey registration failed');
  }
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const passkey = {
    id: credential.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
  };
  // arrayUnion onto households/demo.members[memberId].passkeys — see schema extension below
  await getFirestore().doc('households/demo').update({
    members: /* read-modify-write member array with the new passkey appended */,
  });
  await challengeDoc.ref.delete();
  return { ok: true };
});
```
**Source:** [CITED: simplewebauthn.dev/docs/packages/server] for `generateRegistrationOptions`/`verifyRegistrationResponse` shapes; the Firestore wiring around them is this research's own design, not from the docs.

### Pattern 2: Authentication ceremony + verdict (VER-03/04)
**What:** `startPasskeyAuthentication` scopes `allowCredentials` to the specific member being prompted (no discoverable-credential/usernameless flow needed — the phone always knows which member it is, see Pitfall below).
```typescript
// Source: https://simplewebauthn.dev/docs/packages/server [CITED]
export const startPasskeyAuthentication = onCall({ region: REGION }, async (req) => {
  const { memberId } = req.data as { memberId: string };
  const member = /* look up households/demo.members[memberId] */;
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: member.passkeys.map((p: any) => ({ id: p.id, transports: p.transports })),
    userVerification: 'preferred',
  });
  await getFirestore().doc(`webauthnChallenges/${memberId}`).set({ challenge: options.challenge, expiresAt: Date.now() + 60_000 });
  return options;
});

export const answerVerification = onCall({ region: REGION }, async (req) => {
  const { callId, memberId, answer, response, token } = req.data as {
    callId: string; memberId: string; answer: 'yes' | 'no' | 'timeout'; response?: unknown; token?: string;
  };
  if (answer !== 'yes') {
    await getFirestore().doc(`calls/${callId}`).update({
      'verification.answer': answer, 'verification.answeredAt': Date.now(), 'verification.method': token ? 'link' : 'passkey',
    });
    await forceEndCallForVerdict(callId, 'scam'); // reuse Phase 2's endCall.ts logic (see Pitfall 2)
    return { verified: false };
  }
  if (token) {
    // VER-05 fallback path — no WebAuthn ceremony, just HMAC check (see verifyLink.ts)
    if (!checkVerifyToken(callId, memberId, token)) throw new HttpsError('permission-denied', 'Bad or expired link');
  } else {
    const challengeDoc = await getFirestore().doc(`webauthnChallenges/${memberId}`).get();
    const member = /* look up member + matching passkey by response.id */;
    const verification = await verifyAuthenticationResponse({
      response: response as any,
      expectedChallenge: challengeDoc.data()!.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: member.passkey.id,
        publicKey: isoBase64URL.toBuffer(member.passkey.publicKey), // [ASSUMED: exact reverse-of-fromBuffer method name; verify against installed types at build time]
        counter: member.passkey.counter,
        transports: member.passkey.transports,
      },
    });
    if (!verification.verified) throw new HttpsError('permission-denied', 'Passkey assertion failed');
    // persist verification.authenticationInfo.newCounter back onto the member's stored passkey — required to detect cloned authenticators
  }
  await getFirestore().doc(`calls/${callId}`).update({
    'verification.answer': 'yes', 'verification.answeredAt': Date.now(), 'verification.method': token ? 'link' : 'passkey',
  });
  await releaseCallForVerdict(callId); // reuse Phase 2's endCall.ts releaseCall()
  return { verified: true };
});
```
**Source:** [CITED: simplewebauthn.dev/docs/packages/server] for the verification calls; `answerVerification`'s branching and its call into Phase 2's `releaseCall`/`forceEndCall` is this research's design, matching the "thin adapter calls into one shared core" pattern Phase 2's `02-01-SUMMARY.md` already established for `runTurn`.

### Pattern 3: Realtime prompt mirror (VER-02) — extends Phase 3's mirror Function
```typescript
// Design pattern, not from official docs — extends the same onDocumentWritten trigger
// Phase 3's 03-02-PLAN.md describes for lamp/current (functions/src/lamp.ts).
export const mirrorActiveCallToLamp = onDocumentWritten('calls/{callId}', async (event) => {
  const after = event.data?.after.data();
  // ...existing lamp/current write (Phase 3)...
  if (after?.state === 'verifying' && after.verification?.memberId) {
    await getFirestore().doc(`prompts/${after.verification.memberId}`).set({
      callId: event.params.callId,
      state: 'verifying',
      claimedIdentity: after.risk?.claimedIdentity ?? null,
      promptedAt: after.verification.promptedAt,
      token: mintVerifyToken(event.params.callId, after.verification.memberId), // VER-05, cheap to always mint
    });
  } else if (after && ['verified', 'scam', 'ended'].includes(after.state) && after.verification?.memberId) {
    await getFirestore().doc(`prompts/${after.verification.memberId}`).set({ state: 'none' });
  }
  if (after) {
    await getFirestore().doc(`households/${after.householdId}/feed/${event.params.callId}`).set(after);
  }
});
```
**Firestore rules addition** (append inside the existing `match /databases/{database}/documents` block in `firestore.rules` — current file only has `stats/waitlist` and deny-all `[VERIFIED: firestore.rules:1-13]` `match /stats/waitlist { allow get: if true; }` / `match /{document=**} { allow read, write: if false; }`):
```
match /prompts/{memberId} { allow get: if true; allow write: if false; }
match /households/{householdId}/feed/{callId} { allow get: if true; allow list: if true; allow write: if false; }
```
Note: Phase 3 will add its own `lamp/current` rule in the same file; this phase adds exactly these two more, nothing else.

### Client-side prompt modal
```typescript
// Autoplay/vibrate pattern — see Pitfalls below for browser support caveats
function ArmedVerifyPrompt({ memberId }: { memberId: string }) {
  const [armed, setArmed] = useState(false);
  const [prompt, setPrompt] = useState<PromptDoc | null>(null);
  useEffect(() => {
    return onSnapshot(doc(db, 'prompts', memberId), (snap) => setPrompt(snap.data() as PromptDoc));
  }, [memberId]);

  if (!armed) return <button onClick={() => setArmed(true)}>Enable alerts</button>; // user gesture unlocks audio
  if (prompt?.state !== 'verifying') return null;

  // full-screen modal with 20s countdown, calling answerVerification('no'|'timeout') on expiry
}
```

### Anti-Patterns to Avoid
- **Opening `calls/{id}` to public reads for convenience:** defeats Phase 1's deny-all rules design (D-10); use the mirror pattern instead, every time.
- **Storing `publicKey` as a raw `Uint8Array` in Firestore:** Firestore's JS SDK Admin write path accepts `Buffer`/`Bytes`, but round-tripping through JSON (as every `onCall` payload does) turns a `Uint8Array` into `{0: 1, 1: 2, ...}` — always base64-encode before persisting and decode before verifying.
- **Using `generateAuthenticationOptions` with an empty `allowCredentials` (usernameless/discoverable flow):** unnecessary here — the phone already knows which member it is (paired via `localStorage`, see Pitfall below), so scope `allowCredentials` to that member's stored passkeys for a faster, more reliable ceremony `[CITED: simplewebauthn.dev discoverable-credentials guidance]`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| WebAuthn attestation/assertion cryptographic verification | Custom COSE key parsing, CBOR decoding, signature checks | `@simplewebauthn/server` | This is exactly the complexity class (ASN.1, COSE, CBOR, per-authenticator quirks) that causes rewrites; a 4h window cannot absorb a bug here |
| SSE/streaming framing | N/A (not this phase — noted for context; Phase 2 already built `sse.ts`) | — | — |
| HMAC token verification | A JWT library | Node's built-in `crypto.createHmac('sha256', secret).update(...).digest('base64url')` | A single-use, short-lived, single-purpose token doesn't need JWT's claim/expiry machinery — plain HMAC + an explicit `exp` field is less code and equally secure for this scope |
| Countdown timer UI | A timer library | `setTimeout`/`setInterval` + React state | Trivial; a dependency would be pure overhead in a 4h build |

**Key insight:** The one piece of real cryptographic complexity in this phase is WebAuthn verification — everything else (HMAC tokens, mirror docs, countdown timers) is plain platform code. Spend the research/debugging budget on the WebAuthn integration, not on the surrounding plumbing.

## Common Pitfalls

### Pitfall 1: Existing `passkeyCredentialIds: string[]` schema cannot support real verification
**What goes wrong:** `verifyAuthenticationResponse` requires the stored `publicKey` and `counter` for the specific credential being asserted — a list of ID strings alone provides nothing to verify against.
**Why it happens:** The field was named in Phase 1 (`01-CONTEXT.md` D-06) before Phase 4's actual verification mechanics were researched; `[VERIFIED: packages/shared/src/households.ts:1-7]` `passkeyCredentialIds: string[]` and `[VERIFIED: functions/src/screening/runTurn.ts:60-66]` (the demo-household auto-seed) confirm the current shape has no publicKey/counter fields anywhere.
**How to avoid:** Add a new `passkeys: PasskeyCredential[]` field to `HouseholdMember` (`{id, publicKey, counter, transports, deviceType, backedUp}`), and either drop `passkeyCredentialIds` entirely or leave it as an unused legacy field — do not try to overload the existing string array.
**Warning signs:** Any code that tries to call `verifyAuthenticationResponse` using only `passkeyCredentialIds` will type-error or silently verify against garbage — catch this at the schema level, not at runtime.

### Pitfall 2: `forceVerdict`/`releaseCall`/`forceEndCall` are *planned*, not yet in the repo
**What goes wrong:** This research's design assumes `answerVerification` calls into Phase 2's `endCall.ts` (`releaseCall`, `forceEndCall`) — but as of this research session, `functions/src/screening/endCall.ts` does not exist yet; only `02-01`'s `runTurn.ts`/`simulateTurn.ts` are built `[VERIFIED: directory listing of functions/src/screening/ shows no endCall.ts, elevenlabsCustomLlm.ts, or lamp.ts as of 2026-09-21]`.
**Why it happens:** Phase 2 Plan 02 and Phase 3 Plan 02 (which create these files) are documented in this repo's `.planning/phases/` but had not executed at research time; the roadmap's stated execution order (1→2→3→4) means they should exist by the time Phase 4 executes.
**How to avoid:** The Phase 4 plan must explicitly depend on `endCall.ts` existing (with exactly the exported names `releaseCall(callId)` / `forceEndCall(callSid, sayLine)` per `02-02-PLAN.md`'s task text) and fail fast/loud if it doesn't — do not silently reimplement the Twilio hangup logic a second time.
**Warning signs:** A missing-module build error on `import { releaseCall } from '../screening/endCall.js'` means Phase 2 Plan 02 hasn't landed yet; check `.planning/STATE.md` and the phase's actual completed plans before starting Phase 4 execution.

### Pitfall 3: rpID/origin mismatch breaks every ceremony silently
**What goes wrong:** WebAuthn requires `expectedRPID` to exactly equal (or be a registrable superdomain of) the page's actual origin hostname — `porchlight-hack.web.app` `[VERIFIED: .firebaserc:3]` `"default": "porchlight-hack"` (so the Hosting default domain is `porchlight-hack.web.app`).
**Why it happens:** `localhost` gets a special-cased exception (`rpID: 'localhost'` works over plain `http://localhost` `[CITED: web.dev/articles/webauthn-rp-id]`), which means a ceremony that works perfectly in local dev can fail entirely once deployed if `rpID` isn't switched.
**How to avoid:** Hard-code `rpID = 'porchlight-hack.web.app'` / `origin = 'https://porchlight-hack.web.app'` as the only values used in Functions — do not derive them from `req.headers.origin` (that's attacker-controlled input) and do not leave a `localhost` fallback wired into the deployed path. Passkey enrollment/testing **must** happen against the deployed site on a real phone, not the local dev server (see Environment Availability).
**Warning signs:** `NotAllowedError` or a silent ceremony abort in the browser almost always means an rpID/origin mismatch, not a code bug.

### Pitfall 4: `navigator.vibrate` is unreliable on iOS Safari
**What goes wrong:** Vibration on tap-triggered alerts may silently no-op on the judge's iPhone.
**Why it happens:** Safari on iOS has historically not implemented the Vibration API at all; a very recent (2026) compat-data report claims it may now work in some iOS Safari version, but this is unconfirmed and inconsistent `[CITED: github.com/mdn/browser-compat-data#29166, developer.mozilla.org/.../Navigator/vibrate]`.
**How to avoid:** Treat vibration as a nice-to-have enhancement layered on top of the full-screen modal + audio ping, never the primary alert channel; wrap the call in `if ('vibrate' in navigator) navigator.vibrate(...)` and don't block anything on its success.
**Warning signs:** A test on an Android Chrome phone shows vibration and audio; the identical code on an iPhone shows only the modal + audio — this is expected, not a bug.

### Pitfall 5: Autoplay policy blocks the audio ping without a prior user gesture
**What goes wrong:** `new Audio(...).play()` called from the `onSnapshot` callback (no user gesture in that call stack) rejects/no-ops on both Chrome and Safari.
**Why it happens:** Both browsers require a user gesture to unlock audio playback / `AudioContext` `[CITED: developer.chrome.com/blog/autoplay, chromium.org/audio-video/autoplay]`.
**How to avoid:** Require an explicit "Enable alerts" / "Arm this phone" button on page load (a real click), and either play a near-silent `Audio` element once immediately inside that click handler (unlocking future `.play()` calls on most browsers) or call `AudioContext.resume()` inside the click handler — then trigger the real ping from the `onSnapshot` listener afterward.
**Warning signs:** Silent failures are the norm here — the `.play()` promise rejects with `NotAllowedError`; always `.catch()` it and fall back to the visual modal alone.

### Pitfall 6: iOS always creates resident (discoverable) keys; Android does not
**What goes wrong:** Relying on `residentKey: 'discouraged'` behaving identically across platforms.
**Why it happens:** "iOS always creates resident keys regardless of what the server requests, while Android requires explicit opt-in" `[CITED: WebSearch summary of Corbado/web.dev guidance on discoverable credentials]`.
**How to avoid:** Set `residentKey: 'preferred'` (not `'required'` or `'discouraged'`) — this is the documented middle ground that works acceptably on both platforms and is unaffected by the platform-level behavior difference, since this phase always scopes `allowCredentials` explicitly anyway (see Anti-Patterns) and doesn't rely on discoverable-credential usernameless login.
**Warning signs:** None specific to this project since `allowCredentials` scoping sidesteps the issue — documented here so the plan doesn't accidentally switch to a usernameless flow under time pressure.

### Pitfall 7: No Firebase Auth means "which member is this phone?" must be solved out-of-band
**What goes wrong:** `prompts/{memberId}` and the passkey calls all need a `memberId` — nothing in the stack provides one automatically.
**Why it happens:** There is deliberately no Firebase Auth in this project (per the phase brief); WebAuthn's `userHandle` could theoretically fill this role, but that requires the discoverable-credential/usernameless flow this research recommends avoiding (Pitfall 6/Anti-Patterns).
**How to avoid:** After a successful `finishPasskeyRegistration`, store `memberId` in `localStorage` on that phone (this design decision is this research's own recommendation — `[ASSUMED]`, not from any doc). Every subsequent page load on `/verify` or `/app` reads that value to know which `prompts/{memberId}` doc to subscribe to and which member to pass to `startPasskeyAuthentication`. This is a single-demo-household hack, not a production identity system — flag it explicitly as a discretion item for user confirmation.
**Warning signs:** If the builder's phone is reset/cleared between rehearsals, `localStorage` is wiped and the phone "forgets" its member pairing — re-run enrollment or seed the value via a query param on first load as a recovery path.

## Code Examples

### Full-screen Yes/No modal shell (VER-02/03/04)
```tsx
// Design pattern — not from official docs. Matches the shadcn/Tailwind conventions
// already used in apps/web/src/pages/Sim.tsx.
function VerifyModal({ prompt, memberId }: { prompt: PromptDoc; memberId: string }) {
  const [secondsLeft, setSecondsLeft] = useState(20);
  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [prompt.callId]);
  useEffect(() => {
    if (secondsLeft <= 0) void answer('timeout');
  }, [secondsLeft]);

  async function answer(a: 'yes' | 'no' | 'timeout') {
    if (a === 'yes') {
      const { fns } = await import('@/lib/firebase');
      const { httpsCallable } = await import('firebase/functions');
      const { startAuthentication } = await import('@simplewebauthn/browser');
      const startFn = httpsCallable(fns, 'startPasskeyAuthentication');
      const { data: optionsJSON } = await startFn({ memberId });
      const response = await startAuthentication({ optionsJSON: optionsJSON as any });
      await httpsCallable(fns, 'answerVerification')({ callId: prompt.callId, memberId, answer: 'yes', response });
    } else {
      await httpsCallable(fns, 'answerVerification')({ callId: prompt.callId, memberId, answer: a });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/95 p-6 text-center text-white">
      <p className="text-2xl">Is {prompt.claimedIdentity ?? 'someone'} calling Grandma right now?</p>
      <p className="text-sm opacity-70">{secondsLeft}s</p>
      <div className="flex gap-4">
        <button onClick={() => void answer('yes')} className="rounded bg-green-600 px-8 py-4 text-xl">Yes</button>
        <button onClick={() => void answer('no')} className="rounded bg-red-600 px-8 py-4 text-xl">No</button>
      </div>
    </div>
  );
}
```

### VER-05 HMAC token (fallback, no WebAuthn dependency)
```typescript
// Node stdlib — no official-docs source needed, this is a standard pattern.
import { createHmac, timingSafeEqual } from 'crypto';

function mintVerifyToken(callId: string, memberId: string): string {
  return createHmac('sha256', verifyLinkSecret.value()).update(`${callId}:${memberId}`).digest('base64url');
}
function checkVerifyToken(callId: string, memberId: string, token: string): boolean {
  const expected = Buffer.from(mintVerifyToken(callId, memberId));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
```
Requires a new secret: `firebase functions:secrets:set VERIFY_LINK_SECRET` (human checkpoint, same pattern as the four existing secrets in `functions/src/secrets.ts`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| `@simplewebauthn/server` `authenticator: {credentialID, credentialPublicKey, counter}` param shape | `credential: {id, publicKey, counter, transports}` param shape | v11.0.0 `[CITED: simplewebauthn.dev migration note]` | Any copy-pasted v10-era example (common in older tutorials/AI training data) will not type-check against v14 — use the field names in this document's code examples, not older blog posts |
| Separate `@simplewebauthn/typescript-types` package | Types exported directly from `@simplewebauthn/server`/`@simplewebauthn/browser` | Consolidated in recent majors | Don't add a `@simplewebauthn/typescript-types` dependency — it's unnecessary with v14 |

**Deprecated/outdated:** SMS-based "press 1 to verify" flows are explicitly out of scope for this project (A2P 10DLC registration delay) — not applicable here beyond confirming the project's own decision still holds.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `localStorage`-based memberId pairing is an acceptable substitute for real auth in this phase | Pitfall 7 | If wrong, any phone could open `/verify` and answer on behalf of a member it isn't paired to — acceptable for a single-demo-household hackathon build, but must be confirmed with the user as intentional |
| A2 | `isoBase64URL.toBuffer()` is the exact reverse-of-`fromBuffer` method name in v14 | Pattern 2 code example | If the method is named differently, a TypeScript build error surfaces immediately (not a silent runtime bug) — low risk, cheap to fix at compile time |
| A3 | One combined `onDocumentWritten` trigger writing three mirror docs (lamp/prompts/feed) is preferable to three separate triggers | Architecture Patterns / Pattern 3 | If wrong (e.g. write contention or trigger ordering issues), the fix is to split into separate triggers — no data-loss risk either way, just a possible latency/cost difference |
| A4 | `prompts/{memberId}` and `households/demo/feed/{callId}` being fully public-read (`allow get: if true`) is an acceptable exposure for a single-demo-household hackathon | Pattern 3 rules | Real product would need per-family auth; flagged explicitly as a scope-appropriate tradeoff, not an oversight |
| A5 | `residentKey: 'preferred'` + explicit `allowCredentials` scoping is sufficient without ever needing the usernameless/discoverable flow | Pitfall 6 | If a phone's WebAuthn implementation behaves unexpectedly, the fallback is VER-05's HMAC link path, which has no WebAuthn dependency at all |

**If this table is empty:** N/A — see entries above; none of these need to block starting the plan, but A1 and A4 should be surfaced to the user as explicit scope confirmations during `/gsd-discuss-phase` or plan review.

## Open Questions

1. **Exact `isoBase64URL` reverse method for decoding a stored public key back to `Uint8Array`**
   - What we know: `isoBase64URL.fromBuffer()` is confirmed to exist and is imported from `@simplewebauthn/server/helpers` `[CITED: WebSearch summary of simplewebauthn.dev docs]`.
   - What's unclear: whether the reverse method is `toBuffer()`, `toUint8Array()`, or something else in v14 specifically.
   - Recommendation: check `node_modules/@simplewebauthn/server/esm/helpers/iso/isoBase64URL.d.ts` once the package is installed — a 10-second `cat` resolves this definitively before writing `finishPasskeyRegistration`.

2. **Whether Phase 2/3's `endCall.ts`/`lamp.ts` will exist with the exact exported names this research assumes**
   - What we know: `02-02-PLAN.md` and `03-02-PLAN.md` (both unexecuted at research time) name `releaseCall(callId)`, `forceEndCall(callSid, sayLine)`, and `mirrorActiveCallToLamp` precisely.
   - What's unclear: whether execution deviates from those plans (Phase 2 Plan 01's own summary shows two auto-fixed deviations already, so some drift is plausible).
   - Recommendation: the Phase 4 plan's first task should `grep`/`Read` the actual `functions/src/screening/endCall.ts` and `functions/src/lamp.ts` (once they exist) before writing `answerVerification`, rather than trusting this document's assumed signatures blindly.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Deployed HTTPS site at `porchlight-hack.web.app` | Real passkey registration/assertion (rpID must match deployed origin, not `localhost`) | Depends on Phase 1 deploy having run | — | None — WebAuthn cannot be meaningfully tested end-to-end on `localhost` for the deployed rpID; local dev can only test with `rpID:'localhost'`, a different credential scope |
| A phone with a platform authenticator (Face ID / Touch ID / Android biometric or screen lock) | VER-01/03 passkey ceremony | Assumed available (builder's own phone / judge's phone) | — | VER-05 signed-link fallback removes this dependency entirely |
| `firebase functions:secrets:set VERIFY_LINK_SECRET` | VER-05 fallback only | Not yet set (new secret) | — | Only needed if the 2h WebAuthn timebox is blown; human checkpoint |

**Missing dependencies with no fallback:** none blocking — the deployed-site dependency is satisfied once Phase 1's `pnpm deploy` has run, which the roadmap already requires before Phase 4 starts.
**Missing dependencies with fallback:** platform authenticator requirement has a full fallback via VER-05.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | yes | WebAuthn (`@simplewebauthn/server`) is itself an ASVS-recommended authenticator mechanism; no passwords/OTPs hand-rolled |
| V3 Session Management | partial | No session tokens issued; `localStorage` memberId pairing is a lightweight substitute, explicitly flagged as scope-appropriate (Assumption A1), not a session-management control |
| V4 Access Control | yes | `prompts/{memberId}` and `households/demo/feed/{callId}` are deliberately narrow, read-only, non-sensitive mirrors — no full `calls/{id}` field ever exposed publicly |
| V5 Input Validation | yes | All new `onCall` payloads should be zod-validated (`AnswerVerificationPayload`, `PasskeyRegistrationPayload`) matching the existing `WaitlistPayload` pattern `[VERIFIED: packages/shared/src/waitlist.ts:5-9]` |
| V6 Cryptography | yes | Never hand-roll WebAuthn signature verification (`@simplewebauthn/server`); the HMAC fallback (VER-05) uses `crypto.timingSafeEqual`, not a `===` string comparison, to avoid timing side-channels |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Passkey replay via cloned authenticator | Spoofing | Signature counter check (`verifyAuthenticationResponse`'s `authenticationInfo.newCounter` must strictly increase; persist and compare) |
| Forged `answerVerification` call bypassing the passkey ceremony entirely (`answer:'yes'` with no `response`) | Spoofing / Elevation of privilege | Server must reject `answer==='yes'` with neither a valid `response` nor a valid `token` — never trust a bare `answer:'yes'` field |
| `prompts/{memberId}` token leak (public-read doc carries the VER-05 HMAC token in the open) | Information Disclosure | Accepted for this phase's scope (single demo household, short-lived calls) — token is single-purpose and tied to one `callId`, so leaking it only lets someone answer one specific call, not impersonate the member generally |
| Stale `webauthnChallenges/{memberId}` reused across ceremonies | Tampering (replay) | Explicit `expiresAt` check in `finishPasskeyRegistration`/`answerVerification`, and delete-after-use |

## Sources

### Primary (HIGH confidence)
- `simplewebauthn.dev/docs/packages/server` — `generateRegistrationOptions`, `verifyRegistrationResponse`, `generateAuthenticationOptions`, `verifyAuthenticationResponse` parameter/return shapes, v11 migration note, stored-passkey field recommendations
- `simplewebauthn.dev/docs/packages/browser` — `startRegistration`/`startAuthentication` usage, `WebAuthnError` handling, `platformAuthenticatorIsAvailable`
- `npm view @simplewebauthn/server version` / `npm view @simplewebauthn/browser version` — version + `engines` confirmation (2026-09-21)
- This repo's own `functions/src/screening/runTurn.ts`, `packages/shared/src/{calls,households}.ts`, `firestore.rules`, `apps/web/src/{App.tsx,lib/firebase.ts,pages/Sim.tsx,pages/Stage.tsx}`, `.firebaserc`, `firebase.json` — read directly this session

### Secondary (MEDIUM confidence)
- `web.dev/articles/webauthn-rp-id` — rpID/localhost exception
- `developer.chrome.com/blog/autoplay`, `chromium.org/audio-video/autoplay` — autoplay gesture requirement
- WebSearch summaries citing Corbado/web.dev on discoverable credentials and iOS/Android resident-key behavior differences
- `github.com/mdn/browser-compat-data` issue #29166 — iOS Safari `navigator.vibrate` status (contested/recent, treat cautiously)

### Tertiary (LOW confidence)
- None used without a MEDIUM+ corroborating source above.

## Metadata

**Confidence breakdown:**
- Standard stack (SimpleWebAuthn versions/API): HIGH — confirmed via npm registry and official docs directly
- Architecture (mirror-doc pattern, `answerVerification` design): MEDIUM — extends an already-proven Phase 3 pattern but the specific Phase 4 wiring is this research's own design, not independently verified
- Pitfalls (iOS vibrate, autoplay, rpID): MEDIUM — cross-checked against MDN/Chrome/web.dev but browser behavior is inherently a moving target

**Research date:** 2026-09-21
**Valid until:** ~7 days (browser API support tables and SimpleWebAuthn's own version cadence move faster than the 30-day default; this project's demo is tomorrow morning regardless)
