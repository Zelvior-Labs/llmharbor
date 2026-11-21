#!/usr/bin/env node
// Runs the in-repo CLI without publishing it anywhere:
//
//   npm run cli -- setup-claude --url http://localhost:3001
//
// The CLI is not on npm, so `npx llmharbor ...` does not work. Do not
// reintroduce it: the name is unclaimed, and npx would run whatever a
// stranger publishes under it.
//
// What this wrapper adds over a bare `node cli/dist/index.js`:
//   - builds cli/dist first when it is missing or older than cli/src, so a
//     fresh clone or a `git pull` never runs stale code;
//   - runs the CLI in the directory npm was invoked from (INIT_CWD), not the
//     repo root that `npm run` switches to. `launch` starts Claude Code in that
//     directory and `doctor` reads project-level .claude/ settings from it, so
//     `npm --prefix ~/llmharbor run cli -- launch` works from any project.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliDir = path.join(repoRoot, 'cli');
const entry = path.join(cliDir, 'dist', 'index.js');

function newestSourceMtime(dir) {
  let newest = 0;
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      if (dirent.name !== '__snapshots__') newest = Math.max(newest, newestSourceMtime(full));
    } else if (dirent.name.endsWith('.ts') && !dirent.name.endsWith('.test.ts')) {
      newest = Math.max(newest, fs.statSync(full).mtimeMs);
    }
  }
  return newest;
}

function needsBuild() {
  if (!fs.existsSync(entry)) return true;
  return newestSourceMtime(path.join(cliDir, 'src')) > fs.statSync(entry).mtimeMs;
}

if (needsBuild()) {
  if (!fs.existsSync(path.join(repoRoot, 'node_modules'))) {
    process.stderr.write('llmharbor: dependencies are not installed. Run `npm install` in the repo first.\n');
    process.exit(1);
  }
  process.stderr.write('llmharbor: building the CLI...\n');
  // Build output goes to stderr so stdout stays clean for commands like `list`.
  const build = spawnSync('npm', ['run', 'build', '-w', 'cli', '--silent'], {
    cwd: repoRoot,
    stdio: ['ignore', 2, 2],
    shell: process.platform === 'win32',
  });
  if (build.status !== 0) {
    process.stderr.write('llmharbor: building the CLI failed (see above).\n');
    process.exit(build.status ?? 1);
  }
}

const cwd = process.env.INIT_CWD && fs.existsSync(process.env.INIT_CWD) ? process.env.INIT_CWD : process.cwd();
const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], { cwd, stdio: 'inherit' });

// Ctrl-C reaches the CLI directly (same process group); stay alive until it
// exits so its exit code is the one npm reports.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {});
}

child.on('error', error => {
  process.stderr.write(`llmharbor: could not start the CLI: ${error.message}\n`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) {
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
