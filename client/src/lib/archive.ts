// Archive building and extraction for the Playground agent's workspace:
// zip, tar and tar.gz, written and read entirely in the browser.
//
// No dependency on purpose. The same client bundle ships in the desktop app,
// the Windows 7 edition, the Android app and Docker, so everything here sticks
// to web-platform APIs: Uint8Array, DataView, TextEncoder and — when the
// runtime has it — CompressionStream / DecompressionStream for deflate and
// gzip. A runtime without `deflate-raw` still gets a valid zip, just stored
// (uncompressed) instead of deflated.
//
// Paths are normalised on the way in AND on the way out: a leading slash is
// dropped and any `..` segment rejects the entry, so a crafted archive can
// never write outside the folder it is extracted into (zip-slip).
//
// Pure apart from the optional streams, so it runs under vitest in node.

export type ArchiveFormat = 'zip' | 'tar' | 'tar.gz'

export interface ArchiveEntry {
  path: string
  data: Uint8Array
  /** Modification time; defaults to now. */
  mtime?: Date
}

export class ArchiveError extends Error {}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// ---- Paths -------------------------------------------------------------------

/** Normalise an archive member path. Returns null for anything unsafe or empty. */
export function safeArchivePath(raw: string): string | null {
  const parts = raw.replace(/\\/g, '/').split('/').filter(p => p !== '' && p !== '.')
  if (parts.length === 0) return null
  if (parts.some(p => p === '..')) return null
  // Windows drive letters ("C:") have no business inside an archive path.
  if (/^[a-zA-Z]:$/.test(parts[0])) return null
  return parts.join('/')
}

// ---- CRC-32 (zip) ------------------------------------------------------------

let crcTable: Uint32Array | null = null
function table(): Uint32Array {
  if (crcTable) return crcTable
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  crcTable = t
  return t
}

export function crc32(data: Uint8Array): number {
  const t = table()
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ---- Streams -----------------------------------------------------------------

type StreamFormat = 'gzip' | 'deflate-raw'

function canCompress(format: StreamFormat): boolean {
  if (typeof CompressionStream === 'undefined') return false
  try { new CompressionStream(format); return true } catch { return false }
}

function canDecompress(format: StreamFormat): boolean {
  if (typeof DecompressionStream === 'undefined') return false
  try { new DecompressionStream(format); return true } catch { return false }
}

async function pipeThrough(data: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const writer = stream.writable.getWriter()
  // Write and read concurrently: awaiting the write first can deadlock once
  // the transform's internal queue is full.
  const write = (async () => {
    await writer.write(data)
    await writer.close()
  })()
  const chunks: Uint8Array[] = []
  const reader = stream.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  await write
  return concat(chunks)
}

function compress(data: Uint8Array, format: StreamFormat): Promise<Uint8Array> {
  return pipeThrough(data, new CompressionStream(format) as unknown as TransformStream<Uint8Array, Uint8Array>)
}

function decompress(data: Uint8Array, format: StreamFormat): Promise<Uint8Array> {
  return pipeThrough(data, new DecompressionStream(format) as unknown as TransformStream<Uint8Array, Uint8Array>)
}

export function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0
  for (const c of chunks) total += c.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { out.set(c, offset); offset += c.length }
  return out
}

// ---- Zip ---------------------------------------------------------------------

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear())
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

/** Build a zip. Deflates where the runtime can and it actually saves space. */
export async function createZip(entries: ArchiveEntry[]): Promise<Uint8Array> {
  const deflate = canCompress('deflate-raw')
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const seen = new Set<string>()

  for (const entry of entries) {
    const path = safeArchivePath(entry.path)
    if (!path || seen.has(path)) continue
    seen.add(path)
    const name = encoder.encode(path)
    const crc = crc32(entry.data)
    let method = 0
    let body = entry.data
    if (deflate && entry.data.length > 64) {
      const packed = await compress(entry.data, 'deflate-raw')
      if (packed.length < entry.data.length) { method = 8; body = packed }
    }
    const { time, date } = dosDateTime(entry.mtime ?? new Date())

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true) // UTF-8 names
    lv.setUint16(8, method, true)
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, body.length, true)
    lv.setUint32(22, entry.data.length, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, 30)
    parts.push(local, body)

    const cen = new Uint8Array(46 + name.length)
    const cv = new DataView(cen.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, method, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, body.length, true)
    cv.setUint32(24, entry.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    cen.set(name, 46)
    central.push(cen)

    offset += local.length + body.length
  }

  const centralBytes = concat(central)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, central.length, true)
  ev.setUint16(10, central.length, true)
  ev.setUint32(12, centralBytes.length, true)
  ev.setUint32(16, offset, true)
  return concat([...parts, centralBytes, end])
}

/** Read a zip's files (stored or deflated). Directories and unsafe paths are skipped. */
export async function readZip(data: Uint8Array): Promise<ArchiveEntry[]> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let eocd = -1
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new ArchiveError('not a zip file')
  const count = view.getUint16(eocd + 10, true)
  let ptr = view.getUint32(eocd + 16, true)
  const out: ArchiveEntry[] = []
  for (let n = 0; n < count; n++) {
    if (ptr + 46 > data.length || view.getUint32(ptr, true) !== 0x02014b50) throw new ArchiveError('corrupt zip directory')
    const flags = view.getUint16(ptr + 8, true)
    const method = view.getUint16(ptr + 10, true)
    const compSize = view.getUint32(ptr + 20, true)
    const nameLen = view.getUint16(ptr + 28, true)
    const extraLen = view.getUint16(ptr + 30, true)
    const commentLen = view.getUint16(ptr + 32, true)
    const localOffset = view.getUint32(ptr + 42, true)
    const rawName = decoder.decode(data.subarray(ptr + 46, ptr + 46 + nameLen))
    ptr += 46 + nameLen + extraLen + commentLen

    if (rawName.endsWith('/')) continue
    if (flags & 1) throw new ArchiveError(`encrypted zip entries are not supported (${rawName})`)
    if (compSize === 0xffffffff) throw new ArchiveError('zip64 archives are not supported')
    const path = safeArchivePath(rawName)
    if (!path) continue
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new ArchiveError('corrupt zip entry')
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
    const body = data.subarray(start, start + compSize)
    let content: Uint8Array
    if (method === 0) content = body.slice()
    else if (method === 8) {
      if (!canDecompress('deflate-raw')) throw new ArchiveError('this runtime cannot inflate zip entries')
      content = await decompress(body, 'deflate-raw')
    } else throw new ArchiveError(`unsupported zip compression method ${method}`)
    out.push({ path, data: content })
  }
  return out
}

// ---- Tar ---------------------------------------------------------------------

function writeOctal(buf: Uint8Array, offset: number, length: number, value: number) {
  const text = value.toString(8).padStart(length - 1, '0')
  buf.set(encoder.encode(text), offset)
  buf[offset + length - 1] = 0
}

function splitUstarName(path: string): { name: string; prefix: string } | null {
  const bytes = encoder.encode(path)
  if (bytes.length <= 100) return { name: path, prefix: '' }
  // Split on a slash so the name fits in 100 bytes and the prefix in 155.
  for (let i = path.length - 1; i > 0; i--) {
    if (path[i] !== '/') continue
    const prefix = path.slice(0, i)
    const name = path.slice(i + 1)
    if (encoder.encode(name).length <= 100 && encoder.encode(prefix).length <= 155) return { name, prefix }
  }
  return null
}

function tarHeader(name: string, prefix: string, size: number, mtime: Date, type: string): Uint8Array {
  const h = new Uint8Array(512)
  h.set(encoder.encode(name).subarray(0, 100), 0)
  writeOctal(h, 100, 8, 0o644)
  writeOctal(h, 108, 8, 0)
  writeOctal(h, 116, 8, 0)
  writeOctal(h, 124, 12, size)
  writeOctal(h, 136, 12, Math.floor(mtime.getTime() / 1000))
  h.fill(0x20, 148, 156) // checksum placeholder: spaces
  h[156] = type.charCodeAt(0)
  h.set(encoder.encode('ustar'), 257)
  h[262] = 0
  h.set(encoder.encode('00'), 263)
  h.set(encoder.encode(prefix).subarray(0, 155), 345)
  let sum = 0
  for (let i = 0; i < 512; i++) sum += h[i]
  writeOctal(h, 148, 7, sum)
  h[155] = 0x20
  return h
}

function padTo512(length: number): Uint8Array {
  const rest = length % 512
  return new Uint8Array(rest === 0 ? 0 : 512 - rest)
}

function paxRecord(key: string, value: string): Uint8Array {
  // "<len> key=value\n" where <len> counts itself.
  const body = ` ${key}=${value}\n`
  let len = encoder.encode(body).length + 1
  while (String(len).length + encoder.encode(body).length !== len) len = String(len).length + encoder.encode(body).length
  return encoder.encode(`${len}${body}`)
}

/** Build a POSIX (ustar, with pax headers for long paths) tar archive. */
export function createTar(entries: ArchiveEntry[]): Uint8Array {
  const parts: Uint8Array[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    const path = safeArchivePath(entry.path)
    if (!path || seen.has(path)) continue
    seen.add(path)
    const mtime = entry.mtime ?? new Date()
    let split = splitUstarName(path)
    if (!split) {
      const pax = paxRecord('path', path)
      parts.push(tarHeader('PaxHeader', '', pax.length, mtime, 'x'), pax, padTo512(pax.length))
      split = { name: path.slice(-100).replace(/^\/+/, ''), prefix: '' }
    }
    parts.push(tarHeader(split.name, split.prefix, entry.data.length, mtime, '0'), entry.data, padTo512(entry.data.length))
  }
  parts.push(new Uint8Array(1024))
  return concat(parts)
}

function readCString(buf: Uint8Array, offset: number, length: number): string {
  let end = offset
  while (end < offset + length && buf[end] !== 0) end++
  return decoder.decode(buf.subarray(offset, end))
}

/** Read a tar archive's regular files. */
export function readTar(data: Uint8Array): ArchiveEntry[] {
  const out: ArchiveEntry[] = []
  let ptr = 0
  let paxPath: string | null = null
  while (ptr + 512 <= data.length) {
    const h = data.subarray(ptr, ptr + 512)
    if (h.every(b => b === 0)) break
    const name = readCString(h, 0, 100)
    const size = parseInt(readCString(h, 124, 12).trim() || '0', 8)
    if (!Number.isFinite(size) || size < 0) throw new ArchiveError('corrupt tar header')
    const type = String.fromCharCode(h[156] || 0x30)
    const magic = readCString(h, 257, 6)
    const prefix = magic.startsWith('ustar') ? readCString(h, 345, 155) : ''
    const bodyStart = ptr + 512
    const body = data.subarray(bodyStart, bodyStart + size)
    ptr = bodyStart + size + ((512 - (size % 512)) % 512)

    if (type === 'x') {
      const text = decoder.decode(body)
      const match = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(text)
      paxPath = match ? match[1] : null
      continue
    }
    if (type === 'L') {
      // GNU long name: the next header's real path, NUL-terminated.
      paxPath = readCString(body, 0, body.length)
      continue
    }
    if (type === 'g' || type === 'K') continue
    const full = paxPath ?? (prefix ? `${prefix}/${name}` : name)
    paxPath = null
    if (type !== '0' && type !== '\0' && type !== '7') continue
    const path = safeArchivePath(full)
    if (!path) continue
    out.push({ path, data: body.slice() })
  }
  return out
}

// ---- Front doors -------------------------------------------------------------

export async function createArchive(format: ArchiveFormat, entries: ArchiveEntry[]): Promise<Uint8Array> {
  if (format === 'zip') return createZip(entries)
  const tar = createTar(entries)
  if (format === 'tar') return tar
  if (!canCompress('gzip')) throw new ArchiveError('this runtime cannot gzip; use zip or tar')
  return compress(tar, 'gzip')
}

/** Guess the format from the bytes (falls back to the file name for plain tar). */
export function detectArchiveFormat(data: Uint8Array, name = ''): ArchiveFormat | null {
  if (data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && (data[2] === 3 || data[2] === 5)) return 'zip'
  if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) return 'tar.gz'
  if (data.length >= 262 && readCString(data, 257, 5) === 'ustar') return 'tar'
  if (/\.tar$/i.test(name)) return 'tar'
  return null
}

export async function extractArchive(data: Uint8Array, name = ''): Promise<ArchiveEntry[]> {
  const format = detectArchiveFormat(data, name)
  if (format === 'zip') return readZip(data)
  if (format === 'tar') return readTar(data)
  if (format === 'tar.gz') {
    if (!canDecompress('gzip')) throw new ArchiveError('this runtime cannot gunzip')
    return readTar(await decompress(data, 'gzip'))
  }
  throw new ArchiveError('unrecognised archive (supported: zip, tar, tar.gz)')
}

/** The file extension each format is saved with. */
export function archiveExtension(format: ArchiveFormat): string {
  return format === 'tar.gz' ? '.tar.gz' : `.${format}`
}
