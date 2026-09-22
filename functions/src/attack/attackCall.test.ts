import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/https';
import { attackCall } from './attackCall.js';

const REAL_TOKEN = 'a'.repeat(48); // matches DEMO_TOKEN's real openssl-rand-hex-24 length

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.DEMO_TOKEN = REAL_TOKEN;
  process.env.ELEVENLABS_API_KEY = 'xi-test-key';
  process.env.ELEVENLABS_ATTACKER_AGENT_ID = 'agent_attacker_test';
  process.env.ELEVENLABS_ATTACKER_PHONE_ID = 'phnum_attacker_test';
});

describe('attackCall', () => {
  it('rejects a wrong token with permission-denied and never calls fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(attackCall.run({ data: { token: 'wrong-token' } } as never)).rejects.toThrow(HttpsError);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a missing token with permission-denied and never calls fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(attackCall.run({ data: {} } as never)).rejects.toThrow(HttpsError);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('calls fetch exactly once with the hardcoded Porchlight number, regardless of req.data', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ conversation_id: 'conv_123', callSid: 'CA123' }), { status: 200 }),
    );

    // Extra attacker-supplied fields (to_number, toNumber, number) must be silently
    // ignored -- zod strips unknown keys and the schema has no number-shaped field at all.
    const result = await attackCall.run({
      data: { token: REAL_TOKEN, to_number: '+15551234567', toNumber: '+15551234567', number: '+15551234567' },
    } as never);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/convai/twilio/outbound-call');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string);
    expect(body.to_number).toBe('+14015861988');
    expect(body.agent_id).toBe('agent_attacker_test');
    expect(body.agent_phone_number_id).toBe('phnum_attacker_test');

    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('xi-test-key');
    expect(result).toEqual({ conversation_id: 'conv_123', callSid: 'CA123' });
  });

  it('throws HttpsError("internal") with the response body on a non-2xx ElevenLabs response, without falling back to any alternate destination', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('{"detail":"unauthorized"}', { status: 401 }),
    );

    await expect(attackCall.run({ data: { token: REAL_TOKEN } } as never)).rejects.toThrow(HttpsError);
    await expect(attackCall.run({ data: { token: REAL_TOKEN } } as never)).rejects.toThrow(/401/);
  });
});
