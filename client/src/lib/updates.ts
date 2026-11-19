/** Fired to open the Updates dialog from anywhere (the ⋯ menu, the update pill). */
export const OPEN_UPDATES_EVENT = 'ossllmapi:open-updates'

export function openUpdates(): void {
  window.dispatchEvent(new Event(OPEN_UPDATES_EVENT))
}

// Sideloaded editions must not offer an incompatible desktop update.
const mode = import.meta.env.MODE
export const MANUAL_EDITION = mode === 'win7' ? 'Windows 7 SP1 · Portable ZIP'
  : mode === 'android' ? 'Android · standalone APK' : null
export const RELEASES_URL = mode === 'win7' ? 'https://github.com/zelvior/ossllmapi/releases?q=win7'
  : mode === 'android' ? 'https://github.com/zelvior/ossllmapi/releases?q=android'
  : 'https://github.com/zelvior/ossllmapi/releases/latest'
