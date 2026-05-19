/**
 * SSE stream mocking — emits OpenAI Chat Completions / Responses-style
 * `data: {...}\n\n` frames followed by `data: [DONE]\n\n`.
 *
 * Used to simulate `/api/chat` and `/api/conversations/{id}/messages`
 * streaming responses without touching a real LLM.
 */

const encoder = new TextEncoder();

/** Slice a string into ~3-6 char chunks to feel like real LLM streaming. */
function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const len = 3 + Math.floor(Math.random() * 4); // 3–6 chars
    chunks.push(text.slice(i, i + len));
    i += len;
  }
  return chunks;
}

/** Build an OpenAI Chat Completions style delta frame. */
function chatFrame(delta: { content?: string; reasoning_content?: string }, id = 'mock-resp') {
  const obj = {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'mock-model',
    choices: [{ index: 0, delta, finish_reason: null }],
  };
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function doneFrame() {
  return 'data: [DONE]\n\n';
}

/** Stream the given text as OpenAI SSE chunks with realistic timing. */
export function mockSSEStream(text: string, opts?: { delayMs?: number }): Response {
  const delayMs = opts?.delayMs ?? 50;
  const chunks = chunkText(text);
  const stream = new ReadableStream({
    async start(controller) {
      // First frame: role
      controller.enqueue(encoder.encode(chatFrame({ content: '' })));
      await new Promise((r) => setTimeout(r, 30));
      for (const c of chunks) {
        controller.enqueue(encoder.encode(chatFrame({ content: c })));
        await new Promise((r) => setTimeout(r, delayMs + (Math.random() * 30 - 15)));
      }
      // Final frame with usage
      const finalObj = {
        id: 'mock-resp',
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'mock-model',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: text.length,
          total_tokens: 10 + text.length,
        },
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalObj)}\n\n`));
      controller.enqueue(encoder.encode(doneFrame()));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'x-mock-mode': 'true',
    },
  });
}
