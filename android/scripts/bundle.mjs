import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
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
// Source maps and editor droppings only inflate the APK.
function prune(dir) {
  for (const entry of readdirSync(dir)) {
    const target = join(dir, entry);
    if (statSync(target).isDirectory()) { prune(target); continue; }
    if (entry.endsWith('.map') || entry === '.DS_Store') rmSync(target, { force: true });
  }
}
prune(join(dest, 'dashboard'));
await build({
  entryPoints: [join(root, 'android/gateway.mjs')], outfile: join(dest, 'gateway.mjs'),
  bundle: true, platform: 'node', target: 'node24', format: 'esm', legalComments: 'linked',
  external: ['better-sqlite3', 'sharp'],
  define: {
    'process.env.LLMHarbor_ANDROID_APP': '"1"', 'process.env.FREEAPI_VERSION': JSON.stringify(version),
    'process.env.FREEAPI_SQLITE_DRIVER': '"node:sqlite"',
    // No libvips on a phone, so the pure-JS path resizes; 1568 is the cap the
    // strictest vision provider applies anyway.
    'process.env.IMAGE_NORMALIZE_MAX_DIMENSION': '"1568"',
  },
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
