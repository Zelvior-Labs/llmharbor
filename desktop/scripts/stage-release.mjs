// Stage ONLY the named, versioned release set. A glob matching one ZIP is not
// evidence that its installer, the other architecture or its feed was built.
import assert from 'node:assert/strict';
import { linkSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { hashFile } from './refresh-mac-update-metadata.mjs';

const [artifacts, out] = process.argv.slice(2);
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const base = `OSSLLMAPI-${version}`;
mkdirSync(out); // Never publish leftovers from an older staging directory.
function stage(group, ...files) {
  for (const name of files) {
    const source = join(artifacts, group, name);
    const stat = statSync(source);
    assert.ok(stat.isFile() && stat.size > 0, `Empty or missing: ${source}`);
    linkSync(source, join(out, name)); // on the same CI filesystem; collisions fail
  }
}
function verifyFeed(name, allowed, required) {
  const feed = yaml.load(readFileSync(join(out, name), 'utf8'));
  assert.equal(feed.version, version, name);
  for (const target of required) assert.ok(feed.files.some(f => f.url === target), `${name} omits ${target}`);
  for (const file of feed.files) {
    assert.ok(allowed.includes(file.url), `${name} points to unexpected ${file.url}`);
    const path = join(out, file.url);
    if (file.size !== undefined) assert.equal(file.size, statSync(path).size, file.url);
    assert.equal(file.sha512, hashFile(path), file.url);
  }
  assert.ok(feed.files.some(f => f.url === feed.path && f.sha512 === feed.sha512), `${name}: stale legacy fields`);
}

for (const [arch, group, feed] of [['x64', 'windows-installer', 'latest.yml'], ['x86', 'windows-installer-ia32', 'latest-ia32.yml']]) {
  const stem = `${base}-windows-${arch}`;
  const exe = `${stem}-setup.exe`;
  stage(group, exe, `${exe}.blockmap`, `${stem}.zip`, feed);
  verifyFeed(feed, [exe], [exe]);
}
const linux = ['AppImage', 'tar.xz', 'deb', 'rpm'].map(ext => `${base}-linux-x64.${ext}`);
stage('linux-installer', ...linux, 'latest-linux.yml');
verifyFeed('latest-linux.yml', linux, [linux[0]]);
stage('linux-i686-server', `${base}-linux-i686-server.tar.gz`);
for (const arch of ['x64', 'arm64']) {
  for (const ext of ['dmg', 'zip']) {
    const name = `${base}-macos-${arch}.${ext}`;
    stage(`macos-installer-${arch}`, name, `${name}.blockmap`);
  }
}
// macos-release already verified both architectures' final hashes and sizes.
// Do NOT upload either platform job's individual latest-mac.yml.
stage('macos-update-metadata', 'latest-mac.yml');
