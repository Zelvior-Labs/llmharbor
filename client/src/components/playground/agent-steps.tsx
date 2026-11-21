import { useState } from 'react'
import {
  Archive, BookOpen, Check, ChevronRight, FilePen, FileText, FolderTree, GitBranch, Globe, Image as ImageIcon,
  Loader2, PackageOpen, Trash2, Video, Volume2, Wrench, X,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { stepSummary, type AgentStep } from '@/lib/agent-loop'
import { useI18n } from '@/i18n'

// The agent's tool calls, shown above its answer: one row per call with a
// one-line summary, expandable to the raw arguments and the result the model
// saw. Open while the agent works, collapsible afterwards.

const TOOL_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  list_files: FolderTree,
  read_file: FileText,
  write_file: FilePen,
  edit_file: FilePen,
  delete_file: Trash2,
  create_archive: Archive,
  extract_archive: PackageOpen,
  web_search: Globe,
  generate_image: ImageIcon,
  generate_video: Video,
  text_to_speech: Volume2,
  search_knowledge: BookOpen,
  github_request: GitBranch,
  github_download_repo: GitBranch,
  github_push_files: GitBranch,
}

function StepRow({ step, onOpenFile }: { step: AgentStep; onOpenFile?: (path: string) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const Icon = TOOL_ICONS[step.tool] ?? Wrench
  const summary = stepSummary(step)
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-start hover:bg-muted/60"
      >
        <ChevronRight className={`size-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        <Icon className="size-3.5 shrink-0" />
        <span className="shrink-0 font-mono">{step.tool}</span>
        {summary && <span className="min-w-0 truncate opacity-70">{summary}</span>}
        <span className="ms-auto shrink-0">
          {step.running
            ? <Loader2 className="size-3 animate-spin" aria-label={t('playgroundAgent.stepRunning')} />
            : step.ok
              ? <Check className="size-3 text-emerald-600 dark:text-emerald-400" aria-label={t('playgroundAgent.stepOk')} />
              : <X className="size-3 text-destructive" aria-label={t('playgroundAgent.stepFailed')} />}
        </span>
      </button>
      {step.files && step.files.length > 0 && onOpenFile && (
        <div className="ms-6 mt-0.5 flex flex-wrap gap-1">
          {step.files.slice(0, 8).map(f => (
            <button key={f} type="button" onClick={() => onOpenFile(f)} className="max-w-[16rem] truncate rounded border px-1.5 py-px font-mono text-[10px] hover:bg-muted">
              {f}
            </button>
          ))}
          {step.files.length > 8 && <span className="text-[10px] opacity-70">+{step.files.length - 8}</span>}
        </div>
      )}
      {open && (
        <div className="ms-6 mt-1 space-y-1">
          {step.args && step.args !== '{}' && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/60 p-2 font-mono text-[10px]">{step.args}</pre>
          )}
          {step.result && (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border p-2 font-mono text-[10px]">{step.result}</pre>
          )}
        </div>
      )}
    </li>
  )
}

export function AgentSteps({ steps, working, onOpenFile }: {
  steps: AgentStep[]
  working?: boolean
  onOpenFile?: (path: string) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(true)
  if (steps.length === 0 && !working) return null
  return (
    <div className="mb-2 w-full text-[11px] leading-snug text-muted-foreground">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 font-mono text-[10px] hover:text-foreground"
      >
        <ChevronRight className={`size-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        {t('playgroundAgent.steps', { count: steps.length })}
        {working && <Loader2 className="size-3 animate-spin" />}
      </button>
      {open && steps.length > 0 && (
        <ol className="mt-1 space-y-0.5 border-s border-border/60 ps-2">
          {steps.map((s, i) => <StepRow key={i} step={s} onOpenFile={onOpenFile} />)}
        </ol>
      )}
    </div>
  )
}
