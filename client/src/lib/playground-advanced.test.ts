import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ADVANCED, advancedActiveCount, advancedRequestParams, clampAdvanced, formatAdvancedValue,
  normalizeAdvanced, parseAdvanced, MAX_STOP_SEQUENCES,
} from './playground-advanced'

describe('advanced options', () => {
  it('send nothing by default', () => {
    expect(advancedRequestParams(DEFAULT_ADVANCED)).toEqual({})
    expect(advancedActiveCount(DEFAULT_ADVANCED)).toBe(0)
  })

  it('map enabled options onto OpenAI field names', () => {
    const s = normalizeAdvanced({
      seed: { enabled: true, value: 7 },
      topK: { enabled: true, value: 20 },
      minP: { enabled: true, value: 0.1 },
      frequencyPenalty: { enabled: true, value: 0.5 },
      presencePenalty: { enabled: false, value: 1 },
      repetitionPenalty: { enabled: true, value: 1.1 },
      stop: ['END', '', '###'],
      json: true,
      reasoningEffort: 'high',
    })
    expect(advancedRequestParams(s)).toEqual({
      seed: 7, top_k: 20, min_p: 0.1, frequency_penalty: 0.5, repetition_penalty: 1.1,
      stop: ['END', '###'], response_format: { type: 'json_object' }, reasoning_effort: 'high',
    })
    expect(advancedActiveCount(s)).toBe(8)
  })

  it('clamps into the ranges the gateway accepts', () => {
    expect(clampAdvanced('frequencyPenalty', 9)).toBe(2)
    expect(clampAdvanced('frequencyPenalty', -9)).toBe(-2)
    expect(clampAdvanced('topK', 0)).toBe(1)
    expect(clampAdvanced('minP', 0.123)).toBe(0.12)
    expect(clampAdvanced('seed', 3.7)).toBe(4)
    expect(clampAdvanced('seed', NaN)).toBe(42)
    expect(formatAdvancedValue('presencePenalty', 0.3)).toBe('0.3')
  })

  it('parses storage tolerantly', () => {
    expect(parseAdvanced(null)).toEqual(DEFAULT_ADVANCED)
    expect(parseAdvanced('{broken')).toEqual(DEFAULT_ADVANCED)
    const odd = parseAdvanced(JSON.stringify({ seed: { enabled: 'yes', value: 'x' }, reasoningEffort: 'turbo', json: 1, stop: 'END' }))
    expect(odd).toEqual(DEFAULT_ADVANCED)
  })

  it('caps stop sequences', () => {
    const s = normalizeAdvanced({ stop: ['a', 'b', 'c', 'd', 'e', 'f'] })
    expect(s.stop).toHaveLength(MAX_STOP_SEQUENCES)
  })
})
