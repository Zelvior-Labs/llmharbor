// Playground modes. "chat" is the original Playground; the agent modes run the
// tool loop in agent-loop.ts; "compare" streams one prompt to several models
// side by side; "create" is a direct image / video / speech studio.
//
// The mode is a preference like the model picker, remembered in localStorage.
// The model picker (router "auto" by default) applies to every mode.

import type { WorkspaceFile } from './agent-workspace'
import type { KnowledgeDoc } from './knowledge'

export const PLAYGROUND_MODES = ['chat', 'agent', 'code', 'research', 'compare', 'create'] as const
export type PlaygroundMode = (typeof PLAYGROUND_MODES)[number]
export type AgentMode = Extract<PlaygroundMode, 'agent' | 'code' | 'research'>

export const MODE_STORAGE_KEY = 'playground.mode'

export function isPlaygroundMode(v: unknown): v is PlaygroundMode {
  return typeof v === 'string' && (PLAYGROUND_MODES as readonly string[]).includes(v)
}

export function isAgentMode(mode: PlaygroundMode): mode is AgentMode {
  return mode === 'agent' || mode === 'code' || mode === 'research'
}

export function readMode(storage: Pick<Storage, 'getItem'> = localStorage): PlaygroundMode {
  try {
    const v = storage.getItem(MODE_STORAGE_KEY)
    return isPlaygroundMode(v) ? v : 'chat'
  } catch {
    return 'chat'
  }
}

export function writeMode(mode: PlaygroundMode, storage: Pick<Storage, 'setItem'> = localStorage) {
  try { storage.setItem(MODE_STORAGE_KEY, mode) } catch { /* private mode: not remembered */ }
}

const BASE = `You are an autonomous agent inside the LLMHarbor Playground. You act by calling tools, not by describing what you would do.

The workspace is a virtual folder kept in the user's browser. Files you write there appear in the Files panel, where the user can preview and download them (or download everything as a zip). Use relative paths like "project/src/main.py".

Work step by step: inspect what exists, make the changes, check the result. When a tool fails, read the error and try a different approach. Stop calling tools once the task is done and reply with a short summary of what you did and which files you created or changed. Do not paste the full contents of files that are already in the workspace into your reply.`

const CODE = `You are also an expert software engineer working on a codebase in the workspace.
- Before editing a file, read it. Prefer edit_file for small changes and write_file for new files or rewrites.
- Write complete, working files: no placeholders, no "rest of the code here".
- Keep a sensible project layout (README, source folders, config files) and include run instructions.
- When the user asks for a download, or the project is finished, pack it with create_archive (zip unless asked otherwise).`

const RESEARCH = `You are also a careful researcher.
- Use web_search several times with different phrasings and angles before answering; search_knowledge too when files are attached.
- Compare sources, prefer primary ones, and say when they disagree.
- Answer in well-structured Markdown with numbered citations like [1](https://example.com) that point to the sources you used.
- When the user asks for a report, also save it with write_file under reports/.`

/** Short listing of the workspace for the system prompt. */
export function workspaceSummary(files: Pick<WorkspaceFile, 'path' | 'data'>[], max = 60): string {
  if (files.length === 0) return 'The workspace is empty.'
  const lines = files.slice(0, max).map(f => `- ${f.path} (${f.data.length} bytes)`)
  if (files.length > max) lines.push(`- … and ${files.length - max} more (use list_files)`)
  return `The workspace currently holds ${files.length} file(s):\n${lines.join('\n')}`
}

export function agentSystemPrompt(opts: {
  mode: AgentMode
  userPrompt: string
  files: Pick<WorkspaceFile, 'path' | 'data'>[]
  knowledge: Pick<KnowledgeDoc, 'name'>[]
  toolNames: string[]
}): string {
  const parts = [BASE]
  if (opts.mode === 'code') parts.push(CODE)
  if (opts.mode === 'research') parts.push(RESEARCH)
  parts.push(`Tools available right now: ${opts.toolNames.join(', ')}.`)
  parts.push(workspaceSummary(opts.files))
  if (opts.knowledge.length > 0) {
    parts.push(`The user attached these knowledge files; use search_knowledge to look things up in them: ${opts.knowledge.map(k => k.name).join(', ')}.`)
  }
  if (opts.userPrompt.trim()) parts.push(`Additional instructions from the user:\n${opts.userPrompt.trim()}`)
  return parts.join('\n\n')
}

/**
 * The mode to switch to when a saved conversation is opened: the mode of its
 * last agent turn, so a follow-up keeps working with tools. Compare and Create
 * don't show a saved transcript, so they fall back to Chat; otherwise the
 * current mode stays.
 */
export function modeForConversation(
  messages: ReadonlyArray<{ role: string; meta?: { mode?: string } }>,
  current: PlaygroundMode,
): PlaygroundMode {
  for (let i = messages.length - 1; i >= 0; i--) {
    const saved = messages[i].role === 'assistant' ? messages[i].meta?.mode : undefined
    if (saved && isAgentMode(saved as PlaygroundMode)) return saved as AgentMode
  }
  return current === 'compare' || current === 'create' ? 'chat' : current
}
