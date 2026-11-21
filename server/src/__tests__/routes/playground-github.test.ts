import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { Express } from 'express';

// GitHub relay for the Playground agent. proxyFetch is replaced so no request
// leaves the machine; each test scripts what "GitHub" answers.
const upstream = vi.hoisted(() => ({
  calls: [] as { url: string; init?: RequestInit }[],
  respond: (_url: string, _init?: RequestInit): Response => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
}));

vi.mock('../../lib/proxy.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/proxy.js')>();
  return {
    ...actual,
    proxyFetch: vi.fn(async (url: string, init?: RequestInit) => {
      upstream.calls.push({ url, init });
      return upstream.respond(url, init);
    }),
  };
});

import { createApp } from '../../app.js';
import { initDb, getSetting, getDb } from '../../db/index.js';
import { mintDashboardToken } from '../helpers/auth.js';
import { GITHUB_TOKEN_SETTING, isSafeGithubPath } from '../../routes/playground-github.js';

async function request(app: Express, method: string, path: string, opts: { body?: unknown; token?: string } = {}) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as any;
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const body = await res.json().catch(() => null);
  const csp = res.headers.get('content-security-policy');
  server.close();
  return { status: res.status, body, csp };
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

describe('playground GitHub relay', () => {
  let app: Express;
  let dash: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    dash = mintDashboardToken('github@example.com');
  });

  beforeEach(() => {
    upstream.calls = [];
    getDb().prepare('DELETE FROM settings WHERE key = ?').run(GITHUB_TOKEN_SETTING);
    upstream.respond = (url) => url.endsWith('/user') ? json({ login: 'octocat' }) : json({ ok: true });
  });

  it('requires a dashboard session', async () => {
    expect((await request(app, 'GET', '/api/playground/github')).status).toBe(401);
    expect((await request(app, 'POST', '/api/playground/github/request', { body: { path: '/user' } })).status).toBe(401);
  });

  it('reports not connected before a token is saved', async () => {
    const res = await request(app, 'GET', '/api/playground/github', { token: dash });
    expect(res.body).toEqual({ connected: false });
  });

  it('validates the token with GitHub and stores it encrypted', async () => {
    const res = await request(app, 'PUT', '/api/playground/github', { token: dash, body: { token: 'ghp_secret123' } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connected: true, login: 'octocat' });
    const stored = getSetting(GITHUB_TOKEN_SETTING)!;
    expect(stored).toBeTruthy();
    expect(stored).not.toContain('ghp_secret123');
    const sentAuth = (upstream.calls[0].init?.headers as Record<string, string>).Authorization;
    expect(sentAuth).toBe('Bearer ghp_secret123');

    const status = await request(app, 'GET', '/api/playground/github', { token: dash });
    expect(status.body).toEqual({ connected: true, login: 'octocat' });
    expect(JSON.stringify(status.body)).not.toContain('ghp_secret123');
  });

  it('refuses a token GitHub rejects', async () => {
    upstream.respond = () => json({ message: 'Bad credentials' }, 401);
    const res = await request(app, 'PUT', '/api/playground/github', { token: dash, body: { token: 'nope' } });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Bad credentials');
    expect(getSetting(GITHUB_TOKEN_SETTING)).toBeUndefined();
  });

  it('relays requests to api.github.com only once connected', async () => {
    const before = await request(app, 'POST', '/api/playground/github/request', { token: dash, body: { path: '/user/repos' } });
    expect(before.status).toBe(409);
    expect(before.body.error.code).toBe('github_not_connected');

    await request(app, 'PUT', '/api/playground/github', { token: dash, body: { token: 'ghp_x' } });
    upstream.calls = [];
    upstream.respond = () => json([{ full_name: 'octocat/hello' }]);
    const res = await request(app, 'POST', '/api/playground/github/request', { token: dash, body: { method: 'POST', path: '/user/repos?per_page=5', body: { name: 'demo' } } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 200, data: [{ full_name: 'octocat/hello' }] });
    expect(upstream.calls[0].url).toBe('https://api.github.com/user/repos?per_page=5');
    expect(upstream.calls[0].init?.method).toBe('POST');
    expect(upstream.calls[0].init?.body).toBe(JSON.stringify({ name: 'demo' }));
  });

  it('passes upstream error statuses through and base64-encodes binary bodies', async () => {
    await request(app, 'PUT', '/api/playground/github', { token: dash, body: { token: 'ghp_x' } });
    upstream.respond = () => json({ message: 'Not Found' }, 404);
    const missing = await request(app, 'POST', '/api/playground/github/request', { token: dash, body: { path: '/repos/a/b' } });
    expect(missing.body).toEqual({ status: 404, data: { message: 'Not Found' } });

    upstream.respond = () => new Response(new Uint8Array([80, 75, 3, 4]), { status: 200, headers: { 'content-type': 'application/zip' } });
    const zip = await request(app, 'POST', '/api/playground/github/request', { token: dash, body: { path: '/repos/a/b/zipball/main' } });
    expect(zip.body).toEqual({ status: 200, contentType: 'application/zip', base64: Buffer.from([80, 75, 3, 4]).toString('base64') });
  });

  it('rejects paths that could leave api.github.com', async () => {
    await request(app, 'PUT', '/api/playground/github', { token: dash, body: { token: 'ghp_x' } });
    upstream.calls = [];
    for (const path of ['//evil.com/x', 'https://evil.com', '/repos/../../x', '/a\\b', '/a%2e%2e/b', 'user']) {
      const res = await request(app, 'POST', '/api/playground/github/request', { token: dash, body: { path } });
      expect(res.status, path).toBe(400);
    }
    expect(upstream.calls).toHaveLength(0);
  });

  it('disconnects', async () => {
    await request(app, 'PUT', '/api/playground/github', { token: dash, body: { token: 'ghp_x' } });
    const res = await request(app, 'DELETE', '/api/playground/github', { token: dash });
    expect(res.body).toEqual({ connected: false });
    expect(getSetting(GITHUB_TOKEN_SETTING)).toBeUndefined();
  });

  it('isSafeGithubPath accepts ordinary REST paths', () => {
    expect(isSafeGithubPath('/repos/octocat/hello/contents/src/a.ts?ref=main')).toBe(true);
    expect(isSafeGithubPath('/search/repositories?q=llm+proxy')).toBe(true);
    expect(isSafeGithubPath('/repos/a/b/contents/.github/workflows/ci.yml')).toBe(true);
  });

  it('lets the dashboard preview blob: images and media', async () => {
    const res = await request(app, 'GET', '/api/playground/github', { token: dash });
    expect(res.csp).toMatch(/img-src 'self' data: blob:/);
    expect(res.csp).toMatch(/media-src 'self' blob:/);
    expect(res.csp).toMatch(/connect-src 'self'(;|$)/);
  });
});
