import { describe, it, expect, vi } from 'vitest'
import { chunkText, cosine, indexDocument, keywordScores, searchKnowledge, tokenize, CHUNK_SIZE, type EmbedFn } from './knowledge'

// A deterministic fake embedder: one dimension per vocabulary word.
const VOCAB = ['cat', 'dog', 'invoice', 'payment', 'rocket', 'launch']
const fakeEmbed: EmbedFn = async inputs => ({
  model: 'fake-embed',
  vectors: inputs.map(text => {
    const words = tokenize(text)
    return VOCAB.map(v => words.filter(w => w.startsWith(v)).length + 0.01)
  }),
})

describe('chunkText', () => {
  it('returns nothing for blank text', () => {
    expect(chunkText('   \n ')).toEqual([])
  })
  it('keeps short text as one chunk', () => {
    expect(chunkText('hello world')).toEqual([{ text: 'hello world', start: 0 }])
  })
  it('splits long text into overlapping, bounded chunks that cover everything', () => {
    const para = 'This is a sentence about rockets. '.repeat(30)
    const text = `${para}\n\n${para}\n\n${para}`
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(CHUNK_SIZE)
    // Overlap: each chunk starts before the previous one ended.
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].start).toBeLessThan(chunks[i - 1].start + chunks[i - 1].text.length + 2)
    }
    const last = chunks[chunks.length - 1]
    expect(last.start + last.text.length).toBeGreaterThanOrEqual(text.trimEnd().length - 2)
  })
  it('makes progress on text with no break points', () => {
    const chunks = chunkText('x'.repeat(5000))
    expect(chunks.length).toBeGreaterThanOrEqual(4)
  })
})

describe('scoring', () => {
  it('cosine', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosine([1], [1, 2])).toBe(0)
    expect(cosine([0, 0], [1, 1])).toBe(0)
  })
  it('keyword scores favour chunks with the query terms', () => {
    const chunks = [{ text: 'the cat sat', start: 0 }, { text: 'invoice payment due', start: 10 }, { text: 'nothing here', start: 20 }]
    const s = keywordScores('payment invoice', chunks)
    expect(s[1]).toBeGreaterThan(s[0])
    expect(s[2]).toBe(0)
    expect(keywordScores('', chunks)).toEqual([0, 0, 0])
  })
})

describe('indexDocument + searchKnowledge', () => {
  it('embeds chunks and ranks by meaning', async () => {
    const a = await indexDocument('pets.md', 'My cat and my dog play all day. The dog barks at the cat.', fakeEmbed)
    const b = await indexDocument('billing.md', 'Each invoice needs a payment within thirty days of the invoice date.', fakeEmbed)
    expect(a.embeddingModel).toBe('fake-embed')
    expect(a.chunks[0].vector).toHaveLength(VOCAB.length)
    const hits = await searchKnowledge('when is payment for an invoice due', [a, b], fakeEmbed, 2)
    expect(hits[0].doc).toBe('billing.md')
    expect(hits[0].score).toBeGreaterThan(hits[1].score)
  })

  it('falls back to keyword search when embedding fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failing: EmbedFn = async () => { throw new Error('no embedding keys') }
    const doc = await indexDocument('notes.txt', 'Rocket launch is scheduled for Friday.', failing)
    expect(doc.embeddingModel).toBeNull()
    expect(doc.chunks[0].vector).toBeUndefined()
    const hits = await searchKnowledge('rocket launch', [doc], failing)
    expect(hits).toHaveLength(1)
    expect(hits[0].text).toContain('Friday')
    warn.mockRestore()
  })

  it('works with no embedder at all and mixes doc kinds', async () => {
    const plain = await indexDocument('plain.txt', 'The rocket launch went well.', null)
    const vec = await indexDocument('vec.txt', 'A cat video about a dog.', fakeEmbed)
    const hits = await searchKnowledge('rocket', [plain, vec], fakeEmbed, 5)
    expect(hits.map(h => h.doc)).toContain('plain.txt')
  })

  it('returns nothing for empty knowledge', async () => {
    expect(await searchKnowledge('anything', [], null)).toEqual([])
  })
})
