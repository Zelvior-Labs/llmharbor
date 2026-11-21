import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The updater downloads the file latest*.yml names from the GitHub release.
// GitHub rewrites spaces in an uploaded asset's name to dots while
// electron-builder writes them into the manifest as dashes, so any installer
// name with a space is one the updater can never fetch (v0.13.4's
// "OSLLMAPI.Setup.0.13.4.exe" vs latest.yml's "OSLLMAPI-Setup-0.13.4.exe").

const yaml = createRequire(import.meta.url)('js-yaml');
const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const config = yaml.load(readFileSync(join(desktopRoot, 'electron-builder.yml'), 'utf8')) as Record<string, any>;

function expand(template: string, arch = 'x64', ext = 'exe'): string {
  return template
    .replace('${productName}', config.productName)
    .replace('${version}', '1.2.3')
    .replace('${arch}', arch)
    .replace('${ext}', ext);
}

describe('updater artifact names', () => {
  it('gives every auto-updatable target a name without spaces', () => {
    for (const section of ['nsis', 'mac', 'appImage']) {
      const template = config[section]?.artifactName ?? config.artifactName;
      if (section === 'appImage' && !template) continue; // default "${productName}-${version}.${ext}"
      expect(template, section).toBeTypeOf('string');
      expect(expand(template), section).not.toMatch(/\s/);
    }
  });

  it('uses the fork identity and release repository', () => {
    expect(config.appId).toBe('io.github.zelvior.llmharbor');
    expect(config.productName).toBe('LLMHarbor');
    expect(config.publish).toMatchObject({ provider: 'github', owner: 'zelvior', repo: 'llmharbor' });
  });

  it('separates the Windows installers, ZIPs and feeds by architecture', () => {
    const x86 = yaml.load(readFileSync(join(desktopRoot, 'electron-builder.ia32.yml'), 'utf8'));
    expect(x86.publish.channel).toBe('latest-ia32');
    expect(expand(x86.nsis.artifactName, 'ia32')).toBe('LLMHarbor-1.2.3-windows-x86-setup.exe');
    expect(expand(x86.win.artifactName, 'ia32', 'zip')).toBe('LLMHarbor-1.2.3-windows-x86.zip');
    expect(expand(config.win.artifactName, 'x64', 'zip')).toBe('LLMHarbor-1.2.3-windows-x64.zip');
    expect(expand(config.nsis.artifactName)).toBe('LLMHarbor-1.2.3-windows-x64-setup.exe');
  });

  it('names the Linux arm64 desktop files by architecture in their own folder', () => {
    const arm = yaml.load(readFileSync(join(desktopRoot, 'electron-builder.arm64.yml'), 'utf8'));
    expect(arm.extends).toBe('./electron-builder.yml');
    expect(arm.directories.output).toBe('dist-electron/arm64');
    expect(expand(arm.linux.artifactName, 'arm64', 'AppImage')).toBe('LLMHarbor-1.2.3-linux-arm64.AppImage');
  });

  it.each(['arm64', 'x64'])('identifies macOS %s downloads by platform and architecture', (arch) => {
    for (const ext of ['zip', 'dmg']) {
      expect(expand(config.mac.artifactName, arch, ext)).toBe(`LLMHarbor-1.2.3-macos-${arch}.${ext}`);
    }
  });
});
