import { describe, it, expect } from 'vitest'
import { agentSystemPrompt, isAgentMode, isPlaygroundMode, readMode, writeMode, workspaceSummary, MODE_STORAGE_KEY, modeForConversation } from './playground-modes'

function memoryStorage(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init))
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v) }, map }
}

describe('playground modes', () => {
  it('defaults to chat and ignores unknown values', () => {
    expect(readMode(memoryStorage())).toBe('chat')
    expect(readMode(memoryStorage({ [MODE_STORAGE_KEY]: 'bogus' }))).toBe('chat')
    expect(readMode(memoryStorage({ [MODE_STORAGE_KEY]: 'compare' }))).toBe('compare')
  })
  it('round-trips through storage', () => {
    const s = memoryStorage()
    writeMode('code', s)
    expect(readMode(s)).toBe('code')
  })
  it('survives a throwing storage', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(readMode(broken)).toBe('chat')
    expect(() => writeMode('agent', broken)).not.toThrow()
  })
  it('classifies modes', () => {
    expect(isPlaygroundMode('research')).toBe(true)
    expect(isPlaygroundMode('x')).toBe(false)
    expect(isAgentMode('agent')).toBe(true)
    expect(isAgentMode('code')).toBe(true)
    expect(isAgentMode('compare')).toBe(false)
    expect(isAgentMode('chat')).toBe(false)
  })
})

describe('agentSystemPrompt', () => {
  const files = [{ path: 'a.txt', data: new Uint8Array(3) }]
  it('adds mode guidance, tools, workspace, knowledge and the user prompt', () => {
    const p = agentSystemPrompt({ mode: 'code', userPrompt: ' Use TypeScript. ', files, knowledge: [{ name: 'spec.md' }], toolNames: ['write_file', 'read_file'] })
    expect(p).toContain('expert software engineer')
    expect(p).toContain('Tools available right now: write_file, read_file.')
    expect(p).toContain('- a.txt (3 bytes)')
    expect(p).toContain('spec.md')
    expect(p).toContain('Additional instructions from the user:\nUse TypeScript.')
    expect(p).not.toContain('careful researcher')
  })
  it('research mode asks for citations', () => {
    const p = agentSystemPrompt({ mode: 'research', userPrompt: '', files: [], knowledge: [], toolNames: ['web_search'] })
    expect(p).toContain('numbered citations')
    expect(p).toContain('The workspace is empty.')
    expect(p).not.toContain('Additional instructions')
  })
  it('workspaceSummary caps long listings', () => {
    const many = Array.from({ length: 70 }, (_, i) => ({ path: `f${i}`, data: new Uint8Array(1) }))
    expect(workspaceSummary(many)).toContain('and 10 more')
  })
})

describe('modeForConversation', () => {
  it('reopens in the mode of the last agent turn', () => {
    const messages = [
      { role: 'user', content: 'a' },
      { role: 'assistant', meta: { mode: 'research' } },
      { role: 'user', content: 'b' },
      { role: 'assistant', meta: { mode: 'code' } },
    ]
    expect(modeForConversation(messages, 'chat')).toBe('code')
    expect(modeForConversation(messages, 'compare')).toBe('code')
  })
  it('leaves Compare and Create for Chat on a plain transcript, otherwise keeps the mode', () => {
    const messages = [{ role: 'user' }, { role: 'assistant', meta: {} }]
    expect(modeForConversation(messages, 'compare')).toBe('chat')
    expect(modeForConversation(messages, 'create')).toBe('chat')
    expect(modeForConversation(messages, 'agent')).toBe('agent')
    expect(modeForConversation([], 'chat')).toBe('chat')
  })
  it('ignores an unknown stored mode', () => {
    expect(modeForConversation([{ role: 'assistant', meta: { mode: 'bogus' } }], 'chat')).toBe('chat')
  })
})
