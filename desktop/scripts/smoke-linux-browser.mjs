// Exercise the files extracted from the release archive, not a source checkout.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const [directory, expectedArch] = process.argv.slice(2);
assert.equal(process.platform, 'linux');
assert.equal(process.arch, expectedArch); // CI requires ia32, never an x64 simulation
const data = mkdtempSync(join(tmpdir(), 'ossllmapi-smoke-'));
const base = 'http://127.0.0.1:30481';
const child = spawn(process.execPath, [resolve(directory, 'start.mjs')], {
  cwd: data,
  env: { PATH: process.env.PATH, HOME: data, XDG_DATA_HOME: data, PORT: '30481', CATALOG_SYNC_DISABLED: '1' },
  stdio: ['ignore', 'inherit', 'inherit'],
});
const exited = once(child, 'exit');
try {
  let ready = false;
  for (let i = 0; i < 100 && child.exitCode === null; i++) {
    if (await fetch(`${base}/livez`).then(r => r.ok, () => false)) { ready = true; break; }
    await delay(200);
  }
  assert.ok(ready, 'packaged server did not start');
  const page = await (await fetch(base)).text();
  assert.match(page, /<title>OSSLLMAPI/);
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
  assert.ok(statSync(join(data, 'ossllmapi/freeapi.db')).size > 0);
  assert.equal(statSync(join(data, 'ossllmapi/.env')).mode & 0o777, 0o600);
  console.log(`Packaged linux-${process.arch} Node ${process.versions.node}: SQLite, dashboard, login and /v1/models passed`);
} finally {
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
  await exited;
  clearTimeout(timer);
  rmSync(data, { recursive: true, force: true });
}
