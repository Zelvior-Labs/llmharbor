// Guards the `npm run cli -- <command>` wrapper that replaced `npx llmharbor`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrapper = path.join(repoRoot, 'scripts', 'cli.mjs');

function run(args, env = {}, unset = []) {
  const childEnv = { ...process.env, ...env };
  for (const key of unset) delete childEnv[key];
  return spawnSync(process.execPath, [wrapper, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: childEnv,
    timeout: 120_000,
  });
}

test('passes arguments through and keeps stdout clean', () => {
  const result = run(['list']);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.ok(lines.length > 5, 'expected the tool list');
  // Every line is a tool row: build chatter must not leak into stdout.
  for (const line of lines) assert.equal(line.split('\t').length, 3, `unexpected line: ${line}`);
  assert.ok(lines.some(line => line.startsWith('claude\t')));
});

test('forwards the exit code of a failing command', () => {
  const result = run(['no-such-command']);
  assert.notEqual(result.status, 0);
});

test('runs the CLI in the directory npm was invoked from (INIT_CWD)', () => {
  // `doctor claude` reads <cwd>/.claude/settings.json and names the file it
  // got the base URL from. Point it at a closed port so it fails fast.
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'llmharbor-cwd-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'llmharbor-home-'));
  try {
    const settings = path.join(project, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settings));
    fs.writeFileSync(settings, JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:9/' } }));
    const result = run(
      ['doctor', 'claude'],
      { INIT_CWD: project, HOME: home, USERPROFILE: home },
      ['ANTHROPIC_BASE_URL', 'CLAUDE_CONFIG_DIR'],
    );
    const output = result.stdout + result.stderr;
    assert.ok(output.includes(settings), `doctor did not read ${settings}:\n${output}`);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});
