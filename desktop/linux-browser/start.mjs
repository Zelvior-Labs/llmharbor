// Configure before importing the server: it loads dotenv at module scope.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [major, minor] = process.versions.node.split('.').map(Number);
if (!(major === 22 && minor >= 13 || major === 24)) {
  throw new Error('OSSLLMAPI requires Node.js 22.13+ (22.x) or 24.x with node:sqlite.');
}
process.umask(0o077);
const data = join(process.env.XDG_DATA_HOME || join(homedir(), '.local/share'), 'ossllmapi');
mkdirSync(data, { recursive: true, mode: 0o700 });
process.env.FREEAPI_DB_PATH ??= join(data, 'freeapi.db');
process.env.FREEAPI_ENV_PATH ??= join(data, '.env');
// A first run needs a persistent encryption key. Never overwrite an existing
// key file or silently generate a new key for an existing database.
if (!process.env.ENCRYPTION_KEY && !existsSync(process.env.FREEAPI_ENV_PATH) && !existsSync(process.env.FREEAPI_DB_PATH)) {
  writeFileSync(process.env.FREEAPI_ENV_PATH, `ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\n`, { flag: 'wx', mode: 0o600 });
}
process.env.NODE_ENV = 'production';
process.env.HOST ??= '127.0.0.1';
process.env.CLIENT_DIST = fileURLToPath(new URL('./dashboard/', import.meta.url));
await import('./server.mjs');
