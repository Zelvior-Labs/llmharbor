// Default build-time #desktop-edition. Modern installers keep their normal updater and profile.
export const profileDirectory = 'OSSLLMAPI';
export { initUpdater, getUpdateState, checkForUpdates, downloadUpdate, installUpdate, checkFromTray } from './updater.js';
