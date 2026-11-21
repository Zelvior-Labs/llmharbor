// Print the download guide for a staged release directory as Markdown.
//   node desktop/scripts/release-notes.mjs <staged dir> <tag> <owner/repo>
// Every linked file must exist in the staged directory, so the guide can never
// point at a download the release does not have.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, tag, repo] = process.argv.slice(2);
assert.ok(dir && tag && repo, 'usage: release-notes.mjs <staged dir> <tag> <owner/repo>');
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(tag, `v${version}`);
const electronLegacy = JSON.parse(readFileSync(new URL('../win7/runtime.json', import.meta.url), 'utf8')).electron;
const base = `LLMHarbor-${version}`;
const link = (label, name) => {
  assert.ok(existsSync(join(dir, name)), `release notes link a missing file: ${name}`);
  return `[${label}](https://github.com/${repo}/releases/download/${tag}/${name})`;
};
const row = (system, ...files) => `| ${system} | ${files.map(([label, suffix]) => link(label, `${base}-${suffix}`)).join(' · ')} |`;

const rows = [
  row('**Windows 10 / 11** · 64-bit', ['Installer (.exe)', 'windows-x64-setup.exe'], ['Portable (.zip)', 'windows-x64-portable.zip']),
  row('**Windows 10 / 11** · 32-bit (x86)', ['Installer (.exe)', 'windows-x86-setup.exe'], ['Portable (.zip)', 'windows-x86-portable.zip']),
  row('**Windows 7 / 8 / 8.1** · 64-bit (win7 legacy edition)', ['Installer (.exe)', 'windows-legacy-x64-setup.exe'], ['Portable (.zip)', 'windows-legacy-x64-portable.zip']),
  row('**Windows 7 / 8 / 8.1** · 32-bit (win7 legacy edition)', ['Installer (.exe)', 'windows-legacy-x86-setup.exe'], ['Portable (.zip)', 'windows-legacy-x86-portable.zip']),
  row('**macOS** · Apple silicon', ['.dmg', 'macos-arm64.dmg'], ['.zip', 'macos-arm64.zip']),
  row('**macOS** · Intel', ['.dmg', 'macos-x64.dmg'], ['.zip', 'macos-x64.zip']),
  row('**Linux** · x64 desktop', ['AppImage', 'linux-x64.AppImage'], ['.deb', 'linux-x64.deb'], ['.rpm', 'linux-x64.rpm'], ['.tar.xz', 'linux-x64.tar.xz']),
  row('**Linux** · arm64 desktop', ['AppImage', 'linux-arm64.AppImage'], ['.deb', 'linux-arm64.deb'], ['.rpm', 'linux-arm64.rpm'], ['.tar.xz', 'linux-arm64.tar.xz']),
  row('**Linux Legacy** · x86 (32-bit), Node.js 18+', ['.deb', 'linux-legacy-x86.deb'], ['AppImage', 'linux-legacy-x86.AppImage'], ['Portable (.tar.gz)', 'linux-legacy-x86-portable.tar.gz']),
  row('**Linux Legacy** · x64, Node.js 18+', ['.deb', 'linux-legacy-x64.deb'], ['AppImage', 'linux-legacy-x64.AppImage'], ['Portable (.tar.gz)', 'linux-legacy-x64-portable.tar.gz']),
  row('**Android 8.0+** · arm64-v8a (most phones)', ['APK', 'android-arm64-v8a.apk']),
  row('**Android 8.0+** · armeabi-v7a (older and Android Go phones)', ['APK', 'android-armeabi-v7a.apk']),
  row('**Android 8.0+** · x86_64 (emulators, Chromebooks)', ['APK', 'android-x86_64.apk']),
];
assert.ok(existsSync(join(dir, 'SHA256SUMS.txt')));

console.log(`## Downloads

Pick the row that matches your system. \`SHA256SUMS.txt\` lists a checksum for every file.

| System | Files |
| --- | --- |
${rows.join('\n')}

- **Auto-update:** the Windows 10/11 installers, the macOS apps and the Linux desktop AppImages update themselves from the newest release. The portable ZIPs, the Linux desktop .deb, .rpm and .tar.xz, and the legacy editions are updated by hand.
- **Windows 7, 8 and 8.1** run on [Electron-Legacy ${electronLegacy}](https://github.com/Alex313031/electron-legacy), a community fork. The installer is per-user and needs no admin rights. Data is kept in \`%APPDATA%\\LLMHarbor-Win7\`. Updates are manual: install or extract the next legacy release. See [desktop/win7/README.md](https://github.com/${repo}/blob/${tag}/desktop/win7/README.md).
- **Linux Legacy** is the API server with the browser dashboard, not the Electron app. It needs Node.js 18 or newer on the PC. Run \`llmharbor-legacy\` (from the .deb), the AppImage, or \`./llmharbor-legacy\` in the extracted folder, then open http://127.0.0.1:3001. See [desktop/linux-browser/README.md](https://github.com/${repo}/blob/${tag}/desktop/linux-browser/README.md).
- **Android** will not install an APK built for a different CPU. Try \`arm64-v8a\` first, then \`armeabi-v7a\`. See [android/README.md](https://github.com/${repo}/blob/${tag}/android/README.md).`);
