// Electron has no linux-ia32 build. Package the normal server entry and the
// already-built browser dashboard instead. No native npm addons from the build
// host may land in this archive; the only runtime dependencies are distro Node
// and the bundled pure-WebAssembly SQLite (node-sqlite3-wasm), so the bundle
// runs on any Node.js 18+ without node:sqlite.
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
    bundle: true, platform: 'node', format: 'esm', target: 'node18',
    // node-sqlite3-wasm is pure JS+WASM with direct fs access; ship it as real
    // files (not bundled) so its Emscripten glue loads its .wasm natively.
    // better-sqlite3/sharp are native and intentionally absent (WASM driver +
    // image-normalize off), so they are external and never resolved at runtime.
    external: ['better-sqlite3', 'sharp', 'node-sqlite3-wasm'],
    define: {
      'process.env.FREEAPI_SQLITE_DRIVER': JSON.stringify('wasm'),
      'process.env.IMAGE_NORMALIZE': JSON.stringify('off'),
      'process.env.FREEAPI_VERSION': JSON.stringify(version),
    },
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
    legalComments: 'linked',
  });
  // Ship the WASM SQLite driver so server.mjs can require() it at runtime.
  cpSync(join(root, 'node_modules/node-sqlite3-wasm'), join(directory, 'node_modules/node-sqlite3-wasm'), { recursive: true });
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
