import { build } from 'esbuild';

// The CLI's configuration writers use YAML, whose Node entry includes CJS
// dependencies. Give the bundled desktop ESM entry a real Node require.
const win7 = process.argv.includes('--win7');
await build({
  entryPoints: ['src/main.ts'], bundle: true, platform: 'node', format: 'esm', mainFields: ['module', 'main'],
  ...(win7 && { conditions: ['win7', 'module'] }),
  external: ['electron', 'electron-updater', './server.mjs'],
  outfile: win7 ? 'dist-electron/windows7/build/main.mjs' : 'build/main.mjs',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
