// Run on a fresh Windows test account, from a ZIP extracted outside the repo.
// The packaged app is launched normally, not through the build host's Electron.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { release } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const [directory, arch] = process.argv.slice(2);
assert.equal(process.platform, 'win32');
assert.ok(['x86', 'x64'].includes(arch));
const home = resolve(directory);
const exe = join(home, 'OSSLLMAPI.exe');
const profile = join(process.env.APPDATA, 'OSSLLMAPI-Win7');
assert.ok(!existsSync(profile), 'Use a fresh test account; refusing to touch an existing Win7 profile');
const config = JSON.parse(readFileSync(new URL('runtime.json', import.meta.url)));
const base = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
const version = `${base}-preview.${config.preview}`;
assert.ok(!existsSync(join(home, 'resources/app-update.yml')));
assert.ok(!existsSync(join(home, 'resources/app/node_modules')));
const probe = execFileSync(exe, ['-p', `JSON.stringify([process.arch, process.versions.electron,
  new (require('node:sqlite').DatabaseSync)(':memory:').prepare('SELECT 42 AS n').get().n])`], {
  cwd: home, encoding: 'utf8', timeout: 20000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
assert.deepEqual(JSON.parse(probe.trim()), [arch === 'x86' ? 'ia32' : arch, config.electron, 42]);

// Drive the *first launch* dashboard. The debugging socket is only enabled on
// this CI invocation on loopback; no test hooks or flags go into the product.
const listener = createServer().listen(0, '127.0.0.1');
await once(listener, 'listening');
const debugPort = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const child = spawn(exe, [`--remote-debugging-port=${debugPort}`, '--remote-debugging-address=127.0.0.1'], {
  cwd: home, stdio: 'ignore', env: { ...process.env, CATALOG_SYNC_DISABLED: '1', FREEAPI_UPDATE_FEED: 'http://127.0.0.1:1' },
});
let ws;
async function until(label, test) {
  const deadline = Date.now() + 60000;
  do {
    assert.equal(child.exitCode, null, `Packaged app exited before ${label}`);
    const value = await test();
    if (value) return value;
    await delay(300);
  } while (Date.now() < deadline);
  throw Error(`Timed out waiting for ${label}`);
}
try {
  const page = await until('first dashboard window', async () => {
    const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(2500) })
      .then(r => r.json()).catch(() => []);
    return pages.find(p => p.type === 'page' && p.url.startsWith('http://127.0.0.1:'));
  });
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await once(ws, 'open', { signal: AbortSignal.timeout(10000) });
  let id = 0;
  async function evaluate(expression) {
    ws.send(JSON.stringify({ id: ++id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
    const signal = AbortSignal.timeout(10000);
    while (true) {
      const [event] = await once(ws, 'message', { signal });
      const reply = JSON.parse(event.data);
      if (reply.id !== id) continue;
      assert.ok(!reply.error && !reply.result.exceptionDetails, 'Dashboard evaluation failed');
      return reply.result.result.value;
    }
  }
  await until('signed-in React dashboard', () => evaluate(`!!(window.__FREEAPI_DESKTOP__ && document.querySelector('#root nav'))`));
  const result = await evaluate(`(async () => {
    const session = localStorage.getItem('freellmapi_dashboard_token');
    const headers = { Authorization: 'Bearer ' + session };
    const { apiKey } = await (await fetch('/api/settings/api-key', { headers })).json();
    const models = await fetch('/v1/models', { headers: { Authorization: 'Bearer ' + apiKey } });
    return { shell: window.__FREEAPI_VERSION__, server: (await (await fetch('/api/settings/version', { headers })).json()).version,
      alive: (await fetch('/livez')).ok, api: models.status === 200 && Array.isArray((await models.json()).data),
      updater: await window.__FREEAPI_UPDATER__.check() };
  })()`);
  assert.deepEqual(result, { shell: version, server: version, alive: true, api: true, updater: { phase: 'unsupported', reason: 'package' } });
  await evaluate(`window.dispatchEvent(new Event('freellmapi:open-updates'))`);
  await until('manual Win7 download link', () => evaluate(`!!document.querySelector('a[href="https://github.com/zelvior/ossllmapi/releases?q=win7"]')`));
  assert.ok(statSync(join(profile, 'freeapi.db')).size > 0);
  assert.match(readFileSync(join(profile, '.encryption-key'), 'utf8').trim(), /^[0-9a-f]{64}$/);
  console.log(`Packaged ${arch} passed on NT ${release()}: Electron ${config.electron}, SQLite, signed-in dashboard, authenticated API, manual-only updates`);
} finally {
  ws?.close();
  if (child.pid && child.exitCode === null) execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
}
