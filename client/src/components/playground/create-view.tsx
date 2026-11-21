import { useEffect, useImperativeHandle, useMemo, useState, type Ref } from 'react'
import { CircleAlert, Download, Image as ImageIcon, Loader2, Video, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { executeAgentTool, type AgentToolEnv } from '@/lib/agent-tools'
import { downloadBytes, type WorkspaceFile } from '@/lib/agent-workspace'
import { useI18n } from '@/i18n'

// The Create studio: type a prompt, get an image, a video or speech straight
// from the gateway's media endpoints (no chat model in between). Results are
// saved in the agent workspace (images/, videos/, audio/), so they also show
// up in the Files drawer and the agent can use them.

export type CreateKind = 'image' | 'video' | 'speech'
export const CREATE_KIND_KEY = 'playground.createKind'

export interface CreateHandle {
  send: (prompt: string) => Promise<void>
}

interface CreateItem {
  kind: CreateKind
  prompt: string
  status: 'running' | 'done' | 'failed'
  path?: string
  message?: string
}

const KIND_ICON = { image: ImageIcon, video: Video, speech: Volume2 }
const IMAGE_SIZES = ['1024x1024', '1024x1792', '1792x1024', '512x512']

function readKind(): CreateKind {
  try {
    const v = localStorage.getItem(CREATE_KIND_KEY)
    return v === 'video' || v === 'speech' ? v : 'image'
  } catch { return 'image' }
}

function MediaPreview({ file }: { file: WorkspaceFile }) {
  const url = useMemo(() => URL.createObjectURL(new Blob([file.data as BlobPart], { type: file.mime })), [file])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  if (file.mime.startsWith('image/')) return <img src={url} alt={file.path} className="max-h-96 w-full rounded-lg object-contain" />
  if (file.mime.startsWith('video/')) return <video src={url} controls className="max-h-96 w-full rounded-lg" />
  return <audio src={url} controls className="w-full" />
}

export function CreateView({ handle, env, onBusyChange }: {
  handle: Ref<CreateHandle>
  env: AgentToolEnv
  onBusyChange: (busy: boolean) => void
}) {
  const { t } = useI18n()
  const [kind, setKind] = useState<CreateKind>(() => readKind())
  const [size, setSize] = useState(IMAGE_SIZES[0])
  const [duration, setDuration] = useState(5)
  const [ratio, setRatio] = useState<'16:9' | '9:16'>('16:9')
  const [voice, setVoice] = useState('')
  const [items, setItems] = useState<CreateItem[]>([])

  const pickKind = (k: CreateKind) => {
    setKind(k)
    try { localStorage.setItem(CREATE_KIND_KEY, k) } catch { /* not remembered */ }
  }

  const available: Record<CreateKind, boolean> = { image: env.capabilities.image, video: env.capabilities.video, speech: env.capabilities.speech }

  useImperativeHandle(handle, () => ({
    send: async prompt => {
      const index = items.length
      setItems(prev => [...prev, { kind, prompt, status: 'running' }])
      onBusyChange(true)
      const [tool, args] = kind === 'image'
        ? ['generate_image', { prompt, size }]
        : kind === 'video'
          ? ['generate_video', { prompt, duration, aspect_ratio: ratio }]
          : ['text_to_speech', { text: prompt, ...(voice.trim() ? { voice: voice.trim() } : {}) }]
      const out = await executeAgentTool(tool, JSON.stringify(args), env)
      setItems(prev => prev.map((it, i) => i !== index ? it : {
        ...it,
        status: out.ok && out.files?.length ? 'done' : 'failed',
        path: out.files?.[0],
        message: out.content,
      }))
      onBusyChange(false)
    },
  }), [items.length, kind, size, duration, ratio, voice, env, onBusyChange])

  const select = 'h-8 rounded-lg border border-input bg-transparent px-2 text-xs dark:bg-input/30'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="inline-flex gap-1 rounded-xl border p-1">
          {(['image', 'video', 'speech'] as const).map(k => {
            const Icon = KIND_ICON[k]
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => pickKind(k)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs ${kind === k ? 'bg-foreground font-medium text-background' : 'text-muted-foreground hover:bg-muted'}`}
              >
                <Icon className="size-3.5" /> {t(`playgroundAgent.create.${k}`)}
              </button>
            )
          })}
        </div>
        {kind === 'image' && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {t('playgroundAgent.create.size')}
            <select value={size} onChange={e => setSize(e.target.value)} className={select}>
              {IMAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        {kind === 'video' && (
          <>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {t('playgroundAgent.create.duration')}
              <input type="number" min={1} max={120} value={duration} onChange={e => setDuration(Math.min(120, Math.max(1, Number(e.target.value) || 5)))} className={`${select} w-16`} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {t('playgroundAgent.create.aspect')}
              <select value={ratio} onChange={e => setRatio(e.target.value as '16:9' | '9:16')} className={select}>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
              </select>
            </label>
          </>
        )}
        {kind === 'speech' && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {t('playgroundAgent.create.voice')}
            <input value={voice} onChange={e => setVoice(e.target.value)} placeholder={t('playgroundAgent.create.voiceDefault')} className={`${select} w-32`} />
          </label>
        )}
      </div>

      {!available[kind] && (
        <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{t('playgroundAgent.create.unavailable')}</span>
        </div>
      )}

      {items.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-base font-medium">{t('playgroundAgent.create.emptyTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('playgroundAgent.create.emptyHelp')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((it, i) => {
            const file = it.path ? env.workspace.get(it.path) : undefined
            const Icon = KIND_ICON[it.kind]
            return (
              <div key={i} className="space-y-2 rounded-xl border bg-card p-3">
                <div className="flex items-start gap-2 text-xs">
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <p className="min-w-0 flex-1 whitespace-pre-wrap">{it.prompt}</p>
                  {it.status === 'running' && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
                  {file && (
                    <Button variant="ghost" size="icon-xs" onClick={() => downloadBytes(file.path.split('/').pop() || file.path, file.data, file.mime)} aria-label={t('playgroundAgent.download')} title={t('playgroundAgent.download')}>
                      <Download />
                    </Button>
                  )}
                </div>
                {it.status === 'running' && <p className="text-[11px] text-muted-foreground">{t(it.kind === 'video' ? 'playgroundAgent.create.workingVideo' : 'playgroundAgent.create.working')}</p>}
                {file && <MediaPreview file={file} />}
                {file && <p className="font-mono text-[10px] text-muted-foreground">{file.path}</p>}
                {it.status === 'failed' && (
                  <div className="flex items-start gap-1.5 text-xs text-destructive">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                    <span className="break-words">{it.message}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
