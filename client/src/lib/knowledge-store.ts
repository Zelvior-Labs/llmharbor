// Persisted list of knowledge files for the Playground agent (IndexedDB store
// "agent-knowledge", created by agent-workspace.ts's database upgrade).
// Indexing itself lives in knowledge.ts.

import { idbStoreBackend } from './agent-workspace'
import type { KnowledgeDoc } from './knowledge'

export interface KnowledgeBackend {
  load(): Promise<KnowledgeDoc[]>
  put(doc: KnowledgeDoc): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

export class KnowledgeStore {
  private docs: KnowledgeDoc[] = []
  private listeners = new Set<() => void>()
  private loaded: Promise<void> | null = null
  private version = 0
  private backend: KnowledgeBackend

  constructor(backend: KnowledgeBackend) {
    this.backend = backend
  }

  ready(): Promise<void> {
    if (!this.loaded) {
      this.loaded = this.backend.load()
        .then(docs => { this.docs = docs.sort((a, b) => a.addedAt - b.addedAt); this.emit() })
        .catch(err => console.warn('[knowledge] could not load saved files', err))
    }
    return this.loaded
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getVersion(): number {
    return this.version
  }

  private emit() {
    this.version++
    for (const l of this.listeners) l()
  }

  list(): KnowledgeDoc[] {
    return this.docs
  }

  async add(doc: KnowledgeDoc): Promise<void> {
    this.docs = [...this.docs, doc]
    this.emit()
    await this.backend.put(doc).catch(err => console.warn('[knowledge] could not save', doc.name, err))
  }

  async remove(id: string): Promise<void> {
    this.docs = this.docs.filter(d => d.id !== id)
    this.emit()
    await this.backend.remove(id).catch(err => console.warn('[knowledge] could not delete', id, err))
  }

  async clear(): Promise<void> {
    this.docs = []
    this.emit()
    await this.backend.clear().catch(err => console.warn('[knowledge] could not clear', err))
  }
}

export function memoryKnowledgeBackend(): KnowledgeBackend {
  return { load: async () => [], put: async () => {}, remove: async () => {}, clear: async () => {} }
}

let shared: KnowledgeStore | null = null
export function sharedKnowledge(): KnowledgeStore {
  if (!shared) {
    shared = new KnowledgeStore(typeof indexedDB === 'undefined' ? memoryKnowledgeBackend() : idbStoreBackend<KnowledgeDoc>('agent-knowledge'))
  }
  return shared
}
