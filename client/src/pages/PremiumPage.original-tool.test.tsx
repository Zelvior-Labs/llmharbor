// @vitest-environment jsdom
// LLMHarbor has no paid plan of its own. The Premium page sends people who
// want to pay to the original tool (freellmapi.co), and its pricing link
// follows the server's siteUrl (default https://freellmapi.co).
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@/i18n'
import PremiumPage from './PremiumPage'

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(async () => ({
    hasKey: false,
    maskedKey: null,
    license: null,
    catalog: { baseUrl: 'https://api.freellmapi.co', appliedVersion: null, appliedTier: null, lastSyncMs: null, lastError: null },
    siteUrl: 'https://freellmapi.co',
  })),
}))

let root: Root
let container: HTMLDivElement
beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container) })
afterEach(() => { act(() => root.unmount()); container.remove() })

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  act(() => root.render(
    <QueryClientProvider client={client}>
      <I18nProvider initialLocale="en">
        <PremiumPage />
      </I18nProvider>
    </QueryClientProvider>
  ))
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) })
}

const links = () => [...container.querySelectorAll('a')].map(a => a.getAttribute('href'))

it('shows the P.S. pointing at the original tool', async () => {
  await mount()
  expect(container.textContent).toContain('P.S. If you want to pay for it, use the original tool instead.')
  expect(links()).toContain('https://freellmapi.co/')
})

it('links pricing to freellmapi.co/#pricing', async () => {
  await mount()
  expect(links()).toContain('https://freellmapi.co/#pricing')
})
