// Knowledge files for the Playground agent: attach documents, split them into
// overlapping chunks, embed the chunks through the gateway's own
// /v1/embeddings, and let the agent search them by meaning
// (`search_knowledge`).
//
// When no embedding model can answer (no key for one yet, or the call fails),
// the file is still indexed, just without vectors, and search falls back to a
// keyword score. Retrieval therefore always works; embeddings make it better.
//
// Pure apart from the injected `embed` function, so chunking, scoring and
// ranking are unit-testable in node.

export interface KnowledgeChunk {
  text: string
  /** Character offset of the chunk in its source document. */
  start: number
  vector?: number[]
}

export interface KnowledgeDoc {
  id: string
  name: string
  chars: number
  addedAt: number
  /** The embedding model that produced the vectors, or null for keyword-only. */
  embeddingModel: string | null
  chunks: KnowledgeChunk[]
}

export interface KnowledgeHit {
  doc: string
  text: string
  score: number
  start: number
}

export const CHUNK_SIZE = 1200
export const CHUNK_OVERLAP = 200
/** Hard ceiling on one document, to keep the browser store and embedding bills sane. */
export const MAX_KNOWLEDGE_CHARS = 2_000_000
/** Inputs per /v1/embeddings call. */
export const EMBED_BATCH = 32

/**
 * Split text into ~CHUNK_SIZE windows with CHUNK_OVERLAP overlap, preferring
 * to break at a paragraph, then a sentence, then a space.
 */
export function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): KnowledgeChunk[] {
  const clean = text.replace(/\r\n/g, '\n')
  const chunks: KnowledgeChunk[] = []
  if (!clean.trim()) return chunks
  let start = 0
  while (start < clean.length) {
    let end = Math.min(clean.length, start + size)
    if (end < clean.length) {
      const window = clean.slice(start, end)
      const minBreak = Math.floor(size * 0.5)
      const para = window.lastIndexOf('\n\n')
      const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('.\n'), window.lastIndexOf('? '), window.lastIndexOf('! '))
      const space = window.lastIndexOf(' ')
      const cut = para >= minBreak ? para + 2 : sentence >= minBreak ? sentence + 2 : space >= minBreak ? space + 1 : window.length
      end = start + cut
    }
    const piece = clean.slice(start, end).trim()
    if (piece) chunks.push({ text: piece, start })
    if (end >= clean.length) break
    start = Math.max(end - overlap, start + 1)
  }
  return chunks
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb))
}

const WORD = /[\p{L}\p{N}_]+/gu

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(WORD) ?? []).filter(w => w.length > 1)
}

/** BM25-flavoured keyword score of every chunk against the query. */
export function keywordScores(query: string, chunks: KnowledgeChunk[]): number[] {
  const terms = [...new Set(tokenize(query))]
  if (terms.length === 0) return chunks.map(() => 0)
  const docs = chunks.map(c => tokenize(c.text))
  const avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, docs.length)
  const df = new Map<string, number>()
  for (const d of docs) for (const term of new Set(d)) df.set(term, (df.get(term) ?? 0) + 1)
  const k1 = 1.2, b = 0.75, n = docs.length
  return docs.map(d => {
    const tf = new Map<string, number>()
    for (const w of d) tf.set(w, (tf.get(w) ?? 0) + 1)
    let score = 0
    for (const term of terms) {
      const f = tf.get(term) ?? 0
      if (!f) continue
      const idf = Math.log(1 + (n - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5))
      score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.length / Math.max(1, avg)))
    }
    return score
  })
}

export type EmbedFn = (inputs: string[]) => Promise<{ vectors: number[][]; model: string }>

/** Index one document: chunk it and embed the chunks when `embed` works. */
export async function indexDocument(name: string, text: string, embed: EmbedFn | null): Promise<KnowledgeDoc> {
  const body = text.length > MAX_KNOWLEDGE_CHARS ? text.slice(0, MAX_KNOWLEDGE_CHARS) : text
  const chunks = chunkText(body)
  let model: string | null = null
  if (embed && chunks.length > 0) {
    try {
      for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        const batch = chunks.slice(i, i + EMBED_BATCH)
        const res = await embed(batch.map(c => c.text))
        if (res.vectors.length !== batch.length) throw new Error('embedding count mismatch')
        batch.forEach((c, j) => { c.vector = res.vectors[j] })
        model = res.model
      }
    } catch (err) {
      // Keyword search still works on this document; drop partial vectors so
      // every chunk of a doc is scored the same way.
      console.warn('[knowledge] embedding failed, using keyword search for', name, err)
      for (const c of chunks) delete c.vector
      model = null
    }
  }
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    chars: body.length,
    addedAt: Date.now(),
    embeddingModel: model,
    chunks,
  }
}

/**
 * Rank chunks across documents. Documents with vectors are scored by cosine
 * similarity (when the query embeds); the rest by keyword score, normalised to
 * 0–1 so the two kinds can share one list.
 */
export async function searchKnowledge(
  query: string,
  docs: KnowledgeDoc[],
  embed: EmbedFn | null,
  topK = 5,
): Promise<KnowledgeHit[]> {
  const hits: KnowledgeHit[] = []
  const wantsVectors = docs.some(d => d.embeddingModel && d.chunks.some(c => c.vector))
  let queryVector: number[] | null = null
  if (wantsVectors && embed) {
    try { queryVector = (await embed([query])).vectors[0] ?? null } catch { queryVector = null }
  }
  for (const doc of docs) {
    const vectorised = queryVector && doc.chunks.every(c => c.vector && c.vector.length === queryVector!.length)
    if (vectorised) {
      for (const c of doc.chunks) hits.push({ doc: doc.name, text: c.text, start: c.start, score: cosine(queryVector!, c.vector!) })
    } else {
      const scores = keywordScores(query, doc.chunks)
      const max = Math.max(0, ...scores)
      doc.chunks.forEach((c, i) => {
        if (scores[i] > 0) hits.push({ doc: doc.name, text: c.text, start: c.start, score: max > 0 ? (scores[i] / max) * 0.8 : 0 })
      })
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(20, topK)))
}
