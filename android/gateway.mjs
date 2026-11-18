// Runs inside the APK's libnode, in a dedicated foreground-service process.
import { channel } from 'node:diagnostics_channel';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSetupCode } from '../server/src/lib/setup-code.ts';
import { getResetCode, resetCodeMatches } from '../server/src/lib/reset-code.ts';

process.umask(0o077);
const home = resolve(process.argv[2]); // Application.getFilesDir(); never external storage.
const data = join(home, 'data');
mkdirSync(data, { recursive: true, mode: 0o700 });
process.chdir(data);
const keyfile = join(data, '.encryption-key');
const db = join(data, 'freeapi.db');
if (!existsSync(keyfile)) {
  if (existsSync(db)) throw Error('Encryption key missing for existing data; refusing to replace it');
  const staging = keyfile + '.new';
  writeFileSync(staging, randomBytes(32).toString('hex'), { mode: 0o600, flush: true });
  renameSync(staging, keyfile);
}
Object.assign(process.env, {
  HOME: home, NODE_ENV: 'production', ENCRYPTION_KEY: readFileSync(keyfile, 'utf8').trim(),
  FREEAPI_DB_PATH: db, FREEAPI_ENV_PATH: '/dev/null', FREEAPI_DESKTOP: '0',
  HOST: '127.0.0.1', PORT: '31415', ALLOWED_HOSTS: '127.0.0.1',
  CLIENT_DIST: fileURLToPath(new URL('./dashboard/', import.meta.url)),
});

// Not an HTTP endpoint: other apps can reach loopback TCP but not this socket
// under our Android UID's filesDir. Stale sockets never report a live gateway.
channel('ossllmapi.listening').subscribe(({ port }) => {
  const address = join(home, 'control.sock');
  rmSync(address, { force: true });
  createServer(socket => {
    socket.on('error', () => {}); // Launcher can close/resume at any time.
    const reset = getResetCode();
    socket.end(JSON.stringify({ port, arch: process.arch, node: process.versions.node,
      setup: getSetupCode(), reset: reset && resetCodeMatches(reset) ? reset : null }) + '\n');
  }).listen(address);
});
// Configure before the production server's dotenv, DB and port selection run.
await import('../server/src/index.ts');
