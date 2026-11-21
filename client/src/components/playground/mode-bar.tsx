import { Bot, Code2, Columns2, FolderOpen, MessageSquare, Sparkles, Telescope } from 'lucide-react'
import { useEffect, useRef, type ComponentType } from 'react'
import { PLAYGROUND_MODES, type PlaygroundMode } from '@/lib/playground-modes'
import { useI18n } from '@/i18n'

// The Playground's mode switcher: one row of tabs above the transcript. When
// the bar itself is narrow (a phone, or a tablet with both rails open) the
// unselected tabs drop to icons, so all six fit on one line; the row still
// scrolls sideways as a last resort, keeping the selected tab in view. The
// Files button opens the agent workspace drawer.

const ICONS: Record<PlaygroundMode, ComponentType<{ className?: string }>> = {
  chat: MessageSquare,
  agent: Bot,
  code: Code2,
  research: Telescope,
  compare: Columns2,
  create: Sparkles,
}

export function ModeBar({ mode, onModeChange, fileCount, onOpenFiles }: {
  mode: PlaygroundMode
  onModeChange: (mode: PlaygroundMode) => void
  fileCount: number
  onOpenFiles: () => void
}) {
  const { t } = useI18n()
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const tab = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    tab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [mode])
  return (
    <div className="@container flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5 @2xl:gap-2 @2xl:px-3">
      <div ref={listRef} role="tablist" aria-label={t('playgroundAgent.modesLabel')} className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PLAYGROUND_MODES.map(m => {
          const Icon = ICONS[m]
          const selected = m === mode
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={t(`playgroundAgent.mode.${m}`)}
              title={t(`playgroundAgent.mode.${m}Help`)}
              onClick={() => onModeChange(m)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors @2xl:px-2.5 ${
                selected ? 'bg-foreground font-medium text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className={selected ? 'hidden @xs:inline' : 'hidden @2xl:inline'}>{t(`playgroundAgent.mode.${m}`)}</span>
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={onOpenFiles}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs @2xl:px-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={t('playgroundAgent.openFiles')}
        title={t('playgroundAgent.openFiles')}
      >
        <FolderOpen className="size-3.5" />
        <span className="hidden @2xl:inline">{t('playgroundAgent.files')}</span>
        {fileCount > 0 && <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-medium tabular-nums text-primary">{fileCount}</span>}
      </button>
    </div>
  )
}
