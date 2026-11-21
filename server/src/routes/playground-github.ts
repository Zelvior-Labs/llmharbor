import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { getDb, getSetting, setSetting } from '../db/index.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import { proxyFetch } from '../lib/proxy.js';

// GitHub for the Playground agent, mounted under /api/playground/github behind
// the dashboard session gate.
//
// The dashboard's Content-Security-Policy only lets the page talk to its own
// origin (connect-src 'self'), so the browser cannot call api.github.com
// directly. This route is the relay: the user saves a personal access token
// once, it is stored encrypted like provider keys, and the agent's GitHub tool
// sends { method, path, body } here. The host is fixed to api.github.com (no
// URL is ever taken from the request), so this is not a general-purpose proxy.
// The token is never sent back to the browser.
//
// Outbound traffic goes through proxyFetch, so a configured outbound proxy
// applies to GitHub too.

export const playgroundGithubRouter = Router();

export const GITHUB_API = 'https://api.github.com';
export const GITHUB_TOKEN_SETTING = 'playground_github_token';
/** Largest upstream body relayed back (a repo zipball can be big). */
export const MAX_GITHUB_RESPONSE_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 60_000;

function readToken(): string | null {
  const raw = getSetting(GITHUB_TOKEN_SETTING);
  if (!raw) return null;
  try {
    const { encrypted, iv, authTag } = JSON.parse(raw) as { encrypted: string; iv: string; authTag: string };
    return decrypt(encrypted, iv, authTag);
  } catch {
    return null;
  }
}

function headers(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'LLMHarbor-Playground',
    ...extra,
  };
}

/**
 * A GitHub REST path: starts with one "/", no scheme or host, no "..", no
 * backslashes or whitespace. The query string is allowed.
 */
export function isSafeGithubPath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  if (path.length > 2048) return false;
  if (/[\s\\#]/.test(path)) return false;
  const pathname = path.split('?')[0];
  if (pathname.split('/').some(seg => seg === '..' || seg === '.')) return false;
  if (/%2e%2e|%2f|%5c/i.test(pathname)) return false;
  return true;
}

async function fetchUser(token: string): Promise<{ ok: true; login: string } | { ok: false; status: number; message: string }> {
  const res = await proxyFetch(`${GITHUB_API}/user`, { headers: headers(token), signal: AbortSignal.timeout(TIMEOUT_MS) }, 'github', 'unknown', TIMEOUT_MS);
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { message?: string } | null;
    return { ok: false, status: res.status, message: body?.message ?? `GitHub answered ${res.status}` };
  }
  const user = await res.json() as { login?: string };
  return { ok: true, login: user.login ?? '' };
}

playgroundGithubRouter.get('/', async (_req: Request, res: Response) => {
  const token = readToken();
  if (!token) {
    res.json({ connected: false });
    return;
  }
  try {
    const user = await fetchUser(token);
    if (user.ok) res.json({ connected: true, login: user.login });
    else res.json({ connected: true, login: null, error: user.message });
  } catch (err: any) {
    res.json({ connected: true, login: null, error: err?.message ?? 'GitHub is unreachable' });
  }
});

const TokenBody = z.object({ token: z.string().trim().min(1).max(512) });

playgroundGithubRouter.put('/', async (req: Request, res: Response) => {
  const parsed = TokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: '`token` is required', type: 'invalid_request_error' } });
    return;
  }
  try {
    const user = await fetchUser(parsed.data.token);
    if (!user.ok) {
      res.status(400).json({ error: { message: `GitHub rejected the token: ${user.message}`, type: 'invalid_request_error' } });
      return;
    }
    setSetting(GITHUB_TOKEN_SETTING, JSON.stringify(encrypt(parsed.data.token)));
    res.json({ connected: true, login: user.login });
  } catch (err: any) {
    res.status(502).json({ error: { message: `GitHub is unreachable: ${err?.message ?? 'unknown'}`, type: 'server_error' } });
  }
});

playgroundGithubRouter.delete('/', (_req: Request, res: Response) => {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run(GITHUB_TOKEN_SETTING);
  res.json({ connected: false });
});

const RelayBody = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  path: z.string().min(1),
  body: z.unknown().optional(),
});

playgroundGithubRouter.post('/request', async (req: Request, res: Response) => {
  const parsed = RelayBody.safeParse(req.body);
  if (!parsed.success || !isSafeGithubPath(parsed.data.path)) {
    res.status(400).json({ error: { message: 'A GitHub API path such as /user/repos is required', type: 'invalid_request_error' } });
    return;
  }
  const token = readToken();
  if (!token) {
    res.status(409).json({ error: { message: 'GitHub is not connected. Add a token in the Playground settings.', type: 'invalid_request_error', code: 'github_not_connected' } });
    return;
  }
  const { method, path, body } = parsed.data;
  const hasBody = body !== undefined && method !== 'GET';
  try {
    const upstream = await proxyFetch(`${GITHUB_API}${path}`, {
      method,
      headers: headers(token, hasBody ? { 'Content-Type': 'application/json' } : {}),
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }, 'github', 'unknown', TIMEOUT_MS);
    const declared = Number(upstream.headers.get('content-length') ?? 0);
    if (declared > MAX_GITHUB_RESPONSE_BYTES) {
      res.status(413).json({ error: { message: `GitHub response is larger than ${MAX_GITHUB_RESPONSE_BYTES / 1024 / 1024} MB`, type: 'invalid_request_error' } });
      return;
    }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes.length > MAX_GITHUB_RESPONSE_BYTES) {
      res.status(413).json({ error: { message: `GitHub response is larger than ${MAX_GITHUB_RESPONSE_BYTES / 1024 / 1024} MB`, type: 'invalid_request_error' } });
      return;
    }
    const contentType = upstream.headers.get('content-type') ?? '';
    if (contentType.includes('json')) {
      let data: unknown = null;
      try { data = bytes.length ? JSON.parse(bytes.toString('utf8')) : null; } catch { data = bytes.toString('utf8'); }
      res.json({ status: upstream.status, data });
    } else if (contentType.startsWith('text/')) {
      res.json({ status: upstream.status, data: bytes.toString('utf8') });
    } else {
      res.json({ status: upstream.status, contentType, base64: bytes.toString('base64') });
    }
  } catch (err: any) {
    res.status(502).json({ error: { message: `GitHub is unreachable: ${err?.message ?? 'unknown'}`, type: 'server_error' } });
  }
});
