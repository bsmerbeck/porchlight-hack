import { onRequest } from 'firebase-functions/https';
import { elevenLabsLlmToken, anthropicKey } from '../secrets.js';
import { runTurn, DEMO_HOUSEHOLD_ID } from './runTurn.js';
import { sseChunk, sseDone, sseToolCall } from './sse.js';

const REGION = 'us-central1';

const FALLBACK_REPLY = "I'm sorry, could you say that again?";

type IncomingMessage = { role?: string; content?: unknown };
type CustomLlmRequestBody = {
  messages?: IncomingMessage[];
  elevenlabs_extra_body?: { call_doc_id?: unknown };
};

function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : header.trim();
}

// Pitfall 5 (02-RESEARCH.md) / Open Question 1: the exact inbound auth header/scheme
// ElevenLabs uses for the plain HTTP Custom LLM path is under-documented. Bound secret
// is ELEVENLABS_LLM_TOKEN (defineSecret in ../secrets.ts) -- accept it via any of
// Authorization: Bearer <token>, x-api-key, or xi-api-key, whichever ElevenLabs actually
// sends; confirm the real one on Task 4's live test call and tighten this afterward.
function isAuthorized(req: { get(name: string): string | undefined }, expected: string): boolean {
  const authHeader = req.get('Authorization') ?? req.get('authorization');
  const apiKeyHeader = req.get('x-api-key') ?? req.get('xi-api-key');
  const candidates = [extractBearer(authHeader), apiKeyHeader].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  return candidates.some((candidate) => candidate === expected);
}

// Open Question 2: whether `call_doc_id` (set via the personalization webhook's
// `dynamic_variables`) automatically round-trips into `elevenlabs_extra_body` on every
// turn, or must be carried as literal text inside the agent's configured system prompt
// instead. Check both; if neither carries it, fall back to a fresh call doc (via
// runTurn's own doc-creation fallback) rather than ever failing the turn silently.
// Mechanism is [UNVERIFIED] until Task 4's live test call confirms it.
function extractCallId(body: CustomLlmRequestBody): string | undefined {
  const fromExtraBody = body.elevenlabs_extra_body?.call_doc_id;
  if (typeof fromExtraBody === 'string' && fromExtraBody.length > 0) {
    return fromExtraBody;
  }

  const systemMessage = body.messages?.find((m) => m.role === 'system');
  const systemContent = typeof systemMessage?.content === 'string' ? systemMessage.content : '';
  const match = /call_doc_id["'=:\s]+([A-Za-z0-9_-]+)/.exec(systemContent);
  if (match) return match[1];

  console.warn(
    'elevenlabsCustomLlm: could not find call_doc_id via elevenlabs_extra_body or the system message; falling back to a fresh call doc [UNVERIFIED -- confirm the real mechanism on the first live test call]',
  );
  return undefined;
}

function extractCallerText(body: CustomLlmRequestBody): string {
  const messages = body.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === 'user' && typeof message.content === 'string') {
      return message.content;
    }
  }
  return '';
}

/**
 * The ElevenLabs agent's entire brain (CALL-02, RISK-01/02/03). An OpenAI-compatible
 * `/v1/chat/completions` endpoint: on every caller turn, verifies the shared bearer
 * secret, derives {callId, callerText} from the request, calls the shared runTurn()
 * core (02-01), and streams back exactly the `reply` string as a single SSE chunk --
 * never the raw model response, never SYSTEM_PROMPT text (T-02-06 wire-shape lock).
 * Any thrown error degrades to a spoken fallback line instead of a bare 500, because a
 * caller must never be met with silence.
 */
export const elevenlabsCustomLlm = onRequest(
  { region: REGION, secrets: [elevenLabsLlmToken, anthropicKey] },
  async (req, res) => {
    const expected = elevenLabsLlmToken.value();

    if (!isAuthorized(req, expected)) {
      console.warn('elevenlabsCustomLlm: rejecting unauthenticated request', {
        hasAuthorizationHeader: Boolean(req.get('Authorization') ?? req.get('authorization')),
        hasApiKeyHeader: Boolean(req.get('x-api-key') ?? req.get('xi-api-key')),
      });
      res.status(401).send('unauthorized');
      return;
    }

    const body = (req.body ?? {}) as CustomLlmRequestBody;
    const callId = extractCallId(body) ?? `custom-llm-${Date.now()}`;
    const callerText = extractCallerText(body);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const { reply, endCall } = await runTurn({ callId, householdId: DEMO_HOUSEHOLD_ID, callerText });
      res.write(sseChunk(reply));
      if (endCall) {
        res.write(sseToolCall('end_call', { message: reply }));
      }
      res.write(sseDone());
      res.end();
    } catch (err) {
      console.error('elevenlabsCustomLlm: runTurn threw, degrading to a spoken fallback line', err);
      res.write(sseChunk(FALLBACK_REPLY));
      res.write(sseDone());
      res.end();
    }
  },
);
