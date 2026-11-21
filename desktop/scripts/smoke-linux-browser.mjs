// Exercise the files extracted from the release archive, not a source checkout.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const [directory, expectedArch] = process.argv.slice(2);
assert.equal(process.platform, 'linux');
assert.equal(process.arch, expectedArch); // CI requires ia32, never an x64 simulation
const data = mkdtempSync(join(tmpdir(), 'llmharbor-smoke-'));
const base = 'http://127.0.0.1:30481';
// SMOKE_LAUNCHER exercises a packaged entry point (the .deb's
// /usr/bin/llmharbor-legacy or an AppImage) instead of `node start.mjs`; both
// resolve `node` from PATH, which is this same runtime.
const launcher = process.env.SMOKE_LAUNCHER;
const [command, args] = launcher ? [resolve(launcher), []] : [process.execPath, [resolve(directory, 'start.mjs')]];
const env = { PATH: `${dirname(process.execPath)}:${process.env.PATH}`, HOME: data, XDG_DATA_HOME: data, PORT: '30481', CATALOG_SYNC_DISABLED: '1' };
if (launcher?.endsWith('.AppImage')) env.APPIMAGE_EXTRACT_AND_RUN = '1'; // no FUSE in CI
// Own process group: an AppImage's runtime does not forward SIGTERM to the
// server it started, so stop the whole group like a terminal's Ctrl+C would.
const child = spawn(command, args, {
  cwd: data,
  env,
  detached: true,
  stdio: ['ignore', 'inherit', 'inherit'],
});
const stop = signal => { try { process.kill(-child.pid, signal); } catch { /* already gone */ } };
const exited = once(child, 'exit');
try {
  let ready = false;
  for (let i = 0; i < 100 && child.exitCode === null; i++) {
    if (await fetch(`${base}/livez`).then(r => r.ok, () => false)) { ready = true; break; }
    await delay(200);
  }
  assert.ok(ready, 'packaged server did not start');
  const page = await (await fetch(base)).text();
  assert.match(page, /<title>LLMHarbor/);
  const script = /<script[^>]+src="(\/assets\/[^"\s]+\.js)"/.exec(page);
  assert.ok(script && (await fetch(base + script[1])).headers.get('content-type')?.includes('javascript'));
  const signup = await fetch(`${base}/api/auth/setup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'smoke@example.org', password: 'local-test-only' }),
  });
  assert.equal(signup.status, 201);
  const { token } = await signup.json();
  const { apiKey } = await (await fetch(`${base}/api/settings/api-key`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const models = await fetch(`${base}/v1/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  assert.equal(models.status, 200);
  assert.ok(Array.isArray((await models.json()).data));
  assert.ok(statSync(join(data, 'llmharbor/freeapi.db')).size > 0);
  assert.equal(statSync(join(data, 'llmharbor/.env')).mode & 0o777, 0o600);
  console.log(`Packaged linux-${process.arch} ${launcher ?? 'portable'} on Node ${process.versions.node}: SQLite, dashboard, login and /v1/models passed`);
} finally {
  stop('SIGTERM');
  const timer = setTimeout(() => stop('SIGKILL'), 5_000);
  await exited;
  clearTimeout(timer);
  // The next check reuses the port: wait until nothing in the group still serves it.
  for (let i = 0; i < 50 && await fetch(`${base}/livez`).then(() => true, () => false); i++) {
    if (i === 25) stop('SIGKILL');
    await delay(200);
  }
  rmSync(data, { recursive: true, force: true });
}
