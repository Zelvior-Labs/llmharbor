// Browser glue between the Playground agent and the gateway: authorised /v1
// calls, the non-streaming chat call the agent loop drives, the embedder for
// knowledge files, and the GitHub relay. Kept apart from the pure modules so
// those stay testable in node without fetch mocks.

import { apiFetch } from './api'
import { AgentCallError, normalizeToolCalls, type ChatCall, type ChatTurn } from './agent-loop'
import type { GithubReply } from './agent-tools'
import type { EmbedFn } from './knowledge'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

export type V1Fetch = (path: string, body: unknown, signal?: AbortSignal) => Promise<Response>

/** POST JSON to the gateway's /v1 API with the unified inference key. */
export function makeV1(apiKey: string | undefined): V1Fetch {
  return (path, body, signal) => fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify(body),
    signal,
  })
}

/** Split an X-Routed-Via "platform/model" header. */
export function parseRoutedVia(value: string | null): { platform?: string; model?: string } {
  if (!value) return {}
  const [platform, ...rest] = value.split('/')
  return { platform, model: rest.join('/') || undefined }
}

async function errorOf(res: Response): Promise<AgentCallError> {
  const body = await res.json().catch(() => null) as { error?: { message?: string; code?: string; type?: string } | string } | null
  const err = body?.error
  const message = typeof err === 'string' ? err : err?.message
  const code = typeof err === 'object' && err ? err.code ?? err.type : undefined
  return new AgentCallError(message || `HTTP ${res.status}`, code)
}

/**
 * The agent loop's transport: one non-streaming /v1/chat/completions call.
 * `model` is the Playground picker's value ('auto' → the router decides).
 */
export function makeChatCall(v1: V1Fetch, model: string, extra: Record<string, unknown>): ChatCall {
  return async (messages, tools, signal) => {
    const body: Record<string, unknown> = { messages, stream: false, ...extra }
    if (model && model !== 'auto') body.model = model
    if (tools.length > 0) body.tools = tools
    const res = await v1('/v1/chat/completions', body, signal)
    if (!res.ok) throw await errorOf(res)
    const data = await res.json() as {
      choices?: { message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown; tool_calls?: unknown } }[]
      _routed_via?: { platform?: string; model?: string }
    }
    const msg = data.choices?.[0]?.message ?? {}
    const routed = data._routed_via ?? parseRoutedVia(res.headers.get('X-Routed-Via'))
    const reasoning = typeof msg.reasoning_content === 'string' ? msg.reasoning_content : typeof msg.reasoning === 'string' ? msg.reasoning : undefined
    const turn: ChatTurn = {
      content: typeof msg.content === 'string' ? msg.content : '',
      toolCalls: normalizeToolCalls(msg.tool_calls),
      ...(reasoning ? { reasoning } : {}),
      platform: routed.platform,
      model: routed.model,
    }
    return turn
  }
}

/** Embed through /v1/embeddings with the default embedding family. */
export function makeEmbed(v1: V1Fetch): EmbedFn {
  return async inputs => {
    const res = await v1('/v1/embeddings', { input: inputs })
    if (!res.ok) throw await errorOf(res)
    const data = await res.json() as { data: { index: number; embedding: number[] }[]; model?: string }
    const vectors = [...data.data].sort((a, b) => a.index - b.index).map(d => d.embedding)
    return { vectors, model: data.model ?? 'default' }
  }
}

/** The slice of GET /api/embeddings that says whether /v1/embeddings can answer. */
export interface EmbeddingsListing {
  defaultFamily?: string
  families?: { family: string; providers?: { enabled?: boolean; keyCount?: number }[] }[]
}

/**
 * Whether a model-less /v1/embeddings call can succeed: the default family
 * needs an enabled provider with a key. Checking first skips a request that
 * would only fail, and knowledge falls back to keyword search.
 */
export function embeddingsAvailable(listing: EmbeddingsListing | undefined): boolean {
  const family = listing?.families?.find(f => f.family === listing.defaultFamily)
  return !!family?.providers?.some(p => p.enabled && (p.keyCount ?? 0) > 0)
}

export interface GithubStatus {
  connected: boolean
  login?: string | null
  error?: string
}

export const githubApi = {
  status: () => apiFetch<GithubStatus>('/api/playground/github'),
  connect: (token: string) => apiFetch<GithubStatus>('/api/playground/github', { method: 'PUT', body: JSON.stringify({ token }) }),
  disconnect: () => apiFetch<GithubStatus>('/api/playground/github', { method: 'DELETE' }),
  request: (method: string, path: string, body?: unknown) => apiFetch<GithubReply>('/api/playground/github/request', {
    method: 'POST',
    body: JSON.stringify({ method, path, ...(body !== undefined ? { body } : {}) }),
  }),
}
