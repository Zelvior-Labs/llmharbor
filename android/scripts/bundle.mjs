import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const json = name => JSON.parse(readFileSync(join(root, name), 'utf8'));
const preview = json('android/version.json').preview;
const version = `${json('desktop/package.json').version}-preview.${preview}`;
const dest = join(root, 'android/build/assets/gateway');
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(join(root, 'android/build/dashboard'), join(dest, 'dashboard'), { recursive: true });
readFileSync(join(dest, 'dashboard/index.html'));
await build({
  entryPoints: [join(root, 'android/gateway.mjs')], outfile: join(dest, 'gateway.mjs'),
  bundle: true, platform: 'node', target: 'node24', format: 'esm', legalComments: 'linked',
  external: ['better-sqlite3', 'sharp'],
  define: {
    'process.env.OSSLLMAPI_ANDROID_APP': '"1"', 'process.env.FREEAPI_VERSION': JSON.stringify(version),
    'process.env.FREEAPI_SQLITE_DRIVER': '"node:sqlite"', 'process.env.IMAGE_NORMALIZE': '"off"',
  },
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
