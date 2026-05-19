// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ensureSameOrigin } from './bff';

function req(method: string, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3001/api/auth/login', {
    method,
    headers,
  });
}

describe('ensureSameOrigin', () => {
  it('lets safe methods through without checking Origin', () => {
    expect(ensureSameOrigin(req('GET'))).toBeNull();
    expect(ensureSameOrigin(req('HEAD'))).toBeNull();
  });

  it('blocks unsafe methods missing Origin', async () => {
    const res = ensureSameOrigin(req('POST'));
    expect(res?.status).toBe(403);
    const j = await res!.json();
    expect(j.message).toMatch(/missing Origin/i);
  });

  it('allows the configured app origin in dev', () => {
    // process.env.NODE_ENV is readonly under Next's TS env; cast to bypass.
    (process.env as Record<string, string>).NODE_ENV = 'development';
    expect(
      ensureSameOrigin(req('POST', { origin: 'http://localhost:3001' })),
    ).toBeNull();
  });

  it('rejects mismatched origins', async () => {
    const res = ensureSameOrigin(
      req('POST', { origin: 'https://evil.example.com' }),
    );
    expect(res?.status).toBe(403);
    const j = await res!.json();
    expect(j.message).toMatch(/not allowed/);
  });
});
