import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen, Download, File as FileIcon, FileArchive, FolderOpen, Loader2, PackageOpen, Trash2, Upload, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { useI18n } from '@/i18n'
import {
  downloadBytes, formatSize, looksLikeText, type AgentWorkspace, type WorkspaceFile,
} from '@/lib/agent-workspace'
import { createZip, detectArchiveFormat, extractArchive } from '@/lib/archive'
import { indexDocument, type EmbedFn } from '@/lib/knowledge'
import type { KnowledgeStore } from '@/lib/knowledge-store'

// The agent's Files and Knowledge drawer. Slides over the page from the end
// edge: full width on a phone, a fixed column on wider screens, so it works
// the same on every device the dashboard runs on.

const PREVIEW_TEXT_LIMIT = 200_000
/** Largest single knowledge file read into the browser. */
export const MAX_KNOWLEDGE_FILE_BYTES = 10 * 1024 * 1024

function FilePreview({ file }: { file: WorkspaceFile }) {
  const { t } = useI18n()
  const url = useMemo(() => {
    if (!/^(image|audio|video)\//.test(file.mime) || file.mime === 'image/svg+xml') return null
    return URL.createObjectURL(new Blob([file.data as BlobPart], { type: file.mime }))
  }, [file])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  if (url && file.mime.startsWith('image/')) return <img src={url} alt={file.path} className="max-h-[50vh] w-full rounded-lg object-contain" />
  if (url && file.mime.startsWith('audio/')) return <audio src={url} controls className="w-full" />
  if (url && file.mime.startsWith('video/')) return <video src={url} controls className="max-h-[50vh] w-full rounded-lg" />
  if (looksLikeText(file.path, file.data)) {
    const text = new TextDecoder().decode(file.data.subarray(0, PREVIEW_TEXT_LIMIT))
    return (
      <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-2 font-mono text-[11px]">
        {text}{file.data.length > PREVIEW_TEXT_LIMIT ? `\n… ${t('playgroundAgent.previewTruncated')}` : ''}
      </pre>
    )
  }
  return <p className="text-xs text-muted-foreground">{t('playgroundAgent.noPreview')}</p>
}

function baseName(path: string): string {
  return path.split('/').pop() || path
}

export function WorkspaceDrawer({ open, onClose, workspace, knowledge, embed, initialTab, focusPath }: {
  open: boolean
  onClose: () => void
  workspace: AgentWorkspace
  knowledge: KnowledgeStore
  embed: EmbedFn | null
  initialTab?: 'files' | 'knowledge'
  focusPath?: string | null
}) {
  const { t } = useI18n()
  const [tab, setTab] = useState<'files' | 'knowledge'>(initialTab ?? 'files')
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const knowledgeRef = useRef<HTMLInputElement>(null)
  const files = workspace.list()
  const docs = knowledge.list()
  const current = selected ? files.find(f => f.path === selected) ?? null : null

  // Opening the drawer from a file chip lands on that file. Adjusting state
  // while rendering (not in an effect) is React's pattern for props-driven resets.
  const [lastFocus, setLastFocus] = useState<string | null | undefined>(undefined)
  if (open && focusPath !== lastFocus) {
    setLastFocus(focusPath)
    if (focusPath) { setTab('files'); setSelected(focusPath) }
  }
  const [lastTab, setLastTab] = useState(initialTab)
  if (initialTab !== lastTab) {
    setLastTab(initialTab)
    if (initialTab) setTab(initialTab)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    try { await fn() } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally { setBusy(null) }
  }

  const uploadFiles = (list: File[]) => run('upload', async () => {
    for (const f of list) await workspace.write(f.name, new Uint8Array(await f.arrayBuffer()))
    if (list.length > 0) toast.success(t('playgroundAgent.uploaded', { count: list.length }))
  })

  const downloadAll = () => run('zip', async () => {
    const zip = await createZip(files.map(f => ({ path: f.path, data: f.data, mtime: new Date(f.updatedAt) })))
    downloadBytes('workspace.zip', zip, 'application/zip')
  })

  const extract = (file: WorkspaceFile) => run('extract', async () => {
    const entries = await extractArchive(file.data, file.path)
    const dest = file.path.replace(/(\.tar\.gz|\.tgz|\.zip|\.tar)$/i, '') || 'extracted'
    for (const e of entries) await workspace.write(`${dest}/${e.path}`, e.data)
    toast.success(t('playgroundAgent.extracted', { count: entries.length, folder: dest }))
  })

  const addKnowledge = (list: File[]) => run('knowledge', async () => {
    for (const f of list) {
      if (f.size > MAX_KNOWLEDGE_FILE_BYTES) {
        toast.error(t('playgroundAgent.knowledgeTooLarge', { name: f.name, max: formatSize(MAX_KNOWLEDGE_FILE_BYTES) }))
        continue
      }
      const bytes = new Uint8Array(await f.arrayBuffer())
      if (!looksLikeText(f.name, bytes)) {
        toast.error(t('playgroundAgent.knowledgeNotText', { name: f.name }))
        continue
      }
      const doc = await indexDocument(f.name, new TextDecoder().decode(bytes), embed)
      await knowledge.add(doc)
      if (!doc.embeddingModel) toast.info(t('playgroundAgent.knowledgeKeywordOnly', { name: f.name }))
    }
  })

  return (
    <>
      {/* Scrim: closes on tap, dims the page on small screens. */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 sm:bg-black/10 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('playgroundAgent.workspaceTitle')}
        inert={!open}
        className={`fixed inset-y-0 end-0 z-50 flex w-full flex-col border-s bg-card shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none sm:w-[30rem] ${
          open ? 'translate-x-0' : 'translate-x-full rtl:-translate-x-full'
        }`}
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <div role="tablist" className="flex flex-1 gap-1">
            {(['files', 'knowledge'] as const).map(k => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ${tab === k ? 'bg-foreground font-medium text-background' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {k === 'files' ? <FolderOpen className="size-3.5" /> : <BookOpen className="size-3.5" />}
                {k === 'files' ? t('playgroundAgent.files') : t('playgroundAgent.knowledge')}
                <span className="tabular-nums opacity-70">{k === 'files' ? files.length : docs.length}</span>
              </button>
            ))}
          </div>
          {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('playgroundAgent.close')} title={t('playgroundAgent.close')}>
            <X className="size-4" />
          </Button>
        </div>

        {tab === 'files' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2">
              <input ref={uploadRef} type="file" multiple className="hidden" onChange={e => { uploadFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
              <Button variant="outline" size="sm" onClick={() => uploadRef.current?.click()} disabled={!!busy}>
                <Upload /> {t('playgroundAgent.upload')}
              </Button>
              <Button variant="outline" size="sm" onClick={downloadAll} disabled={!!busy || files.length === 0}>
                <Download /> {t('playgroundAgent.downloadAll')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ms-auto text-destructive"
                disabled={!!busy || files.length === 0}
                onClick={() => { if (window.confirm(t('playgroundAgent.clearConfirm'))) void run('clear', () => workspace.clear()) }}
              >
                <Trash2 /> {t('playgroundAgent.clear')}
              </Button>
            </div>
            <p className="shrink-0 px-3 pt-2 text-[11px] text-muted-foreground">
              {t('playgroundAgent.workspaceHelp', { size: formatSize(workspace.totalBytes()) })}
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {files.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t('playgroundAgent.noFiles')}</p>
              ) : (
                <ul className="space-y-0.5">
                  {files.map(f => {
                    const isArchive = detectArchiveFormat(f.data, f.path) !== null
                    const active = f.path === selected
                    return (
                      <li key={f.path} className={`group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${active ? 'bg-muted' : 'hover:bg-muted/60'}`}>
                        <button type="button" onClick={() => setSelected(active ? null : f.path)} className="flex min-w-0 flex-1 items-center gap-1.5 text-start">
                          {isArchive ? <FileArchive className="size-3.5 shrink-0" /> : <FileIcon className="size-3.5 shrink-0" />}
                          <span className="min-w-0 truncate font-mono">{f.path}</span>
                          <span className="ms-auto shrink-0 tabular-nums text-muted-foreground">{formatSize(f.data.length)}</span>
                        </button>
                        {isArchive && (
                          <Button variant="ghost" size="icon-xs" onClick={() => extract(f)} disabled={!!busy} aria-label={t('playgroundAgent.extract')} title={t('playgroundAgent.extract')}>
                            <PackageOpen />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon-xs" onClick={() => downloadBytes(baseName(f.path), f.data, f.mime)} aria-label={t('playgroundAgent.download')} title={t('playgroundAgent.download')}>
                          <Download />
                        </Button>
                        <Button variant="ghost" size="icon-xs" onClick={() => { void workspace.remove(f.path); if (active) setSelected(null) }} aria-label={t('common.delete')} title={t('common.delete')}>
                          <Trash2 />
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            {current && (
              <div className="max-h-[55%] shrink-0 space-y-1.5 overflow-y-auto border-t p-3">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{current.path}</span>
                  <span className="text-[11px] text-muted-foreground">{current.mime}</span>
                </div>
                <FilePreview file={current} />
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 space-y-2 border-b px-3 py-2">
              <input ref={knowledgeRef} type="file" multiple className="hidden" onChange={e => { addKnowledge([...(e.target.files ?? [])]); e.target.value = '' }} />
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => knowledgeRef.current?.click()} disabled={!!busy}>
                  <Upload /> {t('playgroundAgent.addKnowledge')}
                </Button>
                {busy === 'knowledge' && <span className="text-[11px] text-muted-foreground">{t('playgroundAgent.indexing')}</span>}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">{t('playgroundAgent.knowledgeHelp')}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {docs.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t('playgroundAgent.noKnowledge')}</p>
              ) : (
                <ul className="space-y-1">
                  {docs.map(d => (
                    <li key={d.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
                      <BookOpen className="size-3.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{d.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {t('playgroundAgent.knowledgeChunks', { count: d.chunks.length })} · {d.embeddingModel
                            ? t('playgroundAgent.knowledgeSemantic', { model: d.embeddingModel })
                            : t('playgroundAgent.knowledgeKeyword')}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon-xs" onClick={() => void knowledge.remove(d.id)} aria-label={t('common.remove')} title={t('common.remove')}>
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
