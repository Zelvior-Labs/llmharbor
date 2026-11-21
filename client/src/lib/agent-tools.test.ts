import { describe, it, expect, vi } from 'vitest'
import { AgentWorkspace, memoryBackend } from './agent-workspace'
import { agentToolDefinitions, executeAgentTool, parseToolArgs, truncateForModel, type AgentToolEnv, type GithubReply } from './agent-tools'
import { createZip, extractArchive } from './archive'
import { indexDocument } from './knowledge'

const ALL = { webSearch: true, image: true, video: true, speech: true, github: true, knowledge: true }
const NONE = { webSearch: false, image: false, video: false, speech: false, github: false, knowledge: false }

function makeEnv(over: Partial<AgentToolEnv> = {}): AgentToolEnv & { ws: AgentWorkspace } {
  const ws = new AgentWorkspace(memoryBackend())
  return {
    ws,
    workspace: ws,
    v1: vi.fn(async () => new Response('{}', { status: 500 })),
    github: vi.fn(async () => ({ status: 500 })),
    capabilities: ALL,
    knowledge: () => [],
    embed: null,
    ...over,
  }
}

const call = (env: AgentToolEnv, name: string, args: unknown) => executeAgentTool(name, JSON.stringify(args), env)
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

describe('tool definitions', () => {
  it('always offers file tools and gates the rest on capabilities', () => {
    const none = agentToolDefinitions({ capabilities: NONE }).map(t => t.function.name)
    expect(none).toEqual(['list_files', 'read_file', 'write_file', 'edit_file', 'delete_file', 'create_archive', 'extract_archive'])
    const all = agentToolDefinitions({ capabilities: ALL }).map(t => t.function.name)
    expect(all).toEqual(expect.arrayContaining(['web_search', 'generate_image', 'generate_video', 'text_to_speech', 'search_knowledge', 'github_request', 'github_download_repo', 'github_push_files']))
    for (const t of agentToolDefinitions({ capabilities: ALL })) {
      expect(t.function.parameters).toMatchObject({ type: 'object' })
    }
  })
})

describe('file tools', () => {
  it('write, read, list, edit, delete', async () => {
    const env = makeEnv()
    expect((await call(env, 'list_files', {})).content).toBe('The workspace is empty.')
    const w = await call(env, 'write_file', { path: 'app/main.py', content: 'print("hi")\n' })
    expect(w).toMatchObject({ ok: true, files: ['app/main.py'] })
    expect(w.content).toMatch(/^Created app\/main\.py/)
    expect((await call(env, 'write_file', { path: 'app/main.py', content: 'print("hi")\nprint(2)\n' })).content).toMatch(/^Updated/)
    expect((await call(env, 'read_file', { path: 'app/main.py' })).content).toBe('print("hi")\nprint(2)\n')
    expect((await call(env, 'list_files', { folder: 'app' })).content).toContain('app/main.py')
    expect((await call(env, 'edit_file', { path: 'app/main.py', old_text: 'print(2)', new_text: 'print(3)' })).ok).toBe(true)
    expect(env.ws.readText('app/main.py')).toContain('print(3)')
    expect((await call(env, 'delete_file', { path: 'app' })).content).toBe('Deleted 1 file(s).')
    expect(env.ws.list()).toHaveLength(0)
  })

  it('reports errors instead of throwing', async () => {
    const env = makeEnv()
    await env.ws.write('a.txt', 'x x')
    expect(await call(env, 'read_file', { path: 'nope.txt' })).toEqual({ ok: false, content: 'Error: no such file: nope.txt' })
    expect((await call(env, 'edit_file', { path: 'a.txt', old_text: 'x', new_text: 'y' })).content).toMatch(/more than once/)
    expect((await call(env, 'edit_file', { path: 'a.txt', old_text: 'z', new_text: 'y' })).content).toMatch(/not found/)
    expect((await call(env, 'write_file', { path: '../x', content: '' })).ok).toBe(false)
    expect((await call(env, 'write_file', { content: 'no path' })).content).toBe('Error: missing "path"')
    expect((await executeAgentTool('write_file', '{not json', env)).ok).toBe(false)
    expect((await call(env, 'no_such_tool', {})).content).toBe('Error: unknown tool "no_such_tool"')
  })

  it('reads long files in parts and refuses binaries as text', async () => {
    const env = makeEnv()
    await env.ws.write('long.txt', 'a'.repeat(30_000))
    const first = await call(env, 'read_file', { path: 'long.txt' })
    expect(first.content.endsWith('[10000 more characters; read again with offset 20000]')).toBe(true)
    const second = await call(env, 'read_file', { path: 'long.txt', offset: 20000 })
    expect(second.content === 'a'.repeat(10_000)).toBe(true)
    await env.ws.write('pic.png', new Uint8Array([137, 80, 78, 71]))
    expect((await call(env, 'read_file', { path: 'pic.png' })).content).toMatch(/binary file/)
  })

  it('archives a folder and extracts it again', async () => {
    const env = makeEnv()
    await env.ws.write('site/index.html', '<h1>hi</h1>')
    await env.ws.write('site/css/style.css', 'h1{}')
    const made = await call(env, 'create_archive', { output: 'dist/site', format: 'zip', folder: 'site' })
    expect(made).toMatchObject({ ok: true, files: ['dist/site.zip'] })
    const entries = await extractArchive(env.ws.get('dist/site.zip')!.data)
    expect(entries.map(e => e.path).sort()).toEqual(['css/style.css', 'index.html'])

    const out = await call(env, 'extract_archive', { path: 'dist/site.zip', destination: 'copy' })
    expect(out.ok).toBe(true)
    expect(env.ws.readText('copy/css/style.css')).toBe('h1{}')

    const tgz = await call(env, 'create_archive', { output: 'all.tar.gz', format: 'tar.gz' })
    expect(tgz.ok).toBe(true)
    expect((await call(env, 'extract_archive', { path: 'all.tar.gz' })).content).toMatch(/into all\//)
  })

  it('truncates huge results for the model', () => {
    expect(truncateForModel('x'.repeat(30_000))).toMatch(/truncated 6000 characters/)
    expect(parseToolArgs('')).toEqual({})
    expect(() => parseToolArgs('[1]')).toThrow()
  })
})

describe('gateway tools', () => {
  it('web_search formats results and surfaces failures', async () => {
    const v1 = vi.fn(async () => Response.json({ results: [{ title: 'T', url: 'https://t', content: 'snippet' }] }))
    const env = makeEnv({ v1 })
    const out = await call(env, 'web_search', { query: 'q', max_results: 50 })
    expect(out.content).toBe('[1] T\nhttps://t\nsnippet')
    expect(v1).toHaveBeenCalledWith('/v1/search', { query: 'q', max_results: 10 }, undefined)
    const failing = makeEnv({ v1: vi.fn(async () => Response.json({ error: { message: 'no engines' } }, { status: 503 })) })
    expect((await call(failing, 'web_search', { query: 'q' })).content).toBe('Error: search failed: no engines (HTTP 503)')
    const off = makeEnv({ capabilities: NONE })
    expect((await call(off, 'web_search', { query: 'q' })).ok).toBe(false)
  })

  it('generate_image saves the decoded image with a sniffed extension and a free name', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
    const env = makeEnv({ v1: vi.fn(async () => Response.json({ data: [{ b64_json: b64(png) }], model: 'flux' })) })
    const a = await call(env, 'generate_image', { prompt: 'A red Fox!' })
    expect(a.files).toEqual(['images/a-red-fox.png'])
    expect(Array.from(env.ws.get('images/a-red-fox.png')!.data)).toEqual(Array.from(png))
    const b = await call(env, 'generate_image', { prompt: 'A red Fox!' })
    expect(b.files).toEqual(['images/a-red-fox-2.png'])
  })

  it('generate_video and text_to_speech store the binary bodies', async () => {
    const env = makeEnv({
      v1: vi.fn(async (path: string) => path.includes('video')
        ? new Response(new Uint8Array([0, 0, 0, 24]), { headers: { 'content-type': 'video/mp4', 'x-model': 'wan' } })
        : new Response(new Uint8Array([73, 68, 51]), { headers: { 'content-type': 'audio/mpeg' } })),
    })
    const v = await call(env, 'generate_video', { prompt: 'waves', duration: 500, aspect_ratio: '9:16' })
    expect(v.files).toEqual(['videos/waves.mp4'])
    expect(v.content).toContain('wan')
    expect((env.v1 as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual({ prompt: 'waves', duration: 120, aspect_ratio: '9:16' })
    const s = await call(env, 'text_to_speech', { text: 'Hello there', path: 'audio/hi' })
    expect(s.files).toEqual(['audio/hi.mp3'])
  })

  it('search_knowledge searches attached documents', async () => {
    const doc = await indexDocument('faq.md', 'Refunds are processed within 14 days.', null)
    const env = makeEnv({ knowledge: () => [doc] })
    const out = await call(env, 'search_knowledge', { query: 'refunds' })
    expect(out.content).toContain('faq.md')
    expect(out.content).toContain('14 days')
    expect((await call(makeEnv(), 'search_knowledge', { query: 'x' })).ok).toBe(false)
  })
})

describe('GitHub tools', () => {
  it('github_request relays and reports status', async () => {
    const github = vi.fn(async (): Promise<GithubReply> => ({ status: 200, data: [{ full_name: 'me/repo' }] }))
    const env = makeEnv({ github })
    const out = await call(env, 'github_request', { method: 'get', path: '/user/repos' })
    expect(github).toHaveBeenCalledWith('GET', '/user/repos', undefined)
    expect(out.content).toContain('me/repo')
    expect((await call(makeEnv({ capabilities: NONE }), 'github_request', { method: 'GET', path: '/user' })).ok).toBe(false)
  })

  it('github_download_repo extracts the zipball without its top folder', async () => {
    const zip = await createZip([
      { path: 'me-repo-abc123/README.md', data: new TextEncoder().encode('# repo') },
      { path: 'me-repo-abc123/src/a.ts', data: new TextEncoder().encode('a') },
    ])
    const github = vi.fn(async (): Promise<GithubReply> => ({ status: 200, contentType: 'application/zip', base64: b64(zip) }))
    const env = makeEnv({ github })
    const out = await call(env, 'github_download_repo', { owner: 'me', repo: 'repo', ref: 'feature/x' })
    expect(github).toHaveBeenCalledWith('GET', '/repos/me/repo/zipball/feature/x')
    expect(out.ok).toBe(true)
    expect(env.ws.list().map(f => f.path)).toEqual(['repo/README.md', 'repo/src/a.ts'])
    expect((await call(env, 'github_download_repo', { owner: '../x', repo: 'r' })).ok).toBe(false)
  })

  it('github_push_files makes one commit through the git data API', async () => {
    const calls: [string, string, unknown][] = []
    const github = vi.fn(async (method: string, path: string, body?: unknown): Promise<GithubReply> => {
      calls.push([method, path, body])
      if (path.endsWith('/git/ref/heads/main')) return { status: 200, data: { object: { sha: 'parent' } } }
      if (path.endsWith('/git/commits/parent')) return { status: 200, data: { tree: { sha: 'basetree' } } }
      if (path.endsWith('/git/blobs')) return { status: 201, data: { sha: `blob${calls.length}` } }
      if (path.endsWith('/git/trees')) return { status: 201, data: { sha: 'newtree' } }
      if (path.endsWith('/git/commits')) return { status: 201, data: { sha: 'abcdef1234' } }
      if (path.endsWith('/git/refs/heads/main')) return { status: 200, data: {} }
      return { status: 404 }
    })
    const env = makeEnv({ github })
    await env.ws.write('proj/index.html', '<p>')
    await env.ws.write('proj/js/app.js', '1')
    const out = await call(env, 'github_push_files', { owner: 'me', repo: 'site', branch: 'main', message: 'Add site', folder: 'proj', target_folder: 'docs' })
    expect(out.ok).toBe(true)
    expect(out.content).toContain('abcdef1')
    const tree = calls.find(c => c[1].endsWith('/git/trees'))![2] as { base_tree: string; tree: { path: string }[] }
    expect(tree.base_tree).toBe('basetree')
    expect(tree.tree.map(t => t.path).sort()).toEqual(['docs/index.html', 'docs/js/app.js'])
    expect(calls.at(-1)).toEqual(['PATCH', '/repos/me/site/git/refs/heads/main', { sha: 'abcdef1234' }])
  })

  it('github_push_files explains a missing branch', async () => {
    const env = makeEnv({ github: vi.fn(async () => ({ status: 404, data: { message: 'Not Found' } })) })
    await env.ws.write('a.txt', 'a')
    const out = await call(env, 'github_push_files', { owner: 'me', repo: 'r', branch: 'nope', message: 'm' })
    expect(out.content).toBe('Error: branch "nope" not found: GitHub answered 404 (Not Found)')
  })
})
