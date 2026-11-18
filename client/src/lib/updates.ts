/** Fired to open the Updates dialog from anywhere (the ⋯ menu, the update pill). */
export const OPEN_UPDATES_EVENT = 'freellmapi:open-updates'

export function openUpdates(): void {
  window.dispatchEvent(new Event(OPEN_UPDATES_EVENT))
}

// Build-time: the Windows 7 portable preview must never offer a modern installer.
export const WIN7_PORTABLE = import.meta.env.MODE === 'win7'
export const RELEASES_URL = WIN7_PORTABLE
  ? 'https://github.com/zelvior/ossllmapi/releases?q=win7'
  : 'https://github.com/zelvior/ossllmapi/releases/latest'
