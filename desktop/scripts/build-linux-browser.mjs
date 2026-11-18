// Electron has no linux-ia32 build. Package the normal server entry and the
// already-built browser dashboard instead. No node_modules from the build host
// may land in this archive; the only runtime dependency is distro Node + SQLite.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { version } = JSON.parse(readFileSync(join(root, 'desktop/package.json'), 'utf8'));
const name = `OSSLLMAPI-${version}-linux-i686-server`;
const out = join(root, 'desktop/dist-electron/browser');
const temp = mkdtempSync(join(tmpdir(), 'ossllmapi-package-'));
const directory = join(temp, name);
try {
  mkdirSync(directory);
  await build({
    entryPoints: [join(root, 'server/src/index.ts')],
    outfile: join(directory, 'server.mjs'),
    bundle: true, platform: 'node', format: 'esm', target: 'node22',
    external: ['better-sqlite3', 'sharp'],
    define: {
      'process.env.FREEAPI_SQLITE_DRIVER': JSON.stringify('node:sqlite'),
      'process.env.IMAGE_NORMALIZE': JSON.stringify('off'),
      'process.env.FREEAPI_VERSION': JSON.stringify(version),
    },
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
    legalComments: 'linked',
  });
  cpSync(join(root, 'client/dist'), join(directory, 'dashboard'), { recursive: true });
  // Fail at build time if the dashboard wasn't actually built.
  readFileSync(join(directory, 'dashboard/index.html'));
  cpSync(join(root, 'desktop/linux-browser/start.mjs'), join(directory, 'start.mjs'));
  cpSync(join(root, 'desktop/linux-browser/README.md'), join(directory, 'README.md'));
  cpSync(join(root, 'LICENSE'), join(directory, 'LICENSE'));
  mkdirSync(out, { recursive: true });
  const archive = join(out, `${name}.tar.gz`);
  execFileSync('tar', ['-czf', archive, '-C', temp, name]);
  console.log(archive);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
