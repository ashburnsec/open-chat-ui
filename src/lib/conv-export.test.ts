// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  buildExportFilename,
  buildMarkdown,
  slugifyTitle,
  timestampSuffix,
} from './conv-export';
import type { Conversation, ConvMessage } from './conv';

const baseConv: Pick<Conversation, 'title' | 'model' | 'createdAt'> = {
  title: '量子纠缠科普',
  model: 'gpt-5.4',
  createdAt: '2026-05-08T03:24:00.000Z',
};

function userMsg(text: string, createdAt = '2026-05-08T03:25:00.000Z'): ConvMessage {
  return {
    id: 1,
    conversationId: 'c1',
    role: 'user',
    content: { text },
    reasoning: null,
    model: null,
    promptTokens: null,
    completionTokens: null,
    requestId: null,
    parentId: null,
    siblingCount: 1,
    siblingIndex: 0,
    siblingIds: [1],
    createdAt,
  };
}

function asstMsg(
  text: string,
  opts: Partial<Pick<ConvMessage, 'reasoning' | 'model' | 'promptTokens' | 'completionTokens'>> = {},
): ConvMessage {
  return {
    id: 2,
    conversationId: 'c1',
    role: 'assistant',
    content: { text },
    reasoning: opts.reasoning ?? null,
    model: opts.model ?? 'gpt-5.4',
    promptTokens: opts.promptTokens ?? 120,
    completionTokens: opts.completionTokens ?? 240,
    requestId: 'req-1',
    parentId: 1,
    siblingCount: 1,
    siblingIndex: 0,
    siblingIds: [2],
    createdAt: '2026-05-08T03:25:30.000Z',
  };
}

describe('slugifyTitle', () => {
  it('preserves unicode chars and replaces unsafe ones', () => {
    expect(slugifyTitle('量子纠缠 / 科普?')).toBe('量子纠缠-科普');
  });

  it('falls back when title is empty after stripping', () => {
    expect(slugifyTitle('///')).toBe('conversation');
    expect(slugifyTitle('')).toBe('conversation');
  });

  it('caps length at 60 chars', () => {
    const long = 'a'.repeat(120);
    expect(slugifyTitle(long).length).toBe(60);
  });
});

describe('timestampSuffix', () => {
  it('formats yyyymmdd-hhmm with zero padding', () => {
    const d = new Date(2026, 4, 8, 9, 5);
    expect(timestampSuffix(d)).toBe('20260508-0905');
  });
});

describe('buildExportFilename', () => {
  it('combines slug + timestamp + .md', () => {
    const d = new Date(2026, 4, 8, 14, 30);
    expect(buildExportFilename('Hello world', d)).toBe('Hello-world-20260508-1430.md');
  });
});

describe('buildMarkdown', () => {
  it('renders title + meta line + alternating turns', () => {
    const md = buildMarkdown(baseConv, [
      userMsg('什么是量子纠缠？'),
      asstMsg('简单地说，纠缠是…'),
    ]);
    expect(md).toContain('# 量子纠缠科普');
    expect(md).toMatch(/> 模型：gpt-5\.4/);
    expect(md).toContain('## 你');
    expect(md).toContain('什么是量子纠缠？');
    expect(md).toContain('## 助手 · gpt-5.4');
    expect(md).toContain('简单地说，纠缠是…');
    expect(md).toContain('tokens: 120 / 240');
  });

  it('skips system messages', () => {
    const sys: ConvMessage = {
      ...userMsg('hidden system prompt'),
      role: 'system',
    };
    const md = buildMarkdown(baseConv, [sys, userMsg('hi')]);
    expect(md).not.toContain('hidden system prompt');
    expect(md).toContain('hi');
  });

  it('renders attachments + documents + generated images as one-liners', () => {
    const m: ConvMessage = {
      ...userMsg('看这个'),
      content: {
        text: '看这个',
        attachments: [{ mime: 'image/png', b64: 'AAAA', name: 'a.png' }],
        documents: [
          {
            docId: 'd1',
            name: '简历.pdf',
            mime: 'application/pdf',
            sizeBytes: 1024,
            kind: 'pdf',
            url: '/files/d1',
            truncated: true,
          },
        ],
      },
    };
    const md = buildMarkdown(baseConv, [m]);
    expect(md).toContain('[附件] a.png');
    expect(md).toContain('[文档] 简历.pdf');
    expect(md).toContain('已截断');
  });

  it('renders generated image + video task indicators', () => {
    const m: ConvMessage = {
      ...asstMsg(''),
      content: {
        text: '',
        generatedImages: [{ url: '/files/img/1.png', prompt: '一只柯基' }],
        videoTask: {
          taskId: 't1',
          model: 'veo-3.1',
          prompt: '走在沙滩上',
          status: 'completed',
          submittedAt: 0,
          durationSeconds: 8,
        },
      },
    };
    const md = buildMarkdown(baseConv, [m]);
    expect(md).toContain('[生成图 1]');
    expect(md).toContain('一只柯基');
    expect(md).toContain('[生成视频] veo-3.1');
    expect(md).toContain('completed');
  });

  it('includes reasoning behind a <details> block when present', () => {
    const md = buildMarkdown(baseConv, [
      userMsg('hi'),
      asstMsg('hello!', { reasoning: '我先要问候用户' }),
    ]);
    expect(md).toContain('<details><summary>思考过程</summary>');
    expect(md).toContain('我先要问候用户');
  });

  it('falls back to placeholder when assistant body is fully empty', () => {
    const m: ConvMessage = {
      ...asstMsg(''),
      content: { text: '' },
    };
    const md = buildMarkdown(baseConv, [m]);
    expect(md).toContain('（无文本内容）');
  });

  it('falls back to "未命名会话" when title is blank', () => {
    const md = buildMarkdown({ ...baseConv, title: '   ' }, [userMsg('a')]);
    expect(md).toContain('# 未命名会话');
  });
});
