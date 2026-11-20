// Selected at bundle time, not by OS detection. Even if extracted beside an
// NSIS uninstaller or launched with FREEAPI_UPDATE_FEED, this build cannot
// install a modern Electron update. electron-updater is not shipped at all.
import { shell } from 'electron';
import type { UpdaterHooks } from '../src/updater.js';
import type { UpdateState } from '../src/update-support.js';

export const profileDirectory = 'LLMHarbor-Win7';
export function initUpdater(_options: UpdaterHooks): void { /* manual ZIP updates only */ }
export const getUpdateState = (): UpdateState => ({ phase: 'unsupported', reason: 'package' });
export const checkForUpdates = getUpdateState;
export const downloadUpdate = getUpdateState;
export const installUpdate = getUpdateState;
export const checkFromTray = () => shell.openExternal('https://github.com/zelvior/llmharbor/releases?q=win7');
