import { useImperativeHandle, useRef, useState, type Ref } from 'react'
import { CircleAlert, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/markdown'
import { CopyButton } from '@/components/copy-button'
import { ModelCombobox, type ModelComboOption } from '@/components/model-combobox'
import { ModelMakerIcon } from '@/components/model-maker-icon'
import { readChatStream } from '@/lib/playground-stream'
import { parseRoutedVia, type V1Fetch } from '@/lib/agent-runtime'
import { useI18n } from '@/i18n'

// Side-by-side comparison: one prompt, streamed to 2–4 models at once, each in
// its own column. Every pane has its own picker over the same options as the
// main model picker (router "auto" included). Rounds are independent — no
// pane sees another's answer — and live in memory for the visit.

export const COMPARE_STORAGE_KEY = 'playground.compareModels'
export const MIN_PANES = 2
export const MAX_PANES = 4

export interface CompareHandle {
  send: (prompt: string, content: unknown) => Promise<void>
  stop: () => void
  clear: () => void
}

interface PaneResult {
  model: string
  content: string
  reasoning: string
  routed?: { platform?: string; model?: string }
  latency?: number
  error?: string
  streaming: boolean
}

interface Round {
  prompt: string
  panes: PaneResult[]
}

function readCompareModels(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(COMPARE_STORAGE_KEY) ?? 'null')
    if (Array.isArray(raw) && raw.length >= MIN_PANES && raw.every(v => typeof v === 'string')) return raw.slice(0, MAX_PANES)
  } catch { /* fall through */ }
  return ['auto', 'fusion']
}

function writeCompareModels(models: string[]) {
  try { localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(models)) } catch { /* not remembered */ }
}

const TRIGGER = 'flex h-8 w-full items-center justify-between gap-2 whitespace-nowrap rounded-lg border border-input bg-transparent px-3 text-xs outline-none transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

export function CompareView({ handle, v1, options, systemMessages, requestParams, onBusyChange }: {
  handle: Ref<CompareHandle>
  v1: V1Fetch
  options: ModelComboOption[]
  /** System messages prepended to every pane's request. */
  systemMessages: { role: 'system'; content: string }[]
  /** Sampling + advanced options, already in request spelling. */
  requestParams: Record<string, unknown>
  onBusyChange: (busy: boolean) => void
}) {
  const { t } = useI18n()
  const [models, setModels] = useState<string[]>(() => readCompareModels())
  const [rounds, setRounds] = useState<Round[]>([])
  const controllers = useRef<AbortController[]>([])

  const updateModels = (next: string[]) => {
    setModels(next)
    writeCompareModels(next)
  }

  const labelFor = (value: string) => options.find(o => o.value === value)?.label ?? value

  useImperativeHandle(handle, () => ({
    stop: () => { controllers.current.forEach(c => c.abort()); controllers.current = [] },
    clear: () => { controllers.current.forEach(c => c.abort()); controllers.current = []; setRounds([]) },
    send: async (prompt, content) => {
      const roundIndex = rounds.length
      const snapshot = [...models]
      setRounds(prev => [...prev, { prompt, panes: snapshot.map(model => ({ model, content: '', reasoning: '', streaming: true })) }])
      const patch = (pane: number, fn: (p: PaneResult) => PaneResult) => {
        setRounds(prev => prev.map((r, i) => i !== roundIndex ? r : { ...r, panes: r.panes.map((p, j) => j === pane ? fn(p) : p) }))
      }
      onBusyChange(true)
      controllers.current = snapshot.map(() => new AbortController())
      await Promise.all(snapshot.map(async (model, pane) => {
        const start = Date.now()
        const signal = controllers.current[pane]?.signal
        try {
          const body: Record<string, unknown> = {
            messages: [...systemMessages, { role: 'user', content }],
            stream: true,
            ...requestParams,
          }
          if (model !== 'auto') body.model = model
          const res = await v1('/v1/chat/completions', body, signal)
          const routed = parseRoutedVia(res.headers.get('X-Routed-Via'))
          if (!res.ok) {
            const err = await res.json().catch(() => null) as { error?: { message?: string } } | null
            patch(pane, p => ({ ...p, streaming: false, error: err?.error?.message ?? `HTTP ${res.status}`, latency: Date.now() - start }))
            return
          }
          patch(pane, p => ({ ...p, routed }))
          if (res.body && (res.headers.get('Content-Type') ?? '').includes('text/event-stream')) {
            await readChatStream(res.body, {
              onDelta: text => patch(pane, p => ({ ...p, content: p.content + text })),
              onReasoning: text => patch(pane, p => ({ ...p, reasoning: p.reasoning + text })),
              onError: message => patch(pane, p => ({ ...p, error: message })),
            })
            patch(pane, p => ({ ...p, streaming: false, latency: Date.now() - start }))
          } else {
            const data = await res.json() as { choices?: { message?: { content?: string } }[] }
            patch(pane, p => ({ ...p, streaming: false, content: data.choices?.[0]?.message?.content ?? '', latency: Date.now() - start }))
          }
        } catch (err) {
          const aborted = (err as { name?: string })?.name === 'AbortError'
          patch(pane, p => ({ ...p, streaming: false, error: aborted ? t('playgroundAgent.stopped') : err instanceof Error ? err.message : String(err) }))
        }
      }))
      controllers.current = []
      onBusyChange(false)
    },
  }), [models, rounds.length, v1, systemMessages, requestParams, onBusyChange, t])

  const cols = models.length === 2 ? 'md:grid-cols-2' : models.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-4'

  return (
    <div className="space-y-4">
      <div className={`grid grid-cols-1 gap-2 ${cols}`}>
        {models.map((m, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <ModelCombobox
                value={m}
                options={options}
                onSelect={v => updateModels(models.map((x, j) => (j === i ? v : x)))}
                ariaLabel={t('playgroundAgent.comparePaneModel', { n: i + 1 })}
                placeholder={t('playground.searchModels')}
                emptyText={t('playground.noModelsFound')}
                triggerClassName={TRIGGER}
              />
            </div>
            {models.length > MIN_PANES && (
              <Button variant="ghost" size="icon-sm" onClick={() => updateModels(models.filter((_, j) => j !== i))} aria-label={t('common.remove')} title={t('common.remove')}>
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
      {models.length < MAX_PANES && (
        <Button variant="outline" size="sm" onClick={() => updateModels([...models, 'auto'])}>
          <Plus /> {t('playgroundAgent.compareAddPane')}
        </Button>
      )}

      {rounds.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-base font-medium">{t('playgroundAgent.compareEmptyTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('playgroundAgent.compareEmptyHelp')}</p>
        </div>
      ) : rounds.map((round, ri) => (
        <div key={ri} className="space-y-2">
          <div className="flex justify-end">
            <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">{round.prompt}</div>
          </div>
          <div className={`grid grid-cols-1 gap-3 ${round.panes.length === 2 ? 'md:grid-cols-2' : round.panes.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-4'}`}>
            {round.panes.map((p, pi) => (
              <div key={pi} className="group min-w-0 rounded-xl border bg-card p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {(p.routed?.model || p.routed?.platform) && <ModelMakerIcon modelId={p.routed?.model} platform={p.routed?.platform} className="size-3" />}
                  <span className="min-w-0 truncate font-mono">{p.routed?.model ?? labelFor(p.model)}</span>
                  {p.model !== (p.routed?.model ?? p.model) && <span className="shrink-0 opacity-70">· {labelFor(p.model)}</span>}
                  {p.latency != null && !p.streaming && <span className="ms-auto shrink-0 tabular-nums">{p.latency} ms</span>}
                  {p.streaming && <span className="ms-auto size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />}
                </div>
                {p.reasoning && (
                  <details className="mb-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-mono text-[10px]">{t('playgroundAgent.thinking')}</summary>
                    <div className="mt-1 whitespace-pre-wrap border-s ps-2">{p.reasoning}</div>
                  </details>
                )}
                {p.content
                  ? <div className="text-sm leading-relaxed"><Markdown>{p.content}</Markdown></div>
                  : p.streaming && !p.error && <p className="text-xs text-muted-foreground">…</p>}
                {p.error && (
                  <div className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                    <span className="break-words">{p.error}</span>
                  </div>
                )}
                {p.content && !p.streaming && (
                  <CopyButton text={p.content} label={t('playground.copyReply')} className="mt-1 size-5 border-0 bg-transparent opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-60 hover:!opacity-100" />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
