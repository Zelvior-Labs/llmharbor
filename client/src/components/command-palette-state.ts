export const COMMAND_PALETTE_EVENT = 'ossllmapi:command-palette'

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_EVENT))
}
