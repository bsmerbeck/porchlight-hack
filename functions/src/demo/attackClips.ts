import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { onCall, HttpsError } from 'firebase-functions/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { ATTACK_LINES } from '@porchlight/shared';
import { demoToken, elevenLabsKey } from '../secrets.js';

const REGION = 'us-central1';

// The ElevenLabs conversational "Attacker" agent is blocked by vendor moderation
// ("Agent ... is unsafe" -- see 05-02-SUMMARY.md). This is the fallback: plain
// Text-to-Speech in the same consented cloned voice, generated once and cached, played
// back through a soundboard on /sim instead of a live agent call.
const ELEVENLABS_VOICES_URL = 'https://api.elevenlabs.io/v2/voices';
const ELEVENLABS_TTS_URL = (voiceId: string) =>
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`;

const PRIMARY_MODEL = 'eleven_turbo_v2_5';
const FALLBACK_MODEL = 'eleven_multilingual_v2';

// The consented voice clone is named "Brenden clone" (or similar) in the ElevenLabs
// dashboard -- see ATTACKER_CONSENT.md. Matched case-insensitively by substring so exact
// dashboard naming (trailing " clone", capitalization, etc.) doesn't matter.
const VOICE_NAME_NEEDLE = 'brenden';

// Cached lookups live under demo/attackClips so a redeploy or cold start never re-hits
// ElevenLabs' voices/TTS endpoints for data that never changes for this demo.
const VOICE_DOC_PATH = 'demo/attackClips';
const lineDocPath = (index: number) => `demo/attackClips/lines/${index}`;

// `token` is optional here (not `z.string()`) so a missing/malformed payload fails the
// SAME permission-denied gate as a wrong token -- mirrors attackCall.ts's AttackCallInput.
// `index` is optional: omitted means "generate/return all five lines".
const AttackClipsInput = z.object({
  token: z.string().optional(),
  index: z.number().int().min(0).max(ATTACK_LINES.length - 1).optional(),
});

// T-05-05 pattern: identical DEMO_TOKEN timingSafeEqual gate as attackCall.ts / resetDemo.ts.
function checkDemoToken(token: string | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(demoToken.value());
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

type ElevenLabsVoice = { voice_id: string; name: string };

/**
 * Resolves the consented cloned voice's ElevenLabs voice_id, caching it in Firestore so
 * this only ever calls GET /v2/voices once for the lifetime of the demo doc.
 */
async function getOrDiscoverVoiceId(): Promise<string> {
  const db = getFirestore();
  const ref = db.doc(VOICE_DOC_PATH);
  const snap = await ref.get();
  const cachedVoiceId = (snap.data() as { voiceId?: string } | undefined)?.voiceId;
  if (cachedVoiceId) return cachedVoiceId;

  const res = await fetch(ELEVENLABS_VOICES_URL, {
    headers: { 'xi-api-key': elevenLabsKey.value() },
  });
  const bodyText = await res.text();

  if (!res.ok) {
    console.error('attackClips: ElevenLabs voices lookup failed', res.status, bodyText);
    throw new HttpsError('internal', `ElevenLabs voices lookup failed (${res.status}): ${bodyText}`);
  }

  let voices: ElevenLabsVoice[] = [];
  try {
    const parsed = JSON.parse(bodyText) as { voices?: ElevenLabsVoice[] };
    voices = parsed.voices ?? [];
  } catch {
    throw new HttpsError('internal', `ElevenLabs voices lookup returned unparseable body: ${bodyText}`);
  }

  const match = voices.find((v) => v.name.toLowerCase().includes(VOICE_NAME_NEEDLE));
  if (!match) {
    const names = voices.map((v) => v.name).join(', ') || '(no voices returned)';
    throw new HttpsError(
      'failed-precondition',
      `No ElevenLabs voice matching "${VOICE_NAME_NEEDLE}" was found. Voices seen: ${names}`,
    );
  }

  await ref.set({ voiceId: match.voice_id }, { merge: true });
  return match.voice_id;
}

/**
 * Calls ElevenLabs TTS for one line, falling back from PRIMARY_MODEL to FALLBACK_MODEL
 * exactly once if the primary model itself is rejected by a 4xx that names the model.
 * Any other 4xx/5xx (including a moderation-style rejection) is surfaced verbatim --
 * the human needs to see ElevenLabs' own error text, not a repackaged message.
 */
async function synthesize(voiceId: string, text: string, model: string, allowFallback: boolean): Promise<Buffer> {
  const res = await fetch(ELEVENLABS_TTS_URL(voiceId), {
    method: 'POST',
    headers: {
      'xi-api-key': elevenLabsKey.value(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: 0.4, similarity_boost: 0.8 },
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text();
    const isClientError = res.status >= 400 && res.status < 500;
    const namesModel = bodyText.toLowerCase().includes('model');
    if (allowFallback && isClientError && namesModel && model !== FALLBACK_MODEL) {
      console.error('attackClips: primary model rejected, retrying with fallback model', res.status, bodyText);
      return synthesize(voiceId, text, FALLBACK_MODEL, false);
    }
    console.error('attackClips: ElevenLabs text-to-speech failed', res.status, bodyText);
    throw new HttpsError('internal', `ElevenLabs text-to-speech failed (${res.status}): ${bodyText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

type Clip = { index: number; text: string; audioBase64: string };

/**
 * Returns a single line's clip, generating + caching it on first request. Cached per-line
 * under demo/attackClips/lines/{index} (a subcollection, not a field on the parent doc)
 * because five clips' base64 payloads combined could exceed Firestore's 1 MiB document
 * limit; each line's own doc stays well under that on its own.
 */
async function getOrGenerateClip(voiceId: string, index: number): Promise<Clip> {
  const text = ATTACK_LINES[index];
  const db = getFirestore();
  const ref = db.doc(lineDocPath(index));
  const snap = await ref.get();
  const cached = snap.data() as { text?: string; audioBase64?: string } | undefined;

  // Only trust the cache if the fixture text hasn't changed since it was generated --
  // avoids serving stale audio for a line that was later edited.
  if (cached?.audioBase64 && cached.text === text) {
    return { index, text, audioBase64: cached.audioBase64 };
  }

  const audioBuffer = await synthesize(voiceId, text, PRIMARY_MODEL, true);
  const audioBase64 = audioBuffer.toString('base64');

  await ref.set({
    text,
    audioBase64,
    voiceId,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { index, text, audioBase64 };
}

/**
 * ATK-01 fallback: DEMO_TOKEN-gated onCall that returns one or all five ATTACK_LINES as
 * base64 MP3 clips synthesized in the consented cloned voice via plain ElevenLabs
 * Text-to-Speech (never the moderation-blocked conversational "Attacker" agent). The API
 * key never leaves this Function -- the client only ever receives audio bytes.
 */
export const attackClips = onCall(
  {
    region: REGION,
    cors: true,
    maxInstances: 5,
    secrets: [demoToken, elevenLabsKey],
  },
  async (req) => {
    const { token, index } = AttackClipsInput.parse(req.data);

    if (!checkDemoToken(token)) {
      throw new HttpsError('permission-denied', 'Invalid demo token');
    }

    const voiceId = await getOrDiscoverVoiceId();
    const indices = index !== undefined ? [index] : ATTACK_LINES.map((_, i) => i);

    const clips: Clip[] = [];
    for (const i of indices) {
      clips.push(await getOrGenerateClip(voiceId, i));
    }

    return { clips };
  },
);
