// Bundles desktop/src/server-host.ts (and through it the whole server) into
// build/server.mjs. esbuild resolves the server's `.js`-suffixed TS imports
// and flattens the @ossllmapi/shared workspace symlink. Native better-sqlite3
// and sharp stay external and are packaged from desktop/node_modules.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const win7 = process.argv.includes('--win7');
const githubSha = process.env.GITHUB_SHA;
const hasBuildIdentity = /^[0-9a-f]{40}$/i.test(githubSha ?? '');

await build({
  entryPoints: [path.resolve(__dirname, '../src/server-host.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: path.resolve(__dirname, win7 ? '../dist-electron/windows7/build/server.mjs' : '../build/server.mjs'),
  external: ['better-sqlite3', 'sharp'],
  define: {
    // The Win7 runtime embeds SQLite but has no compatible native npm addons.
    ...(win7 && {
      'process.env.FREEAPI_SQLITE_DRIVER': JSON.stringify('node:sqlite'),
      'process.env.IMAGE_NORMALIZE': JSON.stringify('off'),
    }),
    'process.env.OSSLLMAPI_COMMIT_SHA': JSON.stringify(hasBuildIdentity ? githubSha : ''),
    'process.env.OSSLLMAPI_INSTALL_METHOD': JSON.stringify(hasBuildIdentity ? 'desktop' : ''),
  },
  // Some inlined CJS deps (express internals) reference `require` at runtime;
  // give the ESM bundle a working one.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
