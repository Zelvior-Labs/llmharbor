// Advanced request options for the Playground, beside the three sampling knobs
// in playground-sampling.ts: seed, top_k, min_p, the penalties, stop sequences,
// JSON output and reasoning effort.
//
// Same rules as the sampling knobs: every option is opt-in, an untouched panel
// adds nothing to the request, and the bounds mirror what POST
// /v1/chat/completions accepts (server/src/lib/sampling-params.ts), so the
// Playground never composes a request the gateway would refuse.

export const ADVANCED_KEY = 'playground.advanced'

export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'] as const
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]

export interface NumberOption {
  enabled: boolean
  value: number
}

export interface AdvancedSettings {
  seed: NumberOption
  topK: NumberOption
  minP: NumberOption
  frequencyPenalty: NumberOption
  presencePenalty: NumberOption
  repetitionPenalty: NumberOption
  /** Stop sequences, one per line in the UI. Empty = not sent. */
  stop: string[]
  /** Ask for a JSON object (response_format json_object). */
  json: boolean
  /** null = let the provider decide (not sent). */
  reasoningEffort: ReasoningEffort | null
}

export type AdvancedNumberField = 'seed' | 'topK' | 'minP' | 'frequencyPenalty' | 'presencePenalty' | 'repetitionPenalty'

export const ADVANCED_NUMBER_FIELDS: AdvancedNumberField[] = ['seed', 'topK', 'minP', 'frequencyPenalty', 'presencePenalty', 'repetitionPenalty']

export const ADVANCED_RANGES: Record<AdvancedNumberField, { min: number; max: number; step: number }> = {
  seed: { min: 0, max: 2_147_483_647, step: 1 },
  topK: { min: 1, max: 1000, step: 1 },
  minP: { min: 0, max: 1, step: 0.01 },
  frequencyPenalty: { min: -2, max: 2, step: 0.1 },
  presencePenalty: { min: -2, max: 2, step: 0.1 },
  repetitionPenalty: { min: 0.1, max: 2, step: 0.05 },
}

const REQUEST_FIELD: Record<AdvancedNumberField, string> = {
  seed: 'seed',
  topK: 'top_k',
  minP: 'min_p',
  frequencyPenalty: 'frequency_penalty',
  presencePenalty: 'presence_penalty',
  repetitionPenalty: 'repetition_penalty',
}

/** The stop list the gateway accepts at most; OpenAI itself takes 4. */
export const MAX_STOP_SEQUENCES = 4

export const DEFAULT_ADVANCED: AdvancedSettings = {
  seed: { enabled: false, value: 42 },
  topK: { enabled: false, value: 40 },
  minP: { enabled: false, value: 0.05 },
  frequencyPenalty: { enabled: false, value: 0 },
  presencePenalty: { enabled: false, value: 0 },
  repetitionPenalty: { enabled: false, value: 1 },
  stop: [],
  json: false,
  reasoningEffort: null,
}

function decimals(step: number): number {
  const s = String(step)
  return s.includes('.') ? s.length - s.indexOf('.') - 1 : 0
}

export function clampAdvanced(field: AdvancedNumberField, value: number): number {
  const r = ADVANCED_RANGES[field]
  if (!Number.isFinite(value)) return DEFAULT_ADVANCED[field].value
  const bounded = Math.min(r.max, Math.max(r.min, value))
  const snapped = r.min + Math.round((bounded - r.min) / r.step) * r.step
  return Number(snapped.toFixed(decimals(r.step)))
}

export function formatAdvancedValue(field: AdvancedNumberField, value: number): string {
  return clampAdvanced(field, value).toFixed(decimals(ADVANCED_RANGES[field].step))
}

export function normalizeStop(lines: unknown): string[] {
  if (!Array.isArray(lines)) return []
  return lines.filter((l): l is string => typeof l === 'string' && l.length > 0).slice(0, MAX_STOP_SEQUENCES)
}

export function normalizeAdvanced(source: unknown): AdvancedSettings {
  const rec = source && typeof source === 'object' ? source as Record<string, unknown> : {}
  const out = { ...DEFAULT_ADVANCED, stop: [] as string[] }
  for (const f of ADVANCED_NUMBER_FIELDS) {
    const raw = rec[f] as { enabled?: unknown; value?: unknown } | undefined
    out[f] = {
      enabled: raw?.enabled === true,
      value: typeof raw?.value === 'number' ? clampAdvanced(f, raw.value) : DEFAULT_ADVANCED[f].value,
    }
  }
  out.stop = normalizeStop(rec.stop)
  out.json = rec.json === true
  out.reasoningEffort = (REASONING_EFFORTS as readonly unknown[]).includes(rec.reasoningEffort) ? rec.reasoningEffort as ReasoningEffort : null
  return out
}

export function parseAdvanced(raw: string | null | undefined): AdvancedSettings {
  if (!raw) return normalizeAdvanced(null)
  try { return normalizeAdvanced(JSON.parse(raw)) } catch { return normalizeAdvanced(null) }
}

/** Fields to merge into a /v1/chat/completions body; {} when nothing is on. */
export function advancedRequestParams(s: AdvancedSettings): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  for (const f of ADVANCED_NUMBER_FIELDS) {
    if (s[f].enabled) params[REQUEST_FIELD[f]] = clampAdvanced(f, s[f].value)
  }
  const stop = normalizeStop(s.stop)
  if (stop.length > 0) params.stop = stop
  if (s.json) params.response_format = { type: 'json_object' }
  if (s.reasoningEffort) params.reasoning_effort = s.reasoningEffort
  return params
}

export function advancedActiveCount(s: AdvancedSettings): number {
  return ADVANCED_NUMBER_FIELDS.filter(f => s[f].enabled).length
    + (normalizeStop(s.stop).length > 0 ? 1 : 0)
    + (s.json ? 1 : 0)
    + (s.reasoningEffort ? 1 : 0)
}

export function readAdvanced(): AdvancedSettings {
  try { return parseAdvanced(localStorage.getItem(ADVANCED_KEY)) } catch { return normalizeAdvanced(null) }
}

export function writeAdvanced(s: AdvancedSettings): void {
  try { localStorage.setItem(ADVANCED_KEY, JSON.stringify(normalizeAdvanced(s))) } catch { /* not remembered */ }
}
