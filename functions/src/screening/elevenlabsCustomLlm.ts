import { createHash } from 'node:crypto';
import { onRequest } from 'firebase-functions/https';
import { elevenLabsLlmToken, anthropicKey } from '../secrets.js';
import { runTurn, DEMO_HOUSEHOLD_ID } from './runTurn.js';
import { sseChunk, sseDone, sseToolCall } from './sse.js';

const REGION = 'us-central1';

const FALLBACK_REPLY = "I'm sorry, could you say that again?";

// 02-FIX (live-call bug, 2026-09-22 04:13 UTC): every turn of one real phone call
// resolved to a DIFFERENT `custom-llm-${Date.now()}` fallback doc instead of one shared
// `calls/{id}`, because neither Tier 1 (elevenlabs_extra_body.call_doc_id) nor Tier 2
// (system-message regex) ever matched -- confirmed via
// `gcloud functions logs read elevenlabsCustomLlm` showing the "could not find
// call_doc_id" warning on every single turn of that call. Root cause per
// elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables:
// dynamic variables (which is how the personalization webhook's
// `dynamic_variables.call_doc_id` would have to reach this endpoint) are only
// officially templatable into an agent's system prompts, first messages, and tool
// parameters -- NOT into the Custom LLM "extra body" field
// (elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm shows extra_body as a
// static/pass-through JSON blob, no `{{...}}` support demonstrated). So Tier 1 only
// ever fires if a human manually wires the dashboard's Custom LLM "Extra body" field to
// something that happens to carry it, and Tier 2 only fires if a human embeds literal
// `{{call_doc_id}}` text in the dashboard's agent system prompt (see Human Follow-up in
// the fix's SUMMARY). Neither is guaranteed, so Tier 3 below is a purely code-side,
// zero-dashboard-dependency fallback: ElevenLabs' Custom LLM endpoint is a standard
// OpenAI-compatible /v1/chat/completions call, which resends the full growing
// conversation history on every turn -- so the FIRST user-authored message in
// `messages[]` is constant for the entire life of one phone call. Hashing it (+ a
// coarse time bucket, so two unrelated calls that happen to open with the same scripted
// line don't collide) gives every turn of the same call the same fallback doc id with
// no dependency on any dashboard configuration at all.
const TEN_MINUTES_MS = 10 * 60 * 1000;

function hashCallSignature(firstUserMessage: string): string {
  const bucket = Math.floor(Date.now() / TEN_MINUTES_MS);
  const signature = `${firstUserMessage.trim().toLowerCase()}::${bucket}`;
  return createHash('sha256').update(signature).digest('hex').slice(0, 16);
}

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

// Open Question 2 -- [VERIFIED via the 2026-09-22 04:13 UTC live call + ElevenLabs docs,
// see the module-level comment above]: `call_doc_id` does NOT reliably round-trip via
// `elevenlabs_extra_body` (Tier 1) or a dashboard-templated system message (Tier 2) --
// both require dashboard configuration this endpoint cannot verify or control. Tier 3 is
// the code-only fallback: a hash of the conversation's first user message (+ time
// bucket), stable across every turn and every retry of the same logical call.
function extractCallId(body: CustomLlmRequestBody): string | undefined {
  const fromExtraBody = body.elevenlabs_extra_body?.call_doc_id;
  if (typeof fromExtraBody === 'string' && fromExtraBody.length > 0) {
    return fromExtraBody;
  }

  for (const message of body.messages ?? []) {
    if (message.role !== 'system') continue;
    const content = typeof message.content === 'string' ? message.content : '';
    const match = /call_doc_id["'=:\s]+([A-Za-z0-9_-]+)/.exec(content);
    if (match) return match[1];
  }

  const firstUserMessage = body.messages?.find(
    (m): m is IncomingMessage & { content: string } => m.role === 'user' && typeof m.content === 'string' && m.content.trim().length > 0,
  );
  if (firstUserMessage) {
    return `custom-llm-hash-${hashCallSignature(firstUserMessage.content)}`;
  }

  console.warn(
    'elevenlabsCustomLlm: could not find call_doc_id via elevenlabs_extra_body, the system message, or any user message to hash; falling back to a fresh call doc',
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
 *
 * 02-FIX (double-farewell bug): when `endCall` is true, `reply` is sent EXCLUSIVELY via
 * the `end_call` tool's own `message` parameter, never also as a separate content-delta
 * chunk. Per elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/end-call,
 * `message` is itself "a farewell message to send to the user before ending the call" --
 * ElevenLabs speaks it as part of executing the tool call. Sending the same text via
 * BOTH a content chunk AND the tool's `message` caused the caller to hear the line
 * spoken twice before the hangup on the live call that surfaced this bug.
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
      if (endCall) {
        // Single farewell only -- see the 02-FIX doc comment above. `reply` is spoken
        // once, via the tool's own `message` parameter, not also as a content chunk.
        res.write(sseToolCall('end_call', { reason: 'scam_detected', message: reply }));
      } else {
        res.write(sseChunk(reply));
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
