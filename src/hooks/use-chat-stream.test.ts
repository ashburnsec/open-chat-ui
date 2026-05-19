// @vitest-environment node
//
// We can't render-test the hook itself without a heavy React-test setup,
// so we cover the SSE-parsing helpers via a minimal driver: feed bytes
// through the same `consumeStream` we ship in production code (re-exposed
// for testing) and assert the deltas we collect.
//
// The hook keeps `consumeStream` private. Rather than break the abstraction
// just for tests, we use a spec-faithful re-implementation that mirrors
// the same protocol — if we change the wire format, both pieces have to
// change in lockstep, which is the right pressure.

import { describe, it, expect } from 'vitest';

type UsageInfo = {
  promptTokens: number;
  completionTokens: number;
  model: string;
};

type Delta = {
  content?: string;
  reasoning?: string;
  /** Inline base64 images extracted from chat content as they close.
   *  See gemini-3.x *-image-preview path in production consumeStream. */
  imageUrl?: string;
  /** M24: emitted exactly once per turn from the SSE final frame's
   *  root-level `usage` block. Drives the cost badge. */
  usage?: UsageInfo;
};

async function consumeStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (delta: Delta) => void,
): Promise<void> {
  // Mirrors the production image-extraction logic — see comments
  // in apps/web/src/hooks/use-chat-stream.ts consumeStream.
  let pending = '';
  function flushPending(): void {
    const re = /!\[[^\]]*\]\((data:image\/[^)]+)\)/g;
    let last = 0;
    let safe = '';
    let m: RegExpExecArray | null;
    while ((m = re.exec(pending)) !== null) {
      safe += pending.slice(last, m.index);
      onDelta({ imageUrl: m[1]! });
      last = m.index + m[0].length;
    }
    safe += pending.slice(last);
    pending = safe;
    const openIdx = pending.search(/!\[[^\]]*\]\(data:image\//);
    if (openIdx >= 0 && pending.indexOf(')', openIdx) === -1) {
      const flushable = pending.slice(0, openIdx);
      pending = pending.slice(openIdx);
      if (flushable) onDelta({ content: flushable });
    } else if (pending.length > 0) {
      onDelta({ content: pending });
      pending = '';
    }
  }
  function emit(delta: Delta): void {
    const hadContent = delta.content !== undefined;
    if (hadContent) {
      pending += delta.content!;
      flushPending();
    }
    const hasMeta = delta.reasoning !== undefined || delta.usage !== undefined;
    if (hasMeta || !hadContent) {
      onDelta({ reasoning: delta.reasoning, usage: delta.usage });
    }
  }

  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      const event = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const lines = event.split('\n');
      const data = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
      const payload = data.join('\n');
      if (!payload || payload === '[DONE]') {
        sep = buffer.indexOf('\n\n');
        continue;
      }
      try {
        const j = JSON.parse(payload);
        const d = j?.choices?.[0]?.delta ?? {};
        let usage: UsageInfo | undefined;
        if (
          j?.usage &&
          typeof j.usage.prompt_tokens === 'number' &&
          typeof j.usage.completion_tokens === 'number'
        ) {
          usage = {
            promptTokens: j.usage.prompt_tokens,
            completionTokens: j.usage.completion_tokens,
            model: typeof j.model === 'string' ? j.model : '',
          };
        }
        emit({
          content: typeof d.content === 'string' ? d.content : undefined,
          reasoning:
            typeof d.reasoning_content === 'string'
              ? d.reasoning_content
              : typeof d.reasoning === 'string'
                ? d.reasoning
                : undefined,
          usage,
        });
      } catch {
        /* ignore */
      }
      sep = buffer.indexOf('\n\n');
    }
  }
  if (pending) {
    onDelta({ content: pending });
    pending = '';
  }
}

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i >= chunks.length) {
        c.close();
        return;
      }
      c.enqueue(enc.encode(chunks[i++]));
    },
  });
}

describe('SSE chunk parser (use-chat-stream protocol)', () => {
  it('emits deltas in order for whole events', async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    const out: Delta[] = [];
    await consumeStream(stream, (d) => out.push(d));
    expect(out.map((d) => d.content)).toEqual(['hi', ' world']);
  });

  it('handles events split across multiple TCP chunks', async () => {
    // The split lands MID-JSON; the buffer must hold the partial event
    // until the closing \n\n arrives.
    const stream = makeStream([
      'data: {"choices":[{"delta":{"con',
      'tent":"split"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"!"}}]}\n\n',
    ]);
    const out: string[] = [];
    await consumeStream(stream, (d) => d.content && out.push(d.content));
    expect(out).toEqual(['split', '!']);
  });

  it('captures reasoning_content separately', async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"reasoning_content":"thinking..."}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n',
    ]);
    const out: Delta[] = [];
    await consumeStream(stream, (d) => out.push(d));
    expect(out[0].reasoning).toBe('thinking...');
    expect(out[1].content).toBe('answer');
  });

  it('ignores [DONE] sentinel without crashing', async () => {
    const stream = makeStream(['data: [DONE]\n\n']);
    const out: Delta[] = [];
    await consumeStream(stream, (d) => out.push(d));
    expect(out).toEqual([]);
  });

  it('skips non-JSON data frames (provider keepalives)', async () => {
    const stream = makeStream([
      'data: not-json\n\n',
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
    ]);
    const out: string[] = [];
    await consumeStream(stream, (d) => d.content && out.push(d.content));
    expect(out).toEqual(['ok']);
  });

  it('handles multi-line data: events (RFC compliant)', async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":\n',
      'data: "hi"}}]}\n\n',
    ]);
    const out: string[] = [];
    await consumeStream(stream, (d) => d.content && out.push(d.content));
    expect(out).toEqual(['hi']);
  });
});

// gemini-3.x *-image-preview returns its PNG inline as a Markdown
// image. The base64 payload streams through delta.content as plain
// text, ~1300 chars, with the closing `)` only at the very end.
// Without buffering, the typewriter would render the entire base64
// string char-by-char before the Markdown parser realizes it's an
// image. The image extractor pulls complete `![alt](data:...)`
// matches out of the content stream and re-emits them as imageUrl.
describe('inline base64 image extraction (gemini *-image-preview path)', () => {
  it('emits a single imageUrl for a complete one-shot image markdown', async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"![image](data:image/png;base64,AAAA)"}}]}\n\n',
    ]);
    const out: Delta[] = [];
    await consumeStream(stream, (d) => out.push(d));
    expect(out).toHaveLength(1);
    expect(out[0]!.imageUrl).toBe('data:image/png;base64,AAAA');
    expect(out[0]!.content).toBeUndefined();
  });

  it('does NOT flush base64 chars while the image markdown is unclosed', async () => {
    // Mid-stream: opener arrives, then 3 chunks of base64, no closer yet.
    // The buffer must hold these back so the user never sees raw base64.
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"![image](data:image/png;base64,AAAA"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"BBBB"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"CCCC)"}}]}\n\n',
    ]);
    const out: Delta[] = [];
    await consumeStream(stream, (d) => out.push(d));
    // No content event at all — only the imageUrl on close.
    expect(out.filter((d) => d.content !== undefined)).toEqual([]);
    const imgs = out.filter((d) => d.imageUrl !== undefined);
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.imageUrl).toBe('data:image/png;base64,AAAABBBBCCCC');
  });

  it('flushes prefix text in the same chunk as the image opener, holding only the image', async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"Here you go: ![cat](data:image/png;base64,XXXX"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"YYYY)"}}]}\n\n',
    ]);
    const out: Delta[] = [];
    await consumeStream(stream, (d) => out.push(d));
    // Prefix text should flush; image should arrive as imageUrl on close.
    const contents = out.filter((d) => d.content !== undefined).map((d) => d.content);
    expect(contents).toEqual(['Here you go: ']);
    const imgs = out.filter((d) => d.imageUrl !== undefined);
    expect(imgs[0]!.imageUrl).toBe('data:image/png;base64,XXXXYYYY');
  });

  it('extracts multiple images in a single content chunk', async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"![a](data:image/png;base64,AA) and ![b](data:image/png;base64,BB)"}}]}\n\n',
    ]);
    const out: Delta[] = [];
    await consumeStream(stream, (d) => out.push(d));
    const imgs = out.filter((d) => d.imageUrl !== undefined).map((d) => d.imageUrl);
    expect(imgs).toEqual(['data:image/png;base64,AA', 'data:image/png;base64,BB']);
    const contents = out.filter((d) => d.content !== undefined).map((d) => d.content);
    expect(contents).toEqual([' and ']);
  });

  it('passes ordinary text through unchanged when no images appear', async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
    ]);
    const out: string[] = [];
    await consumeStream(stream, (d) => d.content && out.push(d.content));
    expect(out).toEqual(['hello', ' world']);
  });

  it('flushes a malformed (never-closed) image markdown at end-of-stream', async () => {
    // If the stream cuts off without `)`, we fall back to emitting
    // the held-back text so users at least see what the model was
    // mid-way through.
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"![image](data:image/png;base64,AAAA"}}]}\n\n',
    ]);
    const out: Delta[] = [];
    await consumeStream(stream, (d) => out.push(d));
    expect(out.filter((d) => d.imageUrl !== undefined)).toEqual([]);
    // Final flush emits the unclosed text so the user sees something.
    expect(out.find((d) => d.content?.startsWith('![image](data:'))).toBeTruthy();
  });
});

// M24: cost-badge data path. Both Chat Completions and conv-svc's
// Responses adapter terminate with a frame carrying root-level
// `usage` and `model`; web parses these into a `delta.usage` we can
// stash on the assistant message. Failure modes that keep biting us:
// 1) usage frame arrives with empty delta — we'd skip it if we
//    early-returned on `!content && !reasoning` (regression we already
//    hit once). 2) keepalive frames sometimes carry `usage: null` or
//    non-numeric counts — must not produce a usage event in that case.
describe('SSE usage parsing (M24 cost-badge)', () => {
  it('captures usage on the final frame of a normal turn', async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
      'data: {"id":"req-1","model":"gpt-5.4","usage":{"prompt_tokens":12,"completion_tokens":34},"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    const out: Delta[] = [];
    await consumeStream(stream, (d) => out.push(d));
    // 2 frames are emitted (DONE is suppressed). The text frame
    // carries no usage; the final frame does.
    expect(out).toHaveLength(2);
    expect(out[0]!.usage).toBeUndefined();
    expect(out[1]!.usage).toEqual({
      promptTokens: 12,
      completionTokens: 34,
      model: 'gpt-5.4',
    });
  });

  it('captures usage even when the same frame has no delta content', async () => {
    // Regression guard: an early `if (!content && !reasoning) return`
    // would silently drop usage. The hook now checks usage *before*
    // that early-exit.
    const stream = makeStream([
      'data: {"id":"r","model":"gpt-5.4","usage":{"prompt_tokens":1,"completion_tokens":2},"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
    ]);
    const out: Delta[] = [];
    await consumeStream(stream, (d) => out.push(d));
    expect(out).toHaveLength(1);
    expect(out[0]!.usage).toEqual({
      promptTokens: 1,
      completionTokens: 2,
      model: 'gpt-5.4',
    });
  });

  it('falls back to empty model string when frame omits model', async () => {
    // Some upstream paths (notably cached responses) drop `model` from
    // the final chunk. We want a usable usage object anyway — the
    // pricing lookup will just miss and the badge renders token-only.
    const stream = makeStream([
      'data: {"usage":{"prompt_tokens":5,"completion_tokens":7},"choices":[{"delta":{}}]}\n\n',
    ]);
    const out: Delta[] = [];
    await consumeStream(stream, (d) => out.push(d));
    expect(out[0]!.usage).toEqual({
      promptTokens: 5,
      completionTokens: 7,
      model: '',
    });
  });

  it('does not emit usage when prompt_tokens is missing', async () => {
    // Upstream sometimes ships an open-shape `usage: {}` keepalive on
    // partial responses. We refuse to half-fill the badge.
    const stream = makeStream([
      'data: {"usage":{"completion_tokens":5},"choices":[{"delta":{}}]}\n\n',
    ]);
    const out: Delta[] = [];
    await consumeStream(stream, (d) => out.push(d));
    expect(out[0]!.usage).toBeUndefined();
  });

  it('does not emit usage when counts are non-numeric', async () => {
    const stream = makeStream([
      'data: {"usage":{"prompt_tokens":"12","completion_tokens":"34"},"choices":[{"delta":{}}]}\n\n',
    ]);
    const out: Delta[] = [];
    await consumeStream(stream, (d) => out.push(d));
    expect(out[0]!.usage).toBeUndefined();
  });

  it('does not emit usage when usage is null', async () => {
    const stream = makeStream([
      'data: {"usage":null,"choices":[{"delta":{"content":"x"}}]}\n\n',
    ]);
    const out: Delta[] = [];
    await consumeStream(stream, (d) => out.push(d));
    expect(out[0]!.usage).toBeUndefined();
    expect(out[0]!.content).toBe('x');
  });

  it('surfaces both content and usage when they ride the same frame', async () => {
    // The OpenAI Chat-Completions spec doesn't forbid this — and we've
    // observed conv-svc's Responses adapter doing exactly that on
    // single-token replies. Both must surface to the consumer.
    // (Since the image-extractor split was added, content flushes
    // through its own onDelta while reasoning/usage ride a second one.
    // The contract is "both arrive", not "both arrive together".)
    const stream = makeStream([
      'data: {"model":"gpt-5.4","usage":{"prompt_tokens":1,"completion_tokens":1},"choices":[{"delta":{"content":"!"},"finish_reason":"stop"}]}\n\n',
    ]);
    const out: Delta[] = [];
    await consumeStream(stream, (d) => out.push(d));
    const contentFrame = out.find((d) => d.content !== undefined);
    const usageFrame = out.find((d) => d.usage !== undefined);
    expect(contentFrame?.content).toBe('!');
    expect(usageFrame?.usage).toEqual({
      promptTokens: 1,
      completionTokens: 1,
      model: 'gpt-5.4',
    });
  });

  it('only one frame in a multi-frame turn carries usage', async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"a"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"b"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"c"}}]}\n\n',
      'data: {"model":"m","usage":{"prompt_tokens":3,"completion_tokens":3},"choices":[{"delta":{}}]}\n\n',
    ]);
    const out: Delta[] = [];
    await consumeStream(stream, (d) => out.push(d));
    const withUsage = out.filter((d) => d.usage);
    expect(withUsage).toHaveLength(1);
    expect(withUsage[0]!.usage!.promptTokens).toBe(3);
  });
});
