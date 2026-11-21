import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const yaml = createRequire(import.meta.url)('js-yaml');

describe('Linux installer runner compatibility', () => {
  it('pins native packaging to Ubuntu 24.04 without dropping package formats', () => {
    const workflowPath = fileURLToPath(new URL('../../../.github/workflows/release.yml', import.meta.url));
    const workflow = yaml.load(readFileSync(workflowPath, 'utf8')) as {
      jobs: { desktop: { strategy: { matrix: { include: Array<{ os: string; artifact: string; ebArgs: string; glob: string }> } } } };
    };
    const linux = workflow.jobs.desktop.strategy.matrix.include.find((entry) => entry.artifact === 'linux-installer');

    expect(linux?.os).toBe('ubuntu-24.04');
    expect(linux?.ebArgs).toBe('--linux --x64');
    for (const artifact of ['*.AppImage', '*.tar.xz', '*.deb', '*.rpm', 'latest-linux.yml']) {
      expect(linux?.glob).toContain(`desktop/dist-electron/${artifact}`);
    }
  });

  it('builds the arm64 desktop packages natively with their own feed', () => {
    const workflowPath = fileURLToPath(new URL('../../../.github/workflows/release.yml', import.meta.url));
    const workflow = yaml.load(readFileSync(workflowPath, 'utf8')) as {
      jobs: { desktop: { strategy: { matrix: { include: Array<{ os: string; artifact: string; ebArgs: string; glob: string }> } } } };
    };
    const arm = workflow.jobs.desktop.strategy.matrix.include.find((entry) => entry.artifact === 'linux-installer-arm64');
    expect(arm?.os).toBe('ubuntu-24.04-arm');
    expect(arm?.ebArgs).toBe('--linux AppImage tar.xz deb rpm --arm64 --config electron-builder.arm64.yml');
    for (const artifact of ['*.AppImage', '*.tar.xz', '*.deb', '*.rpm', 'latest-linux-arm64.yml']) {
      expect(arm?.glob).toContain(`desktop/dist-electron/arm64/${artifact}`);
    }
  });
});
