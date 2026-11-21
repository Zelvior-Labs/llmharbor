import { describe, it, expect, vi } from 'vitest'

vi.mock('./api', () => ({ apiFetch: vi.fn() }))

import { embeddingsAvailable, makeChatCall, makeEmbed, parseRoutedVia, type V1Fetch } from './agent-runtime'
import { AgentCallError } from './agent-loop'

function fakeV1(reply: { status?: number; body: unknown; headers?: Record<string, string> }) {
  const calls: { path: string; body: Record<string, unknown> }[] = []
  const v1: V1Fetch = async (path, body) => {
    calls.push({ path, body: body as Record<string, unknown> })
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'Content-Type': 'application/json', ...(reply.headers ?? {}) },
    })
  }
  return { v1, calls }
}

describe('parseRoutedVia', () => {
  it('splits platform from a model id that may contain slashes', () => {
    expect(parseRoutedVia('openrouter/meta-llama/llama-3.3-70b')).toEqual({ platform: 'openrouter', model: 'meta-llama/llama-3.3-70b' })
    expect(parseRoutedVia('groq')).toEqual({ platform: 'groq', model: undefined })
    expect(parseRoutedVia(null)).toEqual({})
  })
})

describe('makeChatCall', () => {
  it('omits the model for auto, sends tools and extra params, and reads tool calls', async () => {
    const { v1, calls } = fakeV1({
      body: { choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'list_files', arguments: '{}' } }] } }] },
      headers: { 'X-Routed-Via': 'groq/llama-3.3-70b' },
    })
    const call = makeChatCall(v1, 'auto', { temperature: 0.2 })
    const tools = [{ type: 'function' as const, function: { name: 'list_files', description: 'x', parameters: { type: 'object', properties: {} } } }]
    const turn = await call([{ role: 'user', content: 'hi' }], tools)
    expect(calls[0].path).toBe('/v1/chat/completions')
    expect('model' in calls[0].body).toBe(false)
    expect(calls[0].body.stream).toBe(false)
    expect(calls[0].body.temperature).toBe(0.2)
    expect(calls[0].body.tools).toEqual(tools)
    expect(turn.toolCalls.map(t => t.function.name)).toEqual(['list_files'])
    expect(turn.platform).toBe('groq')
    expect(turn.model).toBe('llama-3.3-70b')
  })

  it('pins a picked model, leaves tools out of a tool-less round, and keeps reasoning', async () => {
    const { v1, calls } = fakeV1({ body: { choices: [{ message: { content: 'done', reasoning_content: 'why' } }], _routed_via: { platform: 'custom', model: 'demo' } } })
    const turn = await makeChatCall(v1, 'demo', {})([{ role: 'user', content: 'hi' }], [])
    expect(calls[0].body.model).toBe('demo')
    expect('tools' in calls[0].body).toBe(false)
    expect(turn).toMatchObject({ content: 'done', reasoning: 'why', platform: 'custom', model: 'demo', toolCalls: [] })
  })

  it('turns an error reply into an AgentCallError carrying the code', async () => {
    const { v1 } = fakeV1({ status: 503, body: { error: { message: 'All models exhausted', code: 'no_models' } } })
    const err = await makeChatCall(v1, 'auto', {})([{ role: 'user', content: 'hi' }], []).catch(e => e)
    expect(err).toBeInstanceOf(AgentCallError)
    expect(err.message).toBe('All models exhausted')
    expect(err.code).toBe('no_models')
  })
})

describe('makeEmbed', () => {
  it('returns vectors in input order with the serving model', async () => {
    const { v1, calls } = fakeV1({ body: { model: 'bge-m3', data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] } })
    const out = await makeEmbed(v1)(['a', 'b'])
    expect(calls[0]).toEqual({ path: '/v1/embeddings', body: { input: ['a', 'b'] } })
    expect(out).toEqual({ vectors: [[1, 0], [0, 1]], model: 'bge-m3' })
  })
})

describe('embeddingsAvailable', () => {
  const listing = (providers: { enabled: boolean; keyCount: number }[]) => ({
    defaultFamily: 'bge-m3',
    families: [{ family: 'other', providers: [{ enabled: true, keyCount: 3 }] }, { family: 'bge-m3', providers }],
  })
  it('needs an enabled, keyed provider in the default family', () => {
    expect(embeddingsAvailable(listing([{ enabled: true, keyCount: 1 }]))).toBe(true)
    expect(embeddingsAvailable(listing([{ enabled: false, keyCount: 1 }, { enabled: true, keyCount: 0 }]))).toBe(false)
    expect(embeddingsAvailable(undefined)).toBe(false)
  })
})
