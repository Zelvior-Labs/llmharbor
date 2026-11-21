// The Playground agent loop: call /v1/chat/completions with tools, run the
// tool calls the model asks for, feed the results back, repeat until the model
// answers without tools (or the step budget runs out).
//
// The transport and the tool executor are injected, so the loop itself is
// pure and unit-tested with scripted fakes.

import type { ToolDefinition, ToolOutcome } from './agent-tools'

export interface AgentStep {
  tool: string
  /** Raw JSON arguments as the model sent them (clipped for display/storage). */
  args: string
  /** What the tool handed back to the model (clipped for display/storage). */
  result: string
  ok: boolean
  files?: string[]
  /** True while the tool is still running. Never stored. */
  running?: boolean
}

export interface WireToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type WireMessage =
  | { role: 'system' | 'user'; content: unknown }
  | { role: 'assistant'; content: string | null; tool_calls?: WireToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface ChatTurn {
  content: string
  reasoning?: string
  toolCalls: WireToolCall[]
  platform?: string
  model?: string
}

/** One non-streaming completion. Throws AgentCallError on a refused request. */
export type ChatCall = (messages: WireMessage[], tools: ToolDefinition[], signal?: AbortSignal) => Promise<ChatTurn>

export class AgentCallError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

export interface AgentProgress {
  content: string
  reasoning: string
  steps: AgentStep[]
  platform?: string
  model?: string
}

export interface AgentResult extends AgentProgress {
  /** Set when the loop hit the step budget before the model finished. */
  stoppedAtLimit: boolean
}

export const MAX_AGENT_STEPS = 30
/** How much of a tool's args/result is kept on the step for display and storage. */
export const STEP_CLIP = 4000

export function clip(text: string, max = STEP_CLIP): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

/**
 * Normalise the tool calls of one assistant message: give every call an id
 * (some providers omit it) and drop calls without a function name.
 */
export function normalizeToolCalls(raw: unknown): WireToolCall[] {
  if (!Array.isArray(raw)) return []
  const out: WireToolCall[] = []
  raw.forEach((c, i) => {
    const call = c as { id?: unknown; function?: { name?: unknown; arguments?: unknown } }
    const name = typeof call?.function?.name === 'string' ? call.function.name : ''
    if (!name) return
    const args = call.function?.arguments
    out.push({
      id: typeof call.id === 'string' && call.id ? call.id : `call_${Date.now().toString(36)}_${i}`,
      type: 'function',
      function: { name, arguments: typeof args === 'string' ? args : args === undefined ? '' : JSON.stringify(args) },
    })
  })
  return out
}

export async function runAgent(opts: {
  call: ChatCall
  tools: ToolDefinition[]
  execute: (name: string, args: string) => Promise<ToolOutcome>
  messages: WireMessage[]
  maxSteps?: number
  onProgress?: (p: AgentProgress) => void
  signal?: AbortSignal
}): Promise<AgentResult> {
  const { call, tools, execute, signal } = opts
  const maxSteps = opts.maxSteps ?? MAX_AGENT_STEPS
  const transcript: WireMessage[] = [...opts.messages]
  const steps: AgentStep[] = []
  const progress: AgentProgress = { content: '', reasoning: '', steps }
  const report = () => opts.onProgress?.({ ...progress, steps: steps.map(s => ({ ...s })) })

  for (let round = 0; ; round++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    // On the last allowed round, take the tools away so the model has to
    // answer with what it has instead of being cut off mid-task.
    const lastRound = steps.length >= maxSteps
    const turn = await call(transcript, lastRound ? [] : tools, signal)
    if (turn.platform) progress.platform = turn.platform
    if (turn.model) progress.model = turn.model
    if (turn.reasoning) progress.reasoning = progress.reasoning ? `${progress.reasoning}\n\n${turn.reasoning}` : turn.reasoning

    if (turn.toolCalls.length === 0 || lastRound) {
      progress.content = turn.content
      report()
      return { ...progress, steps: steps.map(s => ({ ...s })), stoppedAtLimit: lastRound && turn.toolCalls.length > 0 }
    }

    // Narration the model gave alongside its tool calls is kept as interim
    // content so the user sees what it is doing.
    if (turn.content.trim()) progress.content = turn.content
    transcript.push({ role: 'assistant', content: turn.content || null, tool_calls: turn.toolCalls })

    for (const tc of turn.toolCalls) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const step: AgentStep = { tool: tc.function.name, args: clip(tc.function.arguments), result: '', ok: true, running: true }
      steps.push(step)
      report()
      const outcome = steps.length > maxSteps
        ? { ok: false, content: `Step budget of ${maxSteps} tool calls reached; answer with what you have.` }
        : await execute(tc.function.name, tc.function.arguments)
      step.running = false
      step.ok = outcome.ok
      step.result = clip(outcome.content)
      if (outcome.files?.length) step.files = outcome.files.slice(0, 50)
      transcript.push({ role: 'tool', tool_call_id: tc.id, content: outcome.content })
      report()
    }
  }
}

/** The most telling argument of a call, for the one-line summary. */
export function stepSummary(step: Pick<AgentStep, 'tool' | 'args'>): string {
  let args: Record<string, unknown> = {}
  try { args = JSON.parse(step.args || '{}') } catch { return '' }
  const pick = (k: string) => (typeof args[k] === 'string' ? args[k] as string : '')
  switch (step.tool) {
    case 'web_search': case 'search_knowledge': return pick('query')
    case 'generate_image': case 'generate_video': return pick('path') || pick('prompt')
    case 'text_to_speech': return pick('path') || pick('text')
    case 'github_request': return `${pick('method') || 'GET'} ${pick('path')}`
    case 'github_download_repo': return `${pick('owner')}/${pick('repo')}${pick('ref') ? `@${pick('ref')}` : ''}`
    case 'github_push_files': return `${pick('owner')}/${pick('repo')}@${pick('branch')}`
    case 'create_archive': return pick('output')
    case 'list_files': return pick('folder')
    default: return pick('path')
  }
}
