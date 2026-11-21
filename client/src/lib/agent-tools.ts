// The Playground agent's tools: OpenAI function definitions plus the executor
// that runs a model's tool call in the browser and returns the text handed
// back to the model.
//
// Every capability goes through something the gateway already has:
//   files / archives  -> the browser workspace (agent-workspace.ts, archive.ts)
//   web_search        -> POST /v1/search
//   generate_image    -> POST /v1/images/generations
//   generate_video    -> POST /v1/videos/generations
//   text_to_speech    -> POST /v1/audio/speech
//   search_knowledge  -> attached files, embedded with POST /v1/embeddings
//   github_*          -> /api/playground/github (server relay to api.github.com)
//
// The environment is injected, so the executor is unit-testable with fakes.

import { AgentWorkspace, WorkspaceError, guessMime, looksLikeText, formatSize } from './agent-workspace'
import { ArchiveError, archiveExtension, createArchive, extractArchive, type ArchiveFormat } from './archive'
import { searchKnowledge, type EmbedFn, type KnowledgeDoc } from './knowledge'

export interface ToolDefinition {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface GithubReply {
  status: number
  data?: unknown
  base64?: string
  contentType?: string
}

export interface AgentToolEnv {
  workspace: AgentWorkspace
  /** POST to the gateway's /v1 API with the inference key. */
  v1: (path: string, body: unknown, signal?: AbortSignal) => Promise<Response>
  /** Relay one GitHub REST call. Throws when the relay itself fails. */
  github: (method: string, path: string, body?: unknown) => Promise<GithubReply>
  capabilities: {
    webSearch: boolean
    image: boolean
    video: boolean
    speech: boolean
    github: boolean
    knowledge: boolean
  }
  knowledge: () => KnowledgeDoc[]
  embed: EmbedFn | null
  signal?: AbortSignal
}

export interface ToolOutcome {
  ok: boolean
  /** What the model sees. */
  content: string
  /** Workspace paths this call created or changed, for the UI. */
  files?: string[]
}

/** Longest tool result handed back to the model, in characters. */
export const MAX_TOOL_RESULT_CHARS = 24_000
// Below MAX_TOOL_RESULT_CHARS, so the "read again with offset" hint is never truncated away.
const MAX_READ_CHARS = 20_000

const str = { type: 'string' } as const
const int = { type: 'integer' } as const

function fn(name: string, description: string, properties: Record<string, unknown>, required: string[] = []): ToolDefinition {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } }
}

const FILE_TOOLS: ToolDefinition[] = [
  fn('list_files', 'List files in the workspace (path and size). Optionally only under one folder.', { folder: { ...str, description: 'Folder to list; omit for everything.' } }),
  fn('read_file', 'Read a text file from the workspace. Long files can be read in parts with offset/limit (characters).', {
    path: str, offset: { ...int, description: 'Start character, default 0.' }, limit: { ...int, description: `Characters to read, default and max ${MAX_READ_CHARS}.` },
  }, ['path']),
  fn('write_file', 'Create or overwrite a text file in the workspace with the full content. Folders are created as needed.', { path: str, content: str }, ['path', 'content']),
  fn('edit_file', 'Replace one exact occurrence of old_text with new_text in an existing text file. old_text must match exactly once.', { path: str, old_text: str, new_text: str }, ['path', 'old_text', 'new_text']),
  fn('delete_file', 'Delete a file, or a folder and everything in it.', { path: str }, ['path']),
  fn('create_archive', 'Pack workspace files into a zip, tar or tar.gz archive saved in the workspace.', {
    output: { ...str, description: 'Archive path, e.g. "dist/site.zip". The extension is added when missing.' },
    format: { type: 'string', enum: ['zip', 'tar', 'tar.gz'] },
    folder: { ...str, description: 'Pack this folder (paths inside the archive are relative to it). Omit for the whole workspace.' },
    paths: { type: 'array', items: str, description: 'Pack exactly these files instead of a folder.' },
  }, ['output', 'format']),
  fn('extract_archive', 'Extract a zip, tar or tar.gz from the workspace into a folder.', {
    path: str, destination: { ...str, description: 'Folder to extract into; default is the archive name without its extension.' },
  }, ['path']),
]

const SEARCH_TOOL = fn('web_search', 'Search the web. Returns titles, URLs and snippets to cite.', {
  query: str, max_results: { ...int, description: '1-10, default 5.' },
}, ['query'])

const IMAGE_TOOL = fn('generate_image', 'Generate an image from a prompt and save it in the workspace.', {
  prompt: str, path: { ...str, description: 'Where to save it, e.g. "images/logo.png".' }, size: { ...str, description: 'e.g. "1024x1024".' },
}, ['prompt'])

const VIDEO_TOOL = fn('generate_video', 'Generate a short video from a prompt and save it as MP4 in the workspace. Slow (can take minutes).', {
  prompt: str, path: str, duration: { ...int, description: 'Seconds, 1-120.' }, aspect_ratio: { type: 'string', enum: ['16:9', '9:16'] },
}, ['prompt'])

const SPEECH_TOOL = fn('text_to_speech', 'Turn text into spoken audio and save it in the workspace.', {
  text: str, path: str, voice: str,
}, ['text'])

const KNOWLEDGE_TOOL = fn('search_knowledge', 'Search the files the user attached as knowledge. Returns the most relevant passages.', {
  query: str, top_k: { ...int, description: '1-20, default 5.' },
}, ['query'])

const GITHUB_TOOLS: ToolDefinition[] = [
  fn('github_request', 'Call the GitHub REST API as the connected user, e.g. GET /user/repos, GET /repos/{owner}/{repo}/issues, POST /repos/{owner}/{repo}/issues.', {
    method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
    path: { ...str, description: 'API path starting with "/", query string allowed.' },
    body: { type: 'object', description: 'JSON body for POST/PUT/PATCH.' },
  }, ['method', 'path']),
  fn('github_download_repo', 'Download a repository (or one branch/tag) into the workspace.', {
    owner: str, repo: str, ref: { ...str, description: 'Branch, tag or commit; default branch when omitted.' },
    destination: { ...str, description: 'Workspace folder; default is the repo name.' },
  }, ['owner', 'repo']),
  fn('github_push_files', 'Commit workspace files to a GitHub branch in one commit.', {
    owner: str, repo: str, branch: str, message: str,
    folder: { ...str, description: 'Push every file under this workspace folder.' },
    paths: { type: 'array', items: str, description: 'Or push exactly these workspace files.' },
    target_folder: { ...str, description: 'Folder in the repository to place the files in; default is the root.' },
  }, ['owner', 'repo', 'branch', 'message']),
]

/** The tools this environment can actually serve. */
export function agentToolDefinitions(env: Pick<AgentToolEnv, 'capabilities'>): ToolDefinition[] {
  const c = env.capabilities
  return [
    ...FILE_TOOLS,
    ...(c.webSearch ? [SEARCH_TOOL] : []),
    ...(c.image ? [IMAGE_TOOL] : []),
    ...(c.video ? [VIDEO_TOOL] : []),
    ...(c.speech ? [SPEECH_TOOL] : []),
    ...(c.knowledge ? [KNOWLEDGE_TOOL] : []),
    ...(c.github ? GITHUB_TOOLS : []),
  ]
}

export function truncateForModel(text: string, max = MAX_TOOL_RESULT_CHARS): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n… [truncated ${text.length - max} characters]`
}

class ToolInputError extends Error {}

function argString(args: Record<string, unknown>, key: string, required = true): string {
  const v = args[key]
  if (typeof v === 'string' && v.length > 0) return v
  if (v === undefined || v === null || v === '') {
    if (required) throw new ToolInputError(`missing "${key}"`)
    return ''
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  throw new ToolInputError(`"${key}" must be a string`)
}

function argInt(args: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const raw = args[key]
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function argStringList(args: Record<string, unknown>, key: string): string[] {
  const v = args[key]
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
}

/** Parse a tool call's JSON arguments, tolerating the empty string. */
export function parseToolArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw || !raw.trim()) return {}
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ToolInputError('arguments must be a JSON object')
  return parsed as Record<string, unknown>
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step))
  return btoa(bin)
}

async function errorText(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as { error?: { message?: string } | string; message?: string } | null
  const msg = typeof body?.error === 'string' ? body.error : body?.error?.message ?? body?.message
  return msg ? `${msg} (HTTP ${res.status})` : `HTTP ${res.status}`
}

/** A free workspace path: "a.png", then "a-2.png", "a-3.png"… */
function uniquePath(ws: AgentWorkspace, wanted: string): string {
  if (!ws.has(wanted)) return wanted
  const dot = wanted.lastIndexOf('.')
  const stem = dot > wanted.lastIndexOf('/') ? wanted.slice(0, dot) : wanted
  const ext = dot > wanted.lastIndexOf('/') ? wanted.slice(dot) : ''
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${stem}-${i}${ext}`
    if (!ws.has(candidate)) return candidate
  }
  return `${stem}-${Date.now()}${ext}`
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'output'
}

const EXT_FOR_MIME: Record<string, string> = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
  'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/ogg': '.ogg', 'audio/opus': '.opus',
  'audio/flac': '.flac', 'audio/aac': '.aac', 'audio/mp4': '.m4a', 'video/mp4': '.mp4', 'video/webm': '.webm',
}

function sniffImageExt(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return '.png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return '.jpg'
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return '.webp'
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return '.gif'
  return '.png'
}

function withExt(path: string, ext: string): string {
  return /\.[a-z0-9]{2,5}$/i.test(path) ? path : `${path}${ext}`
}

// ---- GitHub helpers ----------------------------------------------------------

function githubFail(reply: GithubReply, what: string): never {
  const msg = (reply.data as { message?: string } | undefined)?.message
  throw new ToolInputError(`${what}: GitHub answered ${reply.status}${msg ? ` (${msg})` : ''}`)
}

const SEGMENT = /^[A-Za-z0-9_.-]+$/

function repoPath(owner: string, repo: string): string {
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo)) throw new ToolInputError('owner and repo may only contain letters, digits, "-", "_" and "."')
  return `/repos/${owner}/${repo}`
}

function encodeRef(ref: string): string {
  return ref.split('/').map(encodeURIComponent).join('/')
}

async function githubDownload(args: Record<string, unknown>, env: AgentToolEnv): Promise<ToolOutcome> {
  const owner = argString(args, 'owner')
  const repo = argString(args, 'repo')
  const ref = argString(args, 'ref', false)
  const base = repoPath(owner, repo)
  const reply = await env.github('GET', `${base}/zipball${ref ? `/${encodeRef(ref)}` : ''}`)
  if (reply.status !== 200 || !reply.base64) githubFail(reply, 'download failed')
  const entries = await extractArchive(base64ToBytes(reply.base64), 'repo.zip')
  // GitHub wraps everything in "<owner>-<repo>-<sha>/": drop that level.
  const top = entries[0]?.path.split('/')[0]
  const stripTop = top && entries.every(e => e.path.startsWith(`${top}/`))
  const dest = argString(args, 'destination', false) || repo
  const written: string[] = []
  for (const e of entries) {
    const rel = stripTop ? e.path.slice(top.length + 1) : e.path
    if (!rel) continue
    const f = await env.workspace.write(`${dest}/${rel}`, e.data)
    written.push(f.path)
  }
  return { ok: true, content: `Downloaded ${owner}/${repo}${ref ? `@${ref}` : ''} into ${dest}/ (${written.length} files).`, files: written }
}

async function githubPush(args: Record<string, unknown>, env: AgentToolEnv): Promise<ToolOutcome> {
  const owner = argString(args, 'owner')
  const repo = argString(args, 'repo')
  const branch = argString(args, 'branch')
  const message = argString(args, 'message')
  const base = repoPath(owner, repo)
  const folder = argString(args, 'folder', false)
  const listed = argStringList(args, 'paths')
  const files = listed.length > 0
    ? listed.map(p => { const f = env.workspace.get(p); if (!f) throw new ToolInputError(`no such file: ${p}`); return f })
    : env.workspace.under(folder)
  if (files.length === 0) throw new ToolInputError('nothing to push')
  if (files.length > 300) throw new ToolInputError('push at most 300 files per commit')
  const strip = folder && listed.length === 0 ? `${folder.replace(/^\/+|\/+$/g, '')}/` : ''
  const target = argString(args, 'target_folder', false).replace(/^\/+|\/+$/g, '')

  const ref = await env.github('GET', `${base}/git/ref/heads/${encodeRef(branch)}`)
  if (ref.status !== 200) githubFail(ref, `branch "${branch}" not found`)
  const parentSha = (ref.data as { object: { sha: string } }).object.sha
  const parent = await env.github('GET', `${base}/git/commits/${parentSha}`)
  if (parent.status !== 200) githubFail(parent, 'could not read the branch head')
  const baseTree = (parent.data as { tree: { sha: string } }).tree.sha

  const tree: { path: string; mode: string; type: string; sha: string }[] = []
  for (const f of files) {
    const blob = await env.github('POST', `${base}/git/blobs`, { content: bytesToBase64(f.data), encoding: 'base64' })
    if (blob.status !== 201) githubFail(blob, `could not upload ${f.path}`)
    const rel = strip && f.path.startsWith(strip) ? f.path.slice(strip.length) : f.path
    tree.push({ path: target ? `${target}/${rel}` : rel, mode: '100644', type: 'blob', sha: (blob.data as { sha: string }).sha })
  }
  const newTree = await env.github('POST', `${base}/git/trees`, { base_tree: baseTree, tree })
  if (newTree.status !== 201) githubFail(newTree, 'could not create the tree')
  const commit = await env.github('POST', `${base}/git/commits`, { message, tree: (newTree.data as { sha: string }).sha, parents: [parentSha] })
  if (commit.status !== 201) githubFail(commit, 'could not create the commit')
  const commitSha = (commit.data as { sha: string; html_url?: string }).sha
  const update = await env.github('PATCH', `${base}/git/refs/heads/${encodeRef(branch)}`, { sha: commitSha })
  if (update.status !== 200) githubFail(update, 'could not move the branch')
  return { ok: true, content: `Committed ${files.length} file(s) to ${owner}/${repo}@${branch}: ${commitSha.slice(0, 7)} https://github.com/${owner}/${repo}/commit/${commitSha}` }
}

// ---- Executor ----------------------------------------------------------------

/** Run one tool call. Never throws: failures come back as { ok: false }. */
export async function executeAgentTool(name: string, rawArgs: string | undefined, env: AgentToolEnv): Promise<ToolOutcome> {
  try {
    const args = parseToolArgs(rawArgs)
    const out = await runTool(name, args, env)
    return { ...out, content: truncateForModel(out.content) }
  } catch (err) {
    if (env.signal?.aborted) return { ok: false, content: 'Stopped by the user.' }
    const message = err instanceof ToolInputError || err instanceof WorkspaceError || err instanceof ArchiveError || err instanceof SyntaxError
      ? err.message
      : err instanceof Error ? err.message : String(err)
    return { ok: false, content: `Error: ${message}` }
  }
}

async function runTool(name: string, args: Record<string, unknown>, env: AgentToolEnv): Promise<ToolOutcome> {
  const ws = env.workspace
  const caps = env.capabilities
  switch (name) {
    case 'list_files': {
      const folder = argString(args, 'folder', false)
      const files = ws.under(folder)
      if (files.length === 0) return { ok: true, content: folder ? `No files under ${folder}.` : 'The workspace is empty.' }
      const lines = files.slice(0, 500).map(f => `${f.path}  (${formatSize(f.data.length)})`)
      if (files.length > 500) lines.push(`… and ${files.length - 500} more`)
      return { ok: true, content: lines.join('\n') }
    }
    case 'read_file': {
      const path = argString(args, 'path')
      const file = ws.get(path)
      if (!file) throw new ToolInputError(`no such file: ${path}`)
      if (!looksLikeText(file.path, file.data)) return { ok: true, content: `${file.path} is a binary file (${file.mime}, ${formatSize(file.data.length)}); it cannot be read as text.` }
      const text = ws.readText(file.path)
      const offset = argInt(args, 'offset', 0, 0, text.length)
      const limit = argInt(args, 'limit', MAX_READ_CHARS, 1, MAX_READ_CHARS)
      const part = text.slice(offset, offset + limit)
      const more = offset + limit < text.length ? `\n… [${text.length - offset - limit} more characters; read again with offset ${offset + limit}]` : ''
      return { ok: true, content: `${part}${more}` }
    }
    case 'write_file': {
      const path = argString(args, 'path')
      const content = typeof args.content === 'string' ? args.content : argString(args, 'content')
      const existed = ws.has(path)
      const f = await ws.write(path, content)
      return { ok: true, content: `${existed ? 'Updated' : 'Created'} ${f.path} (${formatSize(f.data.length)}).`, files: [f.path] }
    }
    case 'edit_file': {
      const path = argString(args, 'path')
      const oldText = typeof args.old_text === 'string' ? args.old_text : ''
      const newText = typeof args.new_text === 'string' ? args.new_text : ''
      if (!oldText) throw new ToolInputError('old_text must not be empty')
      const text = ws.readText(path)
      const first = text.indexOf(oldText)
      if (first === -1) throw new ToolInputError(`old_text was not found in ${path}`)
      if (text.indexOf(oldText, first + 1) !== -1) throw new ToolInputError(`old_text matches more than once in ${path}; include more context`)
      const f = await ws.write(path, text.slice(0, first) + newText + text.slice(first + oldText.length))
      return { ok: true, content: `Edited ${f.path}.`, files: [f.path] }
    }
    case 'delete_file': {
      const path = argString(args, 'path')
      const n = await ws.remove(path)
      if (n === 0) throw new ToolInputError(`no such file or folder: ${path}`)
      return { ok: true, content: `Deleted ${n} file(s).` }
    }
    case 'create_archive': {
      const format = argString(args, 'format') as ArchiveFormat
      if (!['zip', 'tar', 'tar.gz'].includes(format)) throw new ToolInputError('format must be zip, tar or tar.gz')
      const ext = archiveExtension(format)
      let output = argString(args, 'output')
      if (!output.toLowerCase().endsWith(ext)) output += ext
      const listed = argStringList(args, 'paths')
      const folder = argString(args, 'folder', false).replace(/^\/+|\/+$/g, '')
      const source = listed.length > 0
        ? listed.map(p => { const f = ws.get(p); if (!f) throw new ToolInputError(`no such file: ${p}`); return f })
        : ws.under(folder)
      const outputNorm = output.replace(/^\/+/, '')
      const entries = source
        .filter(f => f.path !== outputNorm)
        .map(f => ({ path: folder && listed.length === 0 && f.path.startsWith(`${folder}/`) ? f.path.slice(folder.length + 1) : f.path, data: f.data, mtime: new Date(f.updatedAt) }))
      if (entries.length === 0) throw new ToolInputError('nothing to archive')
      const bytes = await createArchive(format, entries)
      const f = await ws.write(output, bytes)
      return { ok: true, content: `Created ${f.path} with ${entries.length} file(s), ${formatSize(bytes.length)}.`, files: [f.path] }
    }
    case 'extract_archive': {
      const path = argString(args, 'path')
      const file = ws.get(path)
      if (!file) throw new ToolInputError(`no such file: ${path}`)
      const entries = await extractArchive(file.data, file.path)
      const defaultDest = file.path.replace(/(\.tar\.gz|\.tgz|\.zip|\.tar)$/i, '') || 'extracted'
      const dest = (argString(args, 'destination', false) || defaultDest).replace(/^\/+|\/+$/g, '')
      const written: string[] = []
      for (const e of entries) written.push((await ws.write(dest ? `${dest}/${e.path}` : e.path, e.data)).path)
      return { ok: true, content: `Extracted ${written.length} file(s) into ${dest || 'the workspace root'}/.`, files: written }
    }
    case 'web_search': {
      if (!caps.webSearch) throw new ToolInputError('web search is not available (no search engine is set up)')
      const query = argString(args, 'query')
      const res = await env.v1('/v1/search', { query, max_results: argInt(args, 'max_results', 5, 1, 10) }, env.signal)
      if (!res.ok) throw new ToolInputError(`search failed: ${await errorText(res)}`)
      const data = await res.json() as { answer?: string; results: { title: string; url: string; content?: string }[] }
      if (!data.results?.length) return { ok: true, content: 'No results.' }
      const lines = data.results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${(r.content ?? '').slice(0, 1200)}`)
      return { ok: true, content: `${data.answer ? `Answer: ${data.answer}\n\n` : ''}${lines.join('\n\n')}` }
    }
    case 'generate_image': {
      if (!caps.image) throw new ToolInputError('image generation is not available (no image model is enabled)')
      const prompt = argString(args, 'prompt')
      const size = argString(args, 'size', false)
      const res = await env.v1('/v1/images/generations', { prompt, n: 1, response_format: 'b64_json', ...(size ? { size } : {}) }, env.signal)
      if (!res.ok) throw new ToolInputError(`image generation failed: ${await errorText(res)}`)
      const data = await res.json() as { data: { b64_json?: string; url?: string }[]; model?: string; provider?: string }
      const first = data.data?.[0]
      if (first?.b64_json) {
        const bytes = base64ToBytes(first.b64_json)
        const wanted = withExt(argString(args, 'path', false) || `images/${slug(prompt)}`, sniffImageExt(bytes))
        const f = await ws.write(uniquePath(ws, wanted), bytes)
        return { ok: true, content: `Saved the image to ${f.path} (${formatSize(bytes.length)}${data.model ? `, ${data.model}` : ''}).`, files: [f.path] }
      }
      if (first?.url) return { ok: true, content: `The provider returned a link instead of image data: ${first.url}` }
      throw new ToolInputError('the provider returned no image')
    }
    case 'generate_video': {
      if (!caps.video) throw new ToolInputError('video generation is not available (no video model is enabled)')
      const prompt = argString(args, 'prompt')
      const ratio = argString(args, 'aspect_ratio', false)
      const res = await env.v1('/v1/videos/generations', {
        prompt,
        ...(args.duration !== undefined ? { duration: argInt(args, 'duration', 5, 1, 120) } : {}),
        ...(ratio === '16:9' || ratio === '9:16' ? { aspect_ratio: ratio } : {}),
      }, env.signal)
      if (!res.ok) throw new ToolInputError(`video generation failed: ${await errorText(res)}`)
      const type = (res.headers.get('content-type') ?? 'video/mp4').split(';')[0].trim()
      const bytes = new Uint8Array(await res.arrayBuffer())
      const wanted = withExt(argString(args, 'path', false) || `videos/${slug(prompt)}`, EXT_FOR_MIME[type] ?? '.mp4')
      const f = await ws.write(uniquePath(ws, wanted), bytes, type.startsWith('video/') ? type : undefined)
      return { ok: true, content: `Saved the video to ${f.path} (${formatSize(bytes.length)}${res.headers.get('x-model') ? `, ${res.headers.get('x-model')}` : ''}).`, files: [f.path] }
    }
    case 'text_to_speech': {
      if (!caps.speech) throw new ToolInputError('text to speech is not available (no speech model is enabled)')
      const input = argString(args, 'text')
      const voice = argString(args, 'voice', false)
      const res = await env.v1('/v1/audio/speech', { input, ...(voice ? { voice } : {}) }, env.signal)
      if (!res.ok) throw new ToolInputError(`speech failed: ${await errorText(res)}`)
      const type = (res.headers.get('content-type') ?? 'audio/mpeg').split(';')[0].trim()
      const bytes = new Uint8Array(await res.arrayBuffer())
      const wanted = withExt(argString(args, 'path', false) || `audio/${slug(input)}`, EXT_FOR_MIME[type] ?? '.mp3')
      const f = await ws.write(uniquePath(ws, wanted), bytes, type.startsWith('audio/') ? type : guessMime(wanted))
      return { ok: true, content: `Saved the audio to ${f.path} (${formatSize(bytes.length)}).`, files: [f.path] }
    }
    case 'search_knowledge': {
      const docs = env.knowledge()
      if (!caps.knowledge || docs.length === 0) throw new ToolInputError('no knowledge files are attached')
      const hits = await searchKnowledge(argString(args, 'query'), docs, env.embed, argInt(args, 'top_k', 5, 1, 20))
      if (hits.length === 0) return { ok: true, content: 'Nothing relevant found in the attached files.' }
      return { ok: true, content: hits.map((h, i) => `[${i + 1}] ${h.doc} (score ${h.score.toFixed(2)})\n${h.text}`).join('\n\n') }
    }
    case 'github_request': {
      if (!caps.github) throw new ToolInputError('GitHub is not connected')
      const method = argString(args, 'method', false).toUpperCase() || 'GET'
      const path = argString(args, 'path')
      const reply = await env.github(method, path, args.body)
      if (reply.base64 !== undefined) return { ok: reply.status < 400, content: `HTTP ${reply.status}: binary ${reply.contentType ?? ''} response (${formatSize(Math.floor(reply.base64.length * 0.75))}). Use github_download_repo for repository archives.` }
      const text = typeof reply.data === 'string' ? reply.data : JSON.stringify(reply.data, null, 1)
      return { ok: reply.status < 400, content: `HTTP ${reply.status}\n${text ?? ''}` }
    }
    case 'github_download_repo':
      if (!caps.github) throw new ToolInputError('GitHub is not connected')
      return githubDownload(args, env)
    case 'github_push_files':
      if (!caps.github) throw new ToolInputError('GitHub is not connected')
      return githubPush(args, env)
    default:
      throw new ToolInputError(`unknown tool "${name}"`)
  }
}
