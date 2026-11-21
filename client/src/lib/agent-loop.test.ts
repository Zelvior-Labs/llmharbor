import { describe, it, expect, vi } from 'vitest'
import { runAgent, normalizeToolCalls, clip, stepSummary, type ChatCall, type ChatTurn, type WireMessage } from './agent-loop'
import type { ToolDefinition } from './agent-tools'

const TOOLS: ToolDefinition[] = [{ type: 'function', function: { name: 'write_file', description: '', parameters: { type: 'object' } } }]

function scripted(turns: ChatTurn[]): ChatCall & { seen: { messages: WireMessage[]; tools: ToolDefinition[] }[] } {
  const seen: { messages: WireMessage[]; tools: ToolDefinition[] }[] = []
  const fn = (async (messages: WireMessage[], tools: ToolDefinition[]) => {
    seen.push({ messages: [...messages], tools })
    const next = turns.shift()
    if (!next) throw new Error('script exhausted')
    return next
  }) as ChatCall & { seen: typeof seen }
  fn.seen = seen
  return fn
}

const toolCall = (id: string, args: object) => ({ id, type: 'function' as const, function: { name: 'write_file', arguments: JSON.stringify(args) } })

describe('runAgent', () => {
  it('answers directly when the model calls no tools', async () => {
    const call = scripted([{ content: 'Hello!', toolCalls: [], platform: 'groq', model: 'llama' }])
    const res = await runAgent({ call, tools: TOOLS, execute: vi.fn(), messages: [{ role: 'user', content: 'hi' }] })
    expect(res).toMatchObject({ content: 'Hello!', steps: [], platform: 'groq', model: 'llama', stoppedAtLimit: false })
  })

  it('runs tool calls, feeds results back and finishes', async () => {
    const call = scripted([
      { content: 'Writing files.', toolCalls: [toolCall('a', { path: 'x' }), toolCall('b', { path: 'y' })] },
      { content: 'Done: created x and y.', toolCalls: [] },
    ])
    const execute = vi.fn(async (_n: string, args: string) => ({ ok: true, content: `wrote ${JSON.parse(args).path}`, files: [JSON.parse(args).path] }))
    const progress = vi.fn()
    const res = await runAgent({ call, tools: TOOLS, execute, messages: [{ role: 'user', content: 'go' }], onProgress: progress })
    expect(res.content).toBe('Done: created x and y.')
    expect(res.steps.map(s => [s.tool, s.ok, s.result, s.files])).toEqual([
      ['write_file', true, 'wrote x', ['x']],
      ['write_file', true, 'wrote y', ['y']],
    ])
    const second = call.seen[1].messages
    expect(second.at(-3)).toEqual({ role: 'assistant', content: 'Writing files.', tool_calls: [toolCall('a', { path: 'x' }), toolCall('b', { path: 'y' })] })
    expect(second.at(-2)).toEqual({ role: 'tool', tool_call_id: 'a', content: 'wrote x' })
    expect(second.at(-1)).toEqual({ role: 'tool', tool_call_id: 'b', content: 'wrote y' })
    // Progress shows a running step before its result.
    expect(progress.mock.calls.some(([p]) => p.steps.some((s: { running?: boolean }) => s.running))).toBe(true)
    expect(res.steps.every(s => !s.running)).toBe(true)
  })

  it('withholds tools once the step budget is spent', async () => {
    const call = scripted([
      { content: '', toolCalls: [toolCall('1', {})] },
      { content: '', toolCalls: [toolCall('2', {})] },
      { content: 'Partial answer.', toolCalls: [] },
    ])
    const execute = vi.fn(async () => ({ ok: true, content: 'ok' }))
    const res = await runAgent({ call, tools: TOOLS, execute, messages: [], maxSteps: 2 })
    expect(execute).toHaveBeenCalledTimes(2)
    expect(call.seen[2].tools).toEqual([])
    expect(res.content).toBe('Partial answer.')
    expect(res.stoppedAtLimit).toBe(false)
  })

  it('flags a model that keeps calling tools past the budget', async () => {
    const call = scripted([
      { content: '', toolCalls: [toolCall('1', {})] },
      { content: 'still going', toolCalls: [toolCall('2', {})] },
    ])
    const res = await runAgent({ call, tools: TOOLS, execute: async () => ({ ok: true, content: 'ok' }), messages: [], maxSteps: 1 })
    expect(res.stoppedAtLimit).toBe(true)
  })

  it('stops on abort', async () => {
    const controller = new AbortController()
    const call = scripted([{ content: '', toolCalls: [toolCall('1', {}), toolCall('2', {})] }])
    const execute = vi.fn(async () => { controller.abort(); return { ok: true, content: 'ok' } })
    await expect(runAgent({ call, tools: TOOLS, execute, messages: [], signal: controller.signal })).rejects.toThrow(/Abort/)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('propagates transport errors', async () => {
    const call: ChatCall = async () => { throw new Error('no_tools_model') }
    await expect(runAgent({ call, tools: TOOLS, execute: vi.fn(), messages: [] })).rejects.toThrow('no_tools_model')
  })
})

describe('helpers', () => {
  it('normalizeToolCalls fills ids, stringifies object args and drops nameless calls', () => {
    const out = normalizeToolCalls([
      { function: { name: 'a', arguments: { x: 1 } } },
      { id: 'k', function: { name: 'b', arguments: '{}' } },
      { function: { arguments: '{}' } },
    ])
    expect(out).toHaveLength(2)
    expect(out[0].id).toMatch(/^call_/)
    expect(out[0].function.arguments).toBe('{"x":1}')
    expect(out[1].id).toBe('k')
    expect(normalizeToolCalls(undefined)).toEqual([])
  })
  it('clip', () => {
    expect(clip('abc', 2)).toBe('ab…')
    expect(clip('ab', 2)).toBe('ab')
  })
})

describe('stepSummary', () => {
  it('picks the telling argument per tool', () => {
    expect(stepSummary({ tool: 'write_file', args: '{"path":"a/b.ts","content":"x"}' })).toBe('a/b.ts')
    expect(stepSummary({ tool: 'web_search', args: '{"query":"llm news"}' })).toBe('llm news')
    expect(stepSummary({ tool: 'github_request', args: '{"path":"/user"}' })).toBe('GET /user')
    expect(stepSummary({ tool: 'github_download_repo', args: '{"owner":"a","repo":"b","ref":"main"}' })).toBe('a/b@main')
    expect(stepSummary({ tool: 'generate_image', args: '{"prompt":"a cat"}' })).toBe('a cat')
    expect(stepSummary({ tool: 'write_file', args: '{truncated' })).toBe('')
  })
})
