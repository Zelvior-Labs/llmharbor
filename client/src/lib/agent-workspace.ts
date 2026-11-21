// The Playground agent's workspace: a small virtual file system the agent
// reads, writes, archives and extracts, and the user downloads from.
//
// It lives in the browser (IndexedDB), not on the server: the same dashboard
// runs inside the desktop app, the Windows 7 edition, the Android app and a
// Docker container, and a browser-side store behaves identically in all of
// them without a new server surface that can write to disk. The trade-off is
// that files stay on the device that made them — download them, push them to
// GitHub, or zip them up to move them elsewhere.
//
// The class keeps everything in memory and treats persistence as a pluggable
// backend, so unit tests (node, no IndexedDB) use the in-memory one.

import { safeArchivePath } from './archive'

export interface WorkspaceFile {
  path: string
  data: Uint8Array
  mime: string
  updatedAt: number
}

export interface WorkspaceBackend {
  load(): Promise<WorkspaceFile[]>
  put(file: WorkspaceFile): Promise<void>
  remove(path: string): Promise<void>
  clear(): Promise<void>
}

/** Per-file and whole-workspace ceilings: the store is a browser database. */
export const MAX_WORKSPACE_FILE_BYTES = 50 * 1024 * 1024
export const MAX_WORKSPACE_BYTES = 200 * 1024 * 1024
export const MAX_WORKSPACE_FILES = 2000

export class WorkspaceError extends Error {}

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonl', 'csv', 'tsv', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'html', 'htm', 'css', 'scss', 'less', 'svg', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'pl', 'lua',
  'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'sql', 'graphql', 'gql', 'proto', 'r', 'dart', 'scala', 'ex', 'exs',
  'gradle', 'properties', 'lock', 'gitignore', 'dockerignore', 'editorconfig', 'log', 'tex', 'rst', 'adoc',
])

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/opus', flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4',
  pdf: 'application/pdf', zip: 'application/zip', gz: 'application/gzip', tar: 'application/x-tar',
  json: 'application/json', html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
  md: 'text/markdown', csv: 'text/csv', xml: 'application/xml',
}

function extensionOf(path: string): string {
  const base = path.split('/').pop() ?? ''
  if (base.startsWith('.') && !base.slice(1).includes('.')) return base.slice(1).toLowerCase()
  const dot = base.lastIndexOf('.')
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase()
}

export function guessMime(path: string): string {
  const ext = extensionOf(path)
  if (MIME_BY_EXTENSION[ext]) return MIME_BY_EXTENSION[ext]
  if (TEXT_EXTENSIONS.has(ext)) return 'text/plain'
  return 'application/octet-stream'
}

/** True when the bytes are safe to show and hand to a model as text. */
export function looksLikeText(path: string, data: Uint8Array): boolean {
  const ext = extensionOf(path)
  if (TEXT_EXTENSIONS.has(ext)) return true
  const mime = guessMime(path)
  if (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/')) return false
  if (mime === 'application/zip' || mime === 'application/gzip' || mime === 'application/pdf') return false
  // Unknown extension: sniff the first few KB for NUL bytes.
  const sample = data.subarray(0, 4096)
  for (let i = 0; i < sample.length; i++) if (sample[i] === 0) return false
  return true
}

export function normalizeWorkspacePath(raw: string): string {
  const path = safeArchivePath(String(raw ?? '').trim())
  if (!path) throw new WorkspaceError(`invalid path: ${JSON.stringify(raw)}`)
  if (path.length > 400) throw new WorkspaceError('path is too long')
  return path
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export class AgentWorkspace {
  private files = new Map<string, WorkspaceFile>()
  private listeners = new Set<() => void>()
  private loaded: Promise<void> | null = null
  private backend: WorkspaceBackend
  private version = 0

  constructor(backend: WorkspaceBackend) {
    this.backend = backend
  }

  /** Load persisted files once; safe to call repeatedly. */
  ready(): Promise<void> {
    if (!this.loaded) {
      this.loaded = this.backend.load()
        .then(files => {
          for (const f of files) this.files.set(f.path, f)
          this.emit()
        })
        .catch(err => { console.warn('[agent-workspace] could not load saved files', err) })
    }
    return this.loaded
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Monotonic change counter, for useSyncExternalStore. */
  getVersion(): number {
    return this.version
  }

  private emit() {
    this.version++
    for (const l of this.listeners) l()
  }

  list(): WorkspaceFile[] {
    return [...this.files.values()].sort((a, b) => a.path.localeCompare(b.path))
  }

  has(path: string): boolean {
    return this.files.has(normalizeWorkspacePath(path))
  }

  get(path: string): WorkspaceFile | undefined {
    return this.files.get(normalizeWorkspacePath(path))
  }

  totalBytes(): number {
    let n = 0
    for (const f of this.files.values()) n += f.data.length
    return n
  }

  readText(path: string): string {
    const file = this.get(path)
    if (!file) throw new WorkspaceError(`no such file: ${path}`)
    return decoder.decode(file.data)
  }

  async write(path: string, data: Uint8Array | string, mime?: string): Promise<WorkspaceFile> {
    const p = normalizeWorkspacePath(path)
    const bytes = typeof data === 'string' ? encoder.encode(data) : data
    if (bytes.length > MAX_WORKSPACE_FILE_BYTES) throw new WorkspaceError(`${p} is larger than the ${MAX_WORKSPACE_FILE_BYTES / 1024 / 1024} MB file limit`)
    const previous = this.files.get(p)
    if (!previous && this.files.size >= MAX_WORKSPACE_FILES) throw new WorkspaceError(`the workspace already holds ${MAX_WORKSPACE_FILES} files`)
    const projected = this.totalBytes() - (previous?.data.length ?? 0) + bytes.length
    if (projected > MAX_WORKSPACE_BYTES) throw new WorkspaceError(`the workspace would exceed ${MAX_WORKSPACE_BYTES / 1024 / 1024} MB`)
    // A path that is already a folder (or sits under a file) would make the
    // tree ambiguous for archives and listings.
    const asFolder = `${p}/`
    for (const existing of this.files.keys()) {
      if (existing.startsWith(asFolder)) throw new WorkspaceError(`${p} is a folder`)
      if (p.startsWith(`${existing}/`)) throw new WorkspaceError(`${existing} is a file, not a folder`)
    }
    const file: WorkspaceFile = { path: p, data: bytes, mime: mime ?? guessMime(p), updatedAt: Date.now() }
    this.files.set(p, file)
    this.emit()
    await this.backend.put(file).catch(err => console.warn('[agent-workspace] could not save', p, err))
    return file
  }

  /** Delete one file, or every file under a folder. Returns how many went. */
  async remove(path: string): Promise<number> {
    const p = normalizeWorkspacePath(path)
    const targets = [...this.files.keys()].filter(k => k === p || k.startsWith(`${p}/`))
    for (const k of targets) {
      this.files.delete(k)
      await this.backend.remove(k).catch(err => console.warn('[agent-workspace] could not delete', k, err))
    }
    if (targets.length > 0) this.emit()
    return targets.length
  }

  async clear(): Promise<void> {
    this.files.clear()
    this.emit()
    await this.backend.clear().catch(err => console.warn('[agent-workspace] could not clear', err))
  }

  /** Files under a folder ('' for everything), for archives and listings. */
  under(folder: string): WorkspaceFile[] {
    if (!folder.trim() || folder.trim() === '.' || folder.trim() === '/') return this.list()
    const p = normalizeWorkspacePath(folder)
    return this.list().filter(f => f.path === p || f.path.startsWith(`${p}/`))
  }
}

// ---- Backends ----------------------------------------------------------------

export function memoryBackend(): WorkspaceBackend {
  return {
    load: async () => [],
    put: async () => {},
    remove: async () => {},
    clear: async () => {},
  }
}

const DB_NAME = 'llmharbor-playground'
const STORE = 'agent-files'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'path' })
      if (!db.objectStoreNames.contains('agent-knowledge')) db.createObjectStore('agent-knowledge', { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function idbStoreBackend<T extends object>(store: string): {
  load(): Promise<T[]>
  put(value: T): Promise<void>
  remove(key: string): Promise<void>
  clear(): Promise<void>
} {
  let dbPromise: Promise<IDBDatabase> | null = null
  const db = () => (dbPromise ??= openDb())
  const tx = async <R>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<R>): Promise<R> => {
    const d = await db()
    return new Promise<R>((resolve, reject) => {
      const t = d.transaction(store, mode)
      const req = run(t.objectStore(store))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return {
    load: () => tx('readonly', s => s.getAll() as IDBRequest<T[]>),
    put: async value => { await tx('readwrite', s => s.put(value)) },
    remove: async key => { await tx('readwrite', s => s.delete(key)) },
    clear: async () => { await tx('readwrite', s => s.clear()) },
  }
}

/** IndexedDB when the runtime has it, memory otherwise (tests, locked-down WebViews). */
export function defaultBackend(): WorkspaceBackend {
  if (typeof indexedDB === 'undefined') return memoryBackend()
  return idbStoreBackend<WorkspaceFile>(STORE)
}

let shared: AgentWorkspace | null = null
/** The page-wide workspace instance. */
export function sharedWorkspace(): AgentWorkspace {
  if (!shared) shared = new AgentWorkspace(defaultBackend())
  return shared
}

/** Human-readable byte size. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Trigger a browser download of bytes (works in Electron and Android WebView too). */
export function downloadBytes(name: string, data: Uint8Array, mime = 'application/octet-stream') {
  const blob = new Blob([data as BlobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
