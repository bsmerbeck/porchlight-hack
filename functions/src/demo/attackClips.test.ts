import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted lets the vi.mock factory below (hoisted above all imports by Vitest)
// reference this -- mirrors resetDemo.test.ts's own fakeDb pattern.
const { fakeDb, resetFakeDb } = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();

  function docRef(path: string) {
    return {
      async get() {
        const data = docs.get(path);
        return { exists: data !== undefined, data: () => data };
      },
      async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
        if (opts?.merge) {
          docs.set(path, { ...(docs.get(path) ?? {}), ...data });
        } else {
          docs.set(path, data);
        }
      },
    };
  }

  const fakeDb = {
    doc(path: string) {
      return docRef(path);
    },
    __docs: docs,
  };

  return {
    fakeDb,
    resetFakeDb: () => docs.clear(),
  };
});

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => fakeDb,
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}));

import { HttpsError } from 'firebase-functions/https';
import { ATTACK_LINES } from '@porchlight/shared';
import { attackClips } from './attackClips.js';

const REAL_TOKEN = 'a'.repeat(48); // matches DEMO_TOKEN's real openssl-rand-hex-24 length

// Minimal valid MP3 payload bytes -- content doesn't matter, only that it round-trips
// through base64 correctly.
const FAKE_MP3_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

function voicesResponse(voices: Array<{ voice_id: string; name: string }>) {
  return new Response(JSON.stringify({ voices }), { status: 200 });
}

function ttsResponse() {
  return new Response(FAKE_MP3_BYTES, { status: 200 });
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetFakeDb();
  process.env.DEMO_TOKEN = REAL_TOKEN;
  process.env.ELEVENLABS_API_KEY = 'xi-test-key';
});

describe('attackClips', () => {
  it('rejects a wrong token with permission-denied and never calls fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(attackClips.run({ data: { token: 'wrong-token' } } as never)).rejects.toThrow(HttpsError);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a missing token with permission-denied and never calls fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(attackClips.run({ data: {} } as never)).rejects.toThrow(HttpsError);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('discovers the "brenden" voice case-insensitively, caches it, and generates all five clips', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(voicesResponse([{ voice_id: 'other', name: 'Rachel' }, { voice_id: 'v-brenden', name: 'Brenden clone' }]))
      .mockImplementation(async () => ttsResponse());

    const result = (await attackClips.run({ data: { token: REAL_TOKEN } } as never)) as {
      clips: Array<{ index: number; text: string; audioBase64: string }>;
    };

    expect(result.clips).toHaveLength(ATTACK_LINES.length);
    result.clips.forEach((clip, i) => {
      expect(clip.index).toBe(i);
      expect(clip.text).toBe(ATTACK_LINES[i]);
      expect(Buffer.from(clip.audioBase64, 'base64').length).toBeGreaterThan(0);
    });

    // 1 voices call + 5 TTS calls.
    expect(fetchSpy).toHaveBeenCalledTimes(1 + ATTACK_LINES.length);
    const [voicesUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(voicesUrl).toBe('https://api.elevenlabs.io/v2/voices');
    const [ttsUrl, ttsInit] = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(ttsUrl).toBe('https://api.elevenlabs.io/v1/text-to-speech/v-brenden?output_format=mp3_44100_64');
    const ttsBody = JSON.parse(ttsInit.body as string);
    expect(ttsBody.model_id).toBe('eleven_turbo_v2_5');
    expect(ttsBody.voice_settings).toEqual({ stability: 0.4, similarity_boost: 0.8 });

    expect(fakeDb.__docs.get('demo/attackClips')).toEqual({ voiceId: 'v-brenden' });
  });

  it('returns only the requested index when one is given, and does not regenerate cached lines', async () => {
    fakeDb.__docs.set('demo/attackClips', { voiceId: 'v-cached' });
    fakeDb.__docs.set('demo/attackClips/lines/2', {
      text: ATTACK_LINES[2],
      audioBase64: Buffer.from('cached-audio').toString('base64'),
      voiceId: 'v-cached',
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = (await attackClips.run({ data: { token: REAL_TOKEN, index: 2 } } as never)) as {
      clips: Array<{ index: number; text: string; audioBase64: string }>;
    };

    expect(result.clips).toEqual([
      { index: 2, text: ATTACK_LINES[2], audioBase64: Buffer.from('cached-audio').toString('base64') },
    ]);
    // Neither voices nor TTS was ever called -- both the voice id and the line were cached.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails with failed-precondition naming the voices seen when no "brenden" voice exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      voicesResponse([{ voice_id: 'v1', name: 'Rachel' }, { voice_id: 'v2', name: 'Adam' }]),
    );

    await expect(attackClips.run({ data: { token: REAL_TOKEN } } as never)).rejects.toThrow(/Rachel/);
    await expect(attackClips.run({ data: { token: REAL_TOKEN } } as never)).rejects.toThrow(/Adam/);
  });

  it('falls back to eleven_multilingual_v2 when the primary model is rejected by a 4xx naming the model', async () => {
    fakeDb.__docs.set('demo/attackClips', { voiceId: 'v-brenden' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"detail":"model_not_found: eleven_turbo_v2_5 is not available"}', { status: 400 }))
      .mockResolvedValueOnce(ttsResponse());

    const result = (await attackClips.run({ data: { token: REAL_TOKEN, index: 0 } } as never)) as {
      clips: Array<{ index: number }>;
    };

    expect(result.clips).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [, secondInit] = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(secondInit.body as string).model_id).toBe('eleven_multilingual_v2');
  });

  it('surfaces a moderation-style 4xx verbatim without falling back to another model', async () => {
    fakeDb.__docs.set('demo/attackClips', { voiceId: 'v-brenden' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"detail":"this content violates our safety policy"}', { status: 422 }));

    await expect(attackClips.run({ data: { token: REAL_TOKEN, index: 0 } } as never)).rejects.toThrow(
      /violates our safety policy/,
    );
    // Never retried with the fallback model -- the rejection didn't name the model.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
