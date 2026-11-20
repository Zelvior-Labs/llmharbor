// Run with the extracted ZIP's LLMHarbor.exe, outside the build tree, so
// missing native dependencies can't resolve from desktop/node_modules. The
// x64 CI host can launch either architecture; check which one we shipped.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';

assert.ok(process.versions.electron);
assert.equal(process.platform, 'win32');
assert.equal(process.arch, 'ia32');
const resources = join(dirname(process.execPath), 'resources');
const requireApp = createRequire(join(resources, 'app.asar/package.json'));
const db = requireApp('better-sqlite3')(':memory:');
assert.equal(db.prepare('SELECT 1').pluck().get(), 1);
db.close();
assert.ok(requireApp('sharp').versions.vips);

const { version } = requireApp('./package.json');
const installer = `LLMHarbor-${version}-windows-x86-setup.exe`;
const [dist] = process.argv.slice(2);
const { owner, repo, channel } = yaml.load(readFileSync(join(resources, 'app-update.yml'), 'utf8'));
assert.equal(`${owner}/${repo}`, 'zelvior/llmharbor');
assert.equal(channel, 'latest-ia32');
const manifest = yaml.load(readFileSync(join(dist, `${channel}.yml`), 'utf8'));
assert.deepEqual(manifest.files.map(file => file.url), [installer]);
assert.equal(statSync(join(dist, installer)).size, manifest.files[0].size);
assert.ok(statSync(join(dist, `${installer}.blockmap`)).isFile());
console.log('Windows x86 package passed: Electron, SQLite, sharp, installer, ZIP and update feed');
