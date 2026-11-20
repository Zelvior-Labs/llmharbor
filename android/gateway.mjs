// Runs inside the APK's libnode, in a dedicated foreground-service process.
import { channel } from 'node:diagnostics_channel';
import { randomBytes } from 'node:crypto';
import {
  appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';
import { getSetupCode } from '../server/src/lib/setup-code.ts';
import { getResetCode, resetCodeMatches } from '../server/src/lib/reset-code.ts';

process.umask(0o077);
if (!process.argv[2]) throw Error('Missing app data directory');
const home = resolve(process.argv[2]);
const lan = process.argv[3] === 'lan';
const eco = process.argv[4] === 'eco';
const FIRST_PORT = 31415;
const LAST_PORT = 31430;
const data = join(home, 'data');
mkdirSync(data, { recursive: true, mode: 0o700 });
process.chdir(data);

// Rotating log the launcher can export on the user's request. Codes and keys
// never reach it: only the server's own log lines, which are already scrubbed.
const logs = join(home, 'logs');
mkdirSync(logs, { recursive: true, mode: 0o700 });
const logFile = join(logs, 'gateway.log');
const LOG_LIMIT = 512 * 1024;
function record(line) {
  try {
    if (existsSync(logFile) && statSync(logFile).size > LOG_LIMIT) {
      renameSync(logFile, logFile + '.1');
      writeFileSync(logFile, '', { mode: 0o600 });
    }
    appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`, { mode: 0o600 });
  } catch { /* logging must never take the gateway down */ }
}
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    original(...args);
    record(`[${level}] ${format(...args)}`);
  };
}
process.on('uncaughtExceptionMonitor', error => record(`[fatal] ${error?.stack ?? error}`));

// The encryption key is unwrapped from the Android Keystore by GatewayService
// and handed over in the environment, so no plaintext key is written to disk.
// Host tests (no Android Keystore) still use the private file fallback.
const keyfile = join(data, '.encryption-key');
const db = join(data, 'freeapi.db');
let key = process.env.LLMHarbor_ENCRYPTION_KEY?.trim() ?? '';
if (key) {
  if (!/^[0-9a-f]{64}$/i.test(key)) throw Error('Malformed encryption key from the keystore');
  rmSync(keyfile, { force: true }); // Superseded by the Keystore-wrapped copy.
} else {
  if (!existsSync(keyfile)) {
    if (existsSync(db)) throw Error('Encryption key missing for existing data; refusing to replace it');
    const staging = keyfile + '.new';
    writeFileSync(staging, randomBytes(32).toString('hex'), { mode: 0o600, flush: true });
    renameSync(staging, keyfile);
  }
  key = readFileSync(keyfile, 'utf8').trim();
}

function lanAddresses() {
  const out = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) out.push(entry.address);
    }
  }
  return out;
}

function portFree(port, host) {
  return new Promise(ok => {
    const probe = createServer();
    probe.once('error', () => ok(false));
    probe.listen(port, host, () => probe.close(() => ok(true)));
  });
}

const host = lan ? '0.0.0.0' : '127.0.0.1';
let port = 0;
for (let candidate = FIRST_PORT; candidate <= LAST_PORT; candidate += 1) {
  if (await portFree(candidate, host)) { port = candidate; break; }
}
if (!port) throw Error(`No free port between ${FIRST_PORT} and ${LAST_PORT}`);

// Battery saver: a phone should not wake the radio every five minutes for a
// health sweep the user cannot see. Opt-in from the launcher.
if (eco) {
  process.env.HEALTH_CHECK_INTERVAL_MS ??= '900000';
  process.env.CATALOG_SYNC_DISABLED ??= '1';
  process.env.LLMHarbor_ECO = '1';
}

const addresses = lan ? lanAddresses() : [];
Object.assign(process.env, {
  HOME: home, NODE_ENV: 'production', ENCRYPTION_KEY: key,
  FREEAPI_DB_PATH: db, FREEAPI_ENV_PATH: '/dev/null', FREEAPI_DESKTOP: '0',
  HOST: host, PORT: String(port),
  ALLOWED_HOSTS: lan ? ['127.0.0.1', 'localhost', '::1', ...addresses].join(',') : '127.0.0.1',
  CLIENT_DIST: fileURLToPath(new URL('./dashboard/', import.meta.url)),
});

// Not an HTTP endpoint: other apps can reach loopback TCP but not this socket
// under our Android UID's filesDir. Stale sockets never report a live gateway.
const sock = join(home, 'control.sock');
const startedAt = Date.now();
const statusFile = join(home, 'status.json');
channel('llmharbor.listening').subscribe(({ port: actual }) => {
  record(`[gateway] listening on ${host}:${actual}${lan ? ' (LAN)' : ''}${eco ? ' (battery saver)' : ''}`);
  rmSync(sock, { force: true });
  createServer(socket => {
    socket.on('error', () => {}); // Launcher can close/resume at any time.
    const reset = getResetCode();
    socket.end(JSON.stringify({
      port: actual, arch: process.arch, node: process.versions.node,
      lan: addresses.map(address => `http://${address}:${actual}/`),
      setup: getSetupCode(), reset: reset && resetCodeMatches(reset) ? reset : null,
    }) + '\n');
  }).listen(sock);
  // A non-secret snapshot for the launcher: counts and health, never keys,
  // labels, codes or request contents.
  let db;
  const write = () => {
    if (!db) return;
    try {
      const keys = db.prepare("SELECT platform, status FROM api_keys WHERE enabled = 1").all();
      const healthy = keys.filter(key => key.status === 'healthy').length;
      const requests = db.prepare("SELECT COUNT(*) AS count FROM requests WHERE created_at >= datetime('now', '-1 day')").get();
      // 'unknown' means never checked, which is not a failure: an alert the
      // moment a key is added would train users to ignore it.
      const failing = keys.filter(key => key.status === 'invalid' || key.status === 'error').length;
      const snapshot = {
        version: process.env.FREEAPI_VERSION ?? '',
        port: actual, lan, eco, startedAt: new Date(startedAt).toISOString(),
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        providers: new Set(keys.map(key => key.platform)).size,
        keys: { enabled: keys.length, healthy, failing },
        requestsLastDay: Number(requests?.count ?? 0),
        allKeysFailing: keys.length > 0 && failing === keys.length,
      };
      const staging = statusFile + '.new';
      writeFileSync(staging, JSON.stringify(snapshot), { mode: 0o600 });
      renameSync(staging, statusFile);
    } catch { /* status is best effort */ }
  };
  // The database module is TypeScript: loading it is async, so the first
  // snapshot is written when it resolves rather than on the next tick.
  import('../server/src/db/index.ts')
    .then(module => { db = module.getDb(); write(); })
    .catch(() => {});
  setInterval(write, 20000).unref();
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => { try { rmSync(sock, { force: true }); } catch {} });
}

// Configure before the production server's dotenv, DB and port selection run.
await import('../server/src/index.ts');
