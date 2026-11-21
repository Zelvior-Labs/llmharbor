import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ArchiveError, archiveExtension, crc32, createArchive, createTar, createZip, detectArchiveFormat,
  extractArchive, readTar, readZip, safeArchivePath,
} from './archive'

const enc = new TextEncoder()
const dec = new TextDecoder()

function hasTool(cmd: string): boolean {
  try { execFileSync(cmd, ['--help'], { stdio: 'ignore' }); return true } catch { return false }
}

const SAMPLE = [
  { path: 'README.md', data: enc.encode('# Hello\n') },
  { path: 'src/index.ts', data: enc.encode('export const x = 1\n'.repeat(200)) },
  { path: 'assets/bin.dat', data: new Uint8Array([0, 1, 2, 255, 254, 0, 7]) },
  { path: 'unicode/héllo-世界.txt', data: enc.encode('ünïcödé') },
]

describe('safeArchivePath', () => {
  it('normalises separators and dot segments', () => {
    expect(safeArchivePath('a\\b\\c.txt')).toBe('a/b/c.txt')
    expect(safeArchivePath('/a/./b//c')).toBe('a/b/c')
  })
  it('rejects traversal, drive letters and empties', () => {
    expect(safeArchivePath('../etc/passwd')).toBeNull()
    expect(safeArchivePath('a/../../b')).toBeNull()
    expect(safeArchivePath('C:/Windows/x')).toBeNull()
    expect(safeArchivePath('')).toBeNull()
    expect(safeArchivePath('./')).toBeNull()
  })
})

describe('crc32', () => {
  it('matches the reference value', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

describe('zip', () => {
  it('round-trips text, binary and unicode names', async () => {
    const zip = await createZip(SAMPLE)
    expect(detectArchiveFormat(zip)).toBe('zip')
    const back = await readZip(zip)
    expect(back.map(e => e.path)).toEqual(SAMPLE.map(e => e.path))
    back.forEach((e, i) => expect(Array.from(e.data)).toEqual(Array.from(SAMPLE[i].data)))
  })

  it('deflates compressible data', async () => {
    const zip = await createZip([{ path: 'big.txt', data: enc.encode('a'.repeat(100_000)) }])
    expect(zip.length).toBeLessThan(10_000)
    const [entry] = await readZip(zip)
    expect(entry.data.length).toBe(100_000)
  })

  it('drops duplicate and unsafe paths when writing', async () => {
    const zip = await createZip([
      { path: 'a.txt', data: enc.encode('1') },
      { path: './a.txt', data: enc.encode('2') },
      { path: '../evil.txt', data: enc.encode('x') },
    ])
    const back = await readZip(zip)
    expect(back.map(e => e.path)).toEqual(['a.txt'])
    expect(dec.decode(back[0].data)).toBe('1')
  })

  it('skips zip-slip entries when reading a hostile archive', async () => {
    const zip = await createZip([{ path: 'zz/evil.txt', data: enc.encode('x') }, { path: 'ok.txt', data: enc.encode('ok') }])
    // Rewrite "zz" to ".." in both the local and the central header.
    for (let i = 0; i < zip.length - 1; i++) if (zip[i] === 0x7a && zip[i + 1] === 0x7a) { zip[i] = 0x2e; zip[i + 1] = 0x2e }
    const back = await readZip(zip)
    expect(back.map(e => e.path)).toEqual(['ok.txt'])
  })

  it('throws ArchiveError on garbage', async () => {
    await expect(readZip(new Uint8Array(100))).rejects.toBeInstanceOf(ArchiveError)
  })

  it.skipIf(!hasTool('unzip'))('is readable by the system unzip', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zip-'))
    try {
      writeFileSync(join(dir, 'out.zip'), await createZip(SAMPLE))
      execFileSync('unzip', ['-q', 'out.zip', '-d', 'x'], { cwd: dir })
      expect(readFileSync(join(dir, 'x/src/index.ts'), 'utf8')).toBe('export const x = 1\n'.repeat(200))
      expect(Array.from(readFileSync(join(dir, 'x/assets/bin.dat')))).toEqual([0, 1, 2, 255, 254, 0, 7])
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it.skipIf(!hasTool('zip'))('reads a zip made by the system zip, skipping directories', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zip-'))
    try {
      mkdirSync(join(dir, 'p/q'), { recursive: true })
      writeFileSync(join(dir, 'p/q/r.txt'), 'deep '.repeat(500))
      writeFileSync(join(dir, 'p/top.txt'), 'top')
      execFileSync('zip', ['-qr', 'in.zip', 'p'], { cwd: dir })
      const back = await readZip(new Uint8Array(readFileSync(join(dir, 'in.zip'))))
      expect(back.map(e => e.path).sort()).toEqual(['p/q/r.txt', 'p/top.txt'])
      expect(dec.decode(back.find(e => e.path === 'p/q/r.txt')!.data)).toBe('deep '.repeat(500))
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('tar', () => {
  it('round-trips, including a path longer than ustar allows', () => {
    const long = `${'very-long-directory-name/'.repeat(12)}file-${'x'.repeat(120)}.txt`
    const entries = [...SAMPLE, { path: long, data: enc.encode('deep') }]
    const tar = createTar(entries)
    expect(tar.length % 512).toBe(0)
    expect(detectArchiveFormat(tar)).toBe('tar')
    const back = readTar(tar)
    expect(back.map(e => e.path)).toEqual(entries.map(e => e.path))
    expect(dec.decode(back[back.length - 1].data)).toBe('deep')
  })

  it('tar.gz round-trips through gzip', async () => {
    const gz = await createArchive('tar.gz', SAMPLE)
    expect(detectArchiveFormat(gz)).toBe('tar.gz')
    const back = await extractArchive(gz)
    expect(back.map(e => e.path)).toEqual(SAMPLE.map(e => e.path))
  })

  it.skipIf(!hasTool('tar'))('interoperates with the system tar both ways', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tar-'))
    try {
      const long = `${'nested-folder/'.repeat(10)}${'n'.repeat(90)}.txt`
      writeFileSync(join(dir, 'ours.tar.gz'), await createArchive('tar.gz', [...SAMPLE, { path: long, data: enc.encode('L') }]))
      mkdirSync(join(dir, 'x'))
      execFileSync('tar', ['-xzf', '../ours.tar.gz'], { cwd: join(dir, 'x') })
      expect(readFileSync(join(dir, 'x/README.md'), 'utf8')).toBe('# Hello\n')
      expect(readFileSync(join(dir, 'x', long), 'utf8')).toBe('L')

      execFileSync('tar', ['-czf', 'theirs.tar.gz', '-C', 'x', '.'], { cwd: dir })
      const back = await extractArchive(new Uint8Array(readFileSync(join(dir, 'theirs.tar.gz'))))
      expect(back.map(e => e.path).sort()).toEqual([...SAMPLE.map(e => e.path), long].sort())
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('front doors', () => {
  it('extractArchive refuses unknown data', async () => {
    await expect(extractArchive(enc.encode('just text'), 'x.bin')).rejects.toBeInstanceOf(ArchiveError)
  })
  it('names extensions', () => {
    expect(archiveExtension('zip')).toBe('.zip')
    expect(archiveExtension('tar')).toBe('.tar')
    expect(archiveExtension('tar.gz')).toBe('.tar.gz')
  })
})
