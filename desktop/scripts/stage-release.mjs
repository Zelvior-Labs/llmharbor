// Stage ONLY the named, versioned release set, under its final public names.
// A glob matching one ZIP is not evidence that its installer, the other
// architecture or its feed was built, so every expected file is listed here.
//
//   node desktop/scripts/stage-release.mjs <downloaded artifacts dir> <out dir>
//
// Files referenced by an auto-update feed (latest*.yml) keep the exact name
// electron-builder wrote into the feed; everything else is renamed to the
// LLMHarbor-<version>-<platform>-<arch>[-<kind>].<ext> scheme. SHA256SUMS.txt
// covers every staged file.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { linkSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { hashFile } from './refresh-mac-update-metadata.mjs';

const [artifacts, out] = process.argv.slice(2);
const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const { version } = json('../package.json');
// The Android and Windows 7/8/8.1 editions carry a preview suffix internally.
const androidVersion = `${version}-preview.${json('../../android/version.json').preview}`;
const legacyWinVersion = `${version}-preview.${json('../win7/runtime.json').preview}`;
const base = `LLMHarbor-${version}`;
mkdirSync(out); // Never publish leftovers from an older staging directory.

// stage(group, name) keeps the name; stage(group, [source, target]) renames.
function stage(group, ...files) {
  for (const file of files) {
    const [name, target] = Array.isArray(file) ? file : [file, file];
    const source = join(artifacts, group, name);
    const stat = statSync(source);
    assert.ok(stat.isFile() && stat.size > 0, `Empty or missing: ${source}`);
    linkSync(source, join(out, target)); // on the same CI filesystem; collisions fail
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

// Windows 10/11 (Electron): installers feed the updater, ZIPs are portable.
for (const [arch, group, feed] of [['x64', 'windows-installer', 'latest.yml'], ['x86', 'windows-installer-ia32', 'latest-ia32.yml']]) {
  const stem = `${base}-windows-${arch}`;
  const exe = `${stem}-setup.exe`;
  stage(group, exe, `${exe}.blockmap`, [`${stem}.zip`, `${stem}-portable.zip`], feed);
  verifyFeed(feed, [exe], [exe]);
}

// Windows 7/8/8.1 (Electron-Legacy): manual updates only, no feed.
for (const arch of ['x86', 'x64']) {
  const stem = `LLMHarbor-${legacyWinVersion}-windows7-${arch}`;
  stage(`win7-${arch}`,
    [`${stem}.zip`, `${base}-windows-legacy-${arch}-portable.zip`],
    [`${stem}-setup.exe`, `${base}-windows-legacy-${arch}-setup.exe`]);
}

// macOS: both architectures; the ZIPs are the updater's payloads.
for (const arch of ['x64', 'arm64']) {
  for (const ext of ['dmg', 'zip']) {
    const name = `${base}-macos-${arch}.${ext}`;
    stage(`macos-installer-${arch}`, name, `${name}.blockmap`);
  }
}
// macos-release already verified both architectures' final hashes and sizes.
// Do NOT upload either platform job's individual latest-mac.yml.
stage('macos-update-metadata', 'latest-mac.yml');

// Linux desktop (Electron): x64 and arm64, each with its own update feed.
for (const [arch, group, feed] of [['x64', 'linux-installer', 'latest-linux.yml'], ['arm64', 'linux-installer-arm64', 'latest-linux-arm64.yml']]) {
  const files = ['AppImage', 'tar.xz', 'deb', 'rpm'].map(ext => `${base}-linux-${arch}.${ext}`);
  stage(group, ...files, feed);
  verifyFeed(feed, files, [files[0]]);
}

// Linux Legacy (server + browser dashboard on the system's Node.js 18+).
for (const arch of ['x86', 'x64']) {
  const stem = `${base}-linux-legacy-${arch}`;
  stage('linux-legacy', `${stem}.deb`, `${stem}.AppImage`, `${stem}-portable.tar.gz`);
}

// Android: one APK per ABI, under the release version.
for (const abi of ['armeabi-v7a', 'arm64-v8a', 'x86_64']) {
  stage('android-apks', [`LLMHarbor-${androidVersion}-android-${abi}.apk`, `${base}-android-${abi}.apk`]);
}

const sums = readdirSync(out).sort().map(name => {
  const digest = createHash('sha256').update(readFileSync(join(out, name))).digest('hex');
  return `${digest}  ${name}\n`;
});
writeFileSync(join(out, 'SHA256SUMS.txt'), sums.join(''));
console.log(`Staged ${sums.length} files + SHA256SUMS.txt for ${base}`);
