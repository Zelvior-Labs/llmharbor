import { describe, it, expect, vi } from 'vitest'
import {
  AgentWorkspace, MAX_WORKSPACE_FILE_BYTES, WorkspaceError, formatSize, guessMime, looksLikeText,
  memoryBackend, normalizeWorkspacePath, type WorkspaceBackend, type WorkspaceFile,
} from './agent-workspace'

function recordingBackend(initial: WorkspaceFile[] = []) {
  const store = new Map(initial.map(f => [f.path, f]))
  const backend: WorkspaceBackend = {
    load: async () => [...store.values()],
    put: async f => { store.set(f.path, f) },
    remove: async p => { store.delete(p) },
    clear: async () => { store.clear() },
  }
  return { backend, store }
}

describe('AgentWorkspace', () => {
  it('writes, reads, lists and persists', async () => {
    const { backend, store } = recordingBackend()
    const ws = new AgentWorkspace(backend)
    await ws.ready()
    await ws.write('src/app.ts', 'console.log(1)')
    await ws.write('README.md', '# hi')
    expect(ws.list().map(f => f.path)).toEqual(['README.md', 'src/app.ts'])
    expect(ws.readText('./src//app.ts')).toBe('console.log(1)')
    expect(store.has('src/app.ts')).toBe(true)
    expect(ws.totalBytes()).toBe('console.log(1)'.length + 4)
  })

  it('loads files saved by an earlier session', async () => {
    const { backend } = recordingBackend([{ path: 'a.txt', data: new TextEncoder().encode('A'), mime: 'text/plain', updatedAt: 1 }])
    const ws = new AgentWorkspace(backend)
    await ws.ready()
    expect(ws.readText('a.txt')).toBe('A')
  })

  it('notifies subscribers and bumps the version', async () => {
    const ws = new AgentWorkspace(memoryBackend())
    const listener = vi.fn()
    ws.subscribe(listener)
    const v = ws.getVersion()
    await ws.write('x.txt', 'x')
    expect(listener).toHaveBeenCalled()
    expect(ws.getVersion()).toBeGreaterThan(v)
  })

  it('removes a file or a whole folder', async () => {
    const ws = new AgentWorkspace(memoryBackend())
    await ws.write('site/index.html', '<p>')
    await ws.write('site/css/a.css', 'a')
    await ws.write('keep.txt', 'k')
    expect(await ws.remove('site')).toBe(2)
    expect(ws.list().map(f => f.path)).toEqual(['keep.txt'])
    expect(await ws.remove('nope')).toBe(0)
  })

  it('under() scopes to a folder and "" means everything', async () => {
    const ws = new AgentWorkspace(memoryBackend())
    await ws.write('a/1.txt', '1')
    await ws.write('ab/2.txt', '2')
    expect(ws.under('a').map(f => f.path)).toEqual(['a/1.txt'])
    expect(ws.under('').length).toBe(2)
    expect(ws.under('/').length).toBe(2)
  })

  it('refuses file/folder conflicts', async () => {
    const ws = new AgentWorkspace(memoryBackend())
    await ws.write('docs/a.md', 'a')
    await expect(ws.write('docs', 'x')).rejects.toBeInstanceOf(WorkspaceError)
    await expect(ws.write('docs/a.md/b.md', 'x')).rejects.toBeInstanceOf(WorkspaceError)
  })

  it('refuses unsafe paths and oversized files', async () => {
    const ws = new AgentWorkspace(memoryBackend())
    await expect(ws.write('../escape.txt', 'x')).rejects.toBeInstanceOf(WorkspaceError)
    await expect(ws.write('big.bin', new Uint8Array(MAX_WORKSPACE_FILE_BYTES + 1))).rejects.toThrow(/file limit/)
    expect(() => ws.readText('missing.txt')).toThrow(WorkspaceError)
  })

  it('overwriting a file replaces it in place', async () => {
    const ws = new AgentWorkspace(memoryBackend())
    await ws.write('a.txt', 'one')
    await ws.write('a.txt', 'two!')
    expect(ws.list()).toHaveLength(1)
    expect(ws.readText('a.txt')).toBe('two!')
    expect(ws.totalBytes()).toBe(4)
  })

  it('keeps working when the backend fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken: WorkspaceBackend = {
      load: async () => { throw new Error('no db') },
      put: async () => { throw new Error('quota') },
      remove: async () => {},
      clear: async () => {},
    }
    const ws = new AgentWorkspace(broken)
    await ws.ready()
    await ws.write('a.txt', 'still here')
    expect(ws.readText('a.txt')).toBe('still here')
    warn.mockRestore()
  })
})

describe('helpers', () => {
  it('guessMime', () => {
    expect(guessMime('a.png')).toBe('image/png')
    expect(guessMime('x/y.MP4')).toBe('video/mp4')
    expect(guessMime('main.rs')).toBe('text/plain')
    expect(guessMime('.gitignore')).toBe('text/plain')
    expect(guessMime('blob')).toBe('application/octet-stream')
  })
  it('looksLikeText', () => {
    expect(looksLikeText('a.ts', new Uint8Array([0]))).toBe(true)
    expect(looksLikeText('a.png', new Uint8Array([65]))).toBe(false)
    expect(looksLikeText('LICENSE', new TextEncoder().encode('MIT'))).toBe(true)
    expect(looksLikeText('data', new Uint8Array([1, 0, 2]))).toBe(false)
  })
  it('normalizeWorkspacePath', () => {
    expect(normalizeWorkspacePath(' /a//b/ ')).toBe('a/b')
    expect(() => normalizeWorkspacePath('')).toThrow(WorkspaceError)
  })
  it('formatSize', () => {
    expect(formatSize(12)).toBe('12 B')
    expect(formatSize(2048)).toBe('2.0 KB')
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
