import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { PasswordInput } from '@/components/ui/password-input'
import { githubApi, type GithubStatus } from '@/lib/agent-runtime'
import {
  ADVANCED_NUMBER_FIELDS, ADVANCED_RANGES, MAX_STOP_SEQUENCES, REASONING_EFFORTS, advancedActiveCount, clampAdvanced,
  formatAdvancedValue, type AdvancedNumberField, type AdvancedSettings, type ReasoningEffort,
} from '@/lib/playground-advanced'
import { toast } from '@/lib/toast'
import { useI18n } from '@/i18n'

// Extra sections for the Playground settings rail: advanced request options
// and the GitHub connection the agent's GitHub tools use.

const ADVANCED_LABEL: Record<AdvancedNumberField, string> = {
  seed: 'playgroundAgent.advanced.seed',
  topK: 'playgroundAgent.advanced.topK',
  minP: 'playgroundAgent.advanced.minP',
  frequencyPenalty: 'playgroundAgent.advanced.frequencyPenalty',
  presencePenalty: 'playgroundAgent.advanced.presencePenalty',
  repetitionPenalty: 'playgroundAgent.advanced.repetitionPenalty',
}

const BOX = 'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 font-mono text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'

export function AdvancedOptionsSection({ settings, onChange }: { settings: AdvancedSettings; onChange: (next: AdvancedSettings) => void }) {
  const { t } = useI18n()
  const active = advancedActiveCount(settings)
  const [open, setOpen] = useState(active > 0)
  const setNumber = (f: AdvancedNumberField, patch: Partial<{ enabled: boolean; value: number }>) =>
    onChange({ ...settings, [f]: { ...settings[f], ...patch, ...(patch.value !== undefined ? { value: clampAdvanced(f, patch.value) } : {}) } })

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex w-full items-center gap-1 text-start text-xs font-medium">
        <ChevronRight className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="flex-1">{t('playgroundAgent.advanced.heading')}</span>
        {active > 0 && <span className="rounded-full bg-primary/15 px-1.5 text-[10px] tabular-nums text-primary">{active}</span>}
      </button>
      {open && (
        <div className="space-y-3">
          <p className="text-[11px] leading-snug text-muted-foreground">{t('playgroundAgent.advanced.help')}</p>
          {ADVANCED_NUMBER_FIELDS.map(f => {
            const c = settings[f]
            const r = ADVANCED_RANGES[f]
            const label = t(ADVANCED_LABEL[f])
            const slider = f !== 'seed' && f !== 'topK'
            return (
              <div key={f} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <label htmlFor={`playground-adv-${f}`} className={`flex-1 truncate text-xs font-medium ${c.enabled ? '' : 'text-muted-foreground'}`}>{label}</label>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{c.enabled ? formatAdvancedValue(f, c.value) : t('playground.samplingDefault')}</span>
                  <Switch size="sm" aria-label={label} checked={c.enabled} onCheckedChange={enabled => setNumber(f, { enabled })} />
                </div>
                <input
                  id={`playground-adv-${f}`}
                  type={slider ? 'range' : 'number'}
                  inputMode={slider ? undefined : 'numeric'}
                  min={r.min}
                  max={r.max}
                  step={r.step}
                  disabled={!c.enabled}
                  value={c.value}
                  onChange={e => setNumber(f, { value: Number(e.target.value) })}
                  aria-label={label}
                  className={slider ? 'w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50' : BOX}
                />
              </div>
            )
          })}
          <div className="space-y-1.5">
            <label htmlFor="playground-adv-stop" className="block text-xs font-medium">{t('playgroundAgent.advanced.stop')}</label>
            <textarea
              id="playground-adv-stop"
              rows={2}
              value={settings.stop.join('\n')}
              onChange={e => onChange({ ...settings, stop: e.target.value.split('\n').slice(0, MAX_STOP_SEQUENCES) })}
              placeholder={t('playgroundAgent.advanced.stopPlaceholder', { max: MAX_STOP_SEQUENCES })}
              className="w-full resize-y rounded-lg border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="playground-adv-json" className="flex-1 text-xs font-medium">{t('playgroundAgent.advanced.json')}</label>
            <Switch id="playground-adv-json" size="sm" checked={settings.json} onCheckedChange={json => onChange({ ...settings, json })} />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="playground-adv-effort" className="flex-1 text-xs font-medium">{t('playgroundAgent.advanced.reasoningEffort')}</label>
            <select
              id="playground-adv-effort"
              value={settings.reasoningEffort ?? ''}
              onChange={e => onChange({ ...settings, reasoningEffort: (e.target.value || null) as ReasoningEffort | null })}
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs dark:bg-input/30"
            >
              <option value="">{t('playground.samplingDefault')}</option>
              {REASONING_EFFORTS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

export function GithubSection() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [token, setToken] = useState('')
  const { data, isLoading } = useQuery<GithubStatus>({ queryKey: ['playground-github'], queryFn: githubApi.status, staleTime: 60_000 })
  const connect = useMutation({
    mutationFn: (value: string) => githubApi.connect(value),
    onSuccess: status => {
      queryClient.setQueryData(['playground-github'], status)
      setToken('')
      toast.success(t('playgroundAgent.github.connected', { login: status.login ?? '' }))
    },
  })
  const disconnect = useMutation({
    mutationFn: githubApi.disconnect,
    onSuccess: status => queryClient.setQueryData(['playground-github'], status),
  })

  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <span className="flex items-center gap-1.5 text-xs font-medium"><GitBranch className="size-3.5" /> {t('playgroundAgent.github.heading')}</span>
        <p className="text-[11px] leading-snug text-muted-foreground">{t('playgroundAgent.github.help')}</p>
      </div>
      {isLoading ? null : data?.connected ? (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs">
            {data.login ? t('playgroundAgent.github.signedInAs', { login: data.login }) : data.error ?? t('playgroundAgent.github.connectedNoLogin')}
          </span>
          <Button variant="outline" size="xs" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
            {t('playgroundAgent.github.disconnect')}
          </Button>
        </div>
      ) : (
        <form
          className="space-y-1.5"
          onSubmit={e => { e.preventDefault(); if (token.trim()) connect.mutate(token.trim()) }}
        >
          <PasswordInput
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder={t('playgroundAgent.github.tokenPlaceholder')}
            aria-label={t('playgroundAgent.github.tokenLabel')}
            autoComplete="off"
            className="h-8 text-xs"
          />
          <Button type="submit" size="sm" className="w-full" disabled={!token.trim() || connect.isPending}>
            {t('playgroundAgent.github.connect')}
          </Button>
          <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer" className="block text-[11px] text-primary underline-offset-2 hover:underline">
            {t('playgroundAgent.github.createToken')}
          </a>
        </form>
      )}
    </div>
  )
}
