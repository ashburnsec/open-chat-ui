/**
 * Mock request dispatcher. Pattern-matches `/api/*` against fixtures /
 * SSE generators and returns a synthetic `Response`. Falls back to
 * `{ success: true, data: null }` for unmatched routes so the UI can
 * keep rendering without 500s.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  MOCK_USER,
  MOCK_STATUS,
  MOCK_AGENTS,
  MOCK_CONVERSATIONS,
  MOCK_MESSAGES_BY_CONV,
  MOCK_MODELS,
  MOCK_MODEL_OVERRIDES,
  MOCK_CHAT_RESPONSES,
} from './data';
import { mockSSEStream } from './sse';

export function isMockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK === 'true';
}

function ok<T>(data: T) {
  return NextResponse.json({ success: true, message: '', data });
}

function pickResponse(): string {
  return MOCK_CHAT_RESPONSES[Math.floor(Math.random() * MOCK_CHAT_RESPONSES.length)];
}

export async function dispatchMock(req: NextRequest): Promise<NextResponse | Response | null> {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();

  // ─── Chat SSE ──────────────────────────────────────────────────────
  if (pathname === '/api/chat' && method === 'POST') {
    return mockSSEStream(pickResponse());
  }
  if (/^\/api\/conversations\/[^/]+\/messages$/.test(pathname) && method === 'POST') {
    return mockSSEStream(pickResponse());
  }
  if (/^\/api\/conversations\/[^/]+\/messages$/.test(pathname) && method === 'GET') {
    const id = pathname.split('/')[3];
    const messages = MOCK_MESSAGES_BY_CONV[id] ?? [];
    return ok({ items: messages });
  }

  // ─── Auth ──────────────────────────────────────────────────────────
  if (pathname === '/api/auth/login' && method === 'POST') {
    const res = ok(MOCK_USER);
    res.cookies.set('session', 'mock-session', { path: '/', sameSite: 'lax' });
    return res;
  }
  if (pathname === '/api/auth/logout' && method === 'POST') {
    const res = ok(null);
    res.cookies.delete('session');
    return res;
  }
  if (pathname === '/api/auth/register' && method === 'POST') {
    return ok({ id: MOCK_USER.id });
  }
  if (pathname === '/api/auth/login-2fa' && method === 'POST') {
    return ok(MOCK_USER);
  }
  if (pathname === '/api/auth/oauth-state' && method === 'GET') {
    return ok({ state: 'mock-state' });
  }
  if (pathname.startsWith('/api/auth/')) return ok(null);

  // ─── Agents ────────────────────────────────────────────────────────
  if (pathname === '/api/agents' && method === 'GET') {
    return ok({ items: MOCK_AGENTS });
  }
  if (pathname === '/api/agents' && method === 'POST') {
    return ok({ id: 999 });
  }
  if (pathname === '/api/agents/popular' && method === 'GET') {
    return ok({ items: MOCK_AGENTS.slice(0, 3) });
  }
  if (pathname === '/api/agents/tags' && method === 'GET') {
    return ok({
      items: [
        { tag: 'writing', count: 1 },
        { tag: 'coding', count: 1 },
        { tag: 'translation', count: 1 },
        { tag: 'learning', count: 1 },
        { tag: 'cooking', count: 1 },
      ],
    });
  }
  if (pathname.match(/^\/api\/agents\/[^/]+\/use$/) && method === 'POST') {
    return ok({ ok: true });
  }
  if (pathname.match(/^\/api\/agents\/[^/]+$/) && method === 'GET') {
    const slug = pathname.split('/').pop();
    const found = MOCK_AGENTS.find((a) => a.slug === slug);
    return found ? ok(found) : NextResponse.json({ success: false, message: 'not found' }, { status: 404 });
  }
  if (pathname.match(/^\/api\/agents\/[^/]+$/) && (method === 'PATCH' || method === 'DELETE')) {
    return ok({ ok: true });
  }

  // ─── Conversations ─────────────────────────────────────────────────
  if (pathname === '/api/conversations' && method === 'GET') {
    return ok({ items: MOCK_CONVERSATIONS });
  }
  if (pathname === '/api/conversations' && method === 'POST') {
    const id = `demo-conv-${Date.now()}`;
    return ok({ id });
  }
  if (pathname === '/api/conversations/search' && method === 'GET') {
    return ok({ items: [] });
  }
  if (pathname.match(/^\/api\/conversations\/[^/]+$/) && method === 'GET') {
    const id = pathname.split('/').pop()!;
    const found = MOCK_CONVERSATIONS.find((c) => c.id === id) ?? MOCK_CONVERSATIONS[0];
    return ok(found);
  }
  if (pathname.match(/^\/api\/conversations\/[^/]+$/) && (method === 'PATCH' || method === 'DELETE')) {
    return ok({ ok: true });
  }
  if (pathname.match(/^\/api\/conversations\/[^/]+\/(branch|share|documents|image-message)$/)) {
    return ok({ ok: true });
  }

  // ─── newapi passthrough ────────────────────────────────────────────
  if (pathname.startsWith('/api/newapi/')) {
    const upstream = pathname.replace('/api/newapi', '');
    if (upstream === '/api/status') return ok(MOCK_STATUS);
    if (upstream === '/api/user/self') return ok(MOCK_USER);
    if (upstream === '/api/user/models') return ok(MOCK_MODELS);
    if (upstream === '/api/pricing') return ok({});
    if (upstream.startsWith('/api/token')) return ok({ items: [] });
    return ok(null);
  }

  // ─── conv-svc passthrough ──────────────────────────────────────────
  if (pathname.startsWith('/api/conv/')) {
    const upstream = pathname.replace('/api/conv', '');
    if (upstream === '/v1/models/overrides') return ok({ items: MOCK_MODEL_OVERRIDES });
    if (upstream === '/v1/health') return ok({ status: 'ok' });
    return ok(null);
  }

  // ─── Files (return 404 — files don't exist in mock) ────────────────
  if (pathname.startsWith('/api/files/')) {
    return NextResponse.json({ success: false, message: 'mock: file not available' }, { status: 404 });
  }

  // ─── Audio TTS / Video tasks (graceful 501) ────────────────────────
  if (pathname === '/api/audio/speech') {
    return NextResponse.json({ success: false, message: 'mock: TTS disabled' }, { status: 501 });
  }
  if (pathname.match(/^\/api\/files\/videos\//)) {
    return ok({ status: 'completed', progress: 100, video_url: null });
  }

  // ─── Health ────────────────────────────────────────────────────────
  if (pathname === '/api/health') {
    return ok({ status: 'ok', mock: true });
  }

  // ─── Fallback ──────────────────────────────────────────────────────
  return ok(null);
}
