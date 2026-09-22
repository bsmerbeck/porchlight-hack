// Centralized OpenAI-compatible SSE framing for the ElevenLabs Custom LLM endpoint
// (elevenlabsCustomLlm.ts). No SDK hand-rolls this on the ElevenLabs side
// (02-RESEARCH.md's Don't-Hand-Roll table) -- keep the wire-format bug surface
// confined to this one module instead of duplicating `data: {...}\n\n` framing
// wherever a turn response is built.

let idCounter = 0;

function chunkId(): string {
  idCounter += 1;
  return `chatcmpl-${Date.now()}-${idCounter}`;
}

/**
 * One `chat.completion.chunk` SSE event carrying spoken text in `delta.content`.
 * Claude already produced the full `reply` string non-streamed (RiskTurn is a single
 * structured-output call), so this is always sent as one complete chunk -- there is
 * no requirement to token-stream, only that the wire *format* is SSE-shaped.
 */
export function sseChunk(text: string): string {
  const payload = {
    id: chunkId(),
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { content: text } }],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * A `tool_calls` delta chunk naming a function-style tool. Used to emit the
 * `end_call` system tool (Pattern 3b) in the same response as the spoken reply,
 * so ElevenLabs speaks the farewell line and then hangs up.
 */
export function sseToolCall(name: string, argsObj: Record<string, unknown>): string {
  const payload = {
    id: chunkId(),
    object: 'chat.completion.chunk',
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: chunkId(),
              type: 'function',
              function: { name, arguments: JSON.stringify(argsObj) },
            },
          ],
        },
      },
    ],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** The terminal SSE event every OpenAI-compatible stream must end with. */
export function sseDone(): string {
  return 'data: [DONE]\n\n';
}
