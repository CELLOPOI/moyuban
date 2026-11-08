import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { legacySite, restoreBoard } from '../shared/boards.js'
import { ReaderError } from '../shared/errors.js'
import { writeAtomic } from './files.js'

const mime = { '.avif': 'image/avif', '.bmp': 'image/bmp', '.gif': 'image/gif', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
const mediaName = /^[a-f0-9]{64}\.(avif|bmp|gif|jpe?g|png|webp)$/
const MiB = 1024 * 1024

// 校验后重建版面引用，让 0.7 缓存里没有 site 的行也能从右栏直接打开。
function directoryRows(site, categories) {
  if (!Array.isArray(categories)) throw new Error('Invalid directory')
  return categories.map(({ key, name, groups }) => {
    if (typeof key !== 'string' || typeof name !== 'string') throw new Error('Invalid category')
    return { key, name, groups: groups.map(group => {
      if (typeof group.name !== 'string') throw new Error('Invalid group')
      return { name: group.name, boards: group.boards.map(row => {
        const ref = restoreBoard(row)
        if (ref?.site !== site || ref.sessionId !== row.sessionId) throw new Error('Invalid directory board')
        return ref
      }) }
    }) }
  })
}

export async function directoryCache(site, dir, minutes, fetchData) {
  const fetchRows = async () => {
    const rows = await fetchData()
    try { return directoryRows(site, rows) }
    catch { throw new ReaderError('INVALID_DIRECTORY', '站点返回的版面目录无效。', 502) }
  }
  if (!dir || !minutes) return fetchRows()
  const path = join(dir, site === legacySite ? 'public-directory.json' : 'public-directory-' + site + '.json')
  let saved
  try {
    const item = JSON.parse(await readFile(path, 'utf8'))
    if (Number.isFinite(item.time) && item.time <= Date.now() && item.categories?.length) {
      saved = { time: item.time, categories: directoryRows(site, item.categories) }
    }
  } catch { /* 可重建的缓存损坏时重新读取。 */ }
  if (saved && Date.now() - saved.time < minutes * 60_000) return saved.categories
  let categories
  try { categories = await fetchRows() } catch (error) { if (saved) return saved.categories; throw error }
  try {
    await mkdir(dir, { recursive: true })
    await writeAtomic(path, JSON.stringify({ time: Date.now(), categories }))
  } catch { /* 只读或离线磁盘不妨碍查看已获取的公开目录。 */ }
  return categories
}

export function cachedDirectory(site, fetchData, getSettings) {
  let last
  const pending = new Map()
  return {
    find: sessionId => last?.boards.get(sessionId),
    async read(config) {
      const { cachePath, values } = config ?? await getSettings()
      const minutes = values.directoryCacheMinutes
      const key = JSON.stringify([cachePath, minutes])
      if (last?.key === key && Date.now() < last.until) return last.categories
      if (!pending.has(key)) {
        const job = directoryCache(site, cachePath, minutes, fetchData).then(categories => {
          const boards = new Map()
          for (const category of categories) for (const group of category.groups) {
            for (const ref of group.boards) boards.set(ref.sessionId, ref)
          }
          last = { categories, boards, key, until: Date.now() + minutes * 60_000 }
          return categories
        }).finally(() => pending.delete(key))
        pending.set(key, job)
      }
      return pending.get(key)
    },
  }
}

async function trim(dir, limit) {
  const files = await readdir(dir)
  const entries = await Promise.all(files.filter(name => mediaName.test(name)).map(async name => {
    const path = join(dir, name)
    const info = await stat(path).catch(() => null)
    return info && { path, size: info.size, time: info.mtimeMs }
  }))
  const images = entries.filter(Boolean).sort((a, b) => a.time - b.time)
  let bytes = images.reduce((sum, image) => sum + image.size, 0)
  for (const image of images) {
    if (bytes <= limit) break
    await rm(image.path, { force: true })
    bytes -= image.size
  }
}

export function mediaCache(fetchImage = fetch) {
  const pending = new Map()
  let writes = Promise.resolve(), lastPolicy
  async function load(url, dir, file, type, limit) {
    const path = join(dir, file)
    try { return await readFile(path) } catch { /* 缓存未命中。 */ }
    const upstream = await fetchImage(url, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15_000) })
    const max = Math.min(limit, 16 * MiB)
    const actual = upstream.headers.get('content-type')?.split(';')[0].toLowerCase()
    if (!upstream.ok || (actual && actual !== type && actual !== 'application/octet-stream') || Number(upstream.headers.get('content-length')) > max) {
      await upstream.body?.cancel()
      throw new Error('Image unavailable')
    }
    const chunks = []
    let size = 0
    for await (const chunk of upstream.body ?? []) {
      size += chunk.length
      if (size > max) throw new Error('Image exceeds cache limit')
      chunks.push(chunk)
    }
    if (!size) throw new Error('Empty image')
    const bytes = Buffer.concat(chunks)
    // 只清理该缓存格式的文件。写入失败仍可将已经下载的图片交给阅读端。
    writes = writes.then(async () => {
      await mkdir(dir, { recursive: true })
      await writeAtomic(path, bytes)
      await trim(dir, limit)
    }).catch(() => {})
    await writes
    return bytes
  }
  return async (site, input, { values, cachePath }) => {
    const url = site.imageUrl?.(input)
    if (!url) return new Response(null, { status: 400 })
    if (!values.mediaCacheMiB) return new Response(null, { status: 404 })
    const ext = extname(new URL(url).pathname).toLowerCase()
    if (!Object.hasOwn(mime, ext)) return new Response(null, { status: 400 })
    const cacheKey = site.id === legacySite ? url : site.id + '\0' + url
    const name = createHash('sha256').update(cacheKey).digest('hex') + ext
    const dir = join(cachePath, 'media'), key = join(dir, name)
    const limit = values.mediaCacheMiB * MiB
    const policy = JSON.stringify([dir, limit])
    if (policy !== lastPolicy) {
      lastPolicy = policy
      writes = writes.then(() => trim(dir, limit)).catch(() => {})
    }
    await writes
    let job = pending.get(key)
    if (!job) {
      job = load(url, dir, name, mime[ext], limit).finally(() => pending.delete(key))
      pending.set(key, job)
    }
    try {
      return new Response(await job, { headers: { 'Content-Type': mime[ext], 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } })
    } catch { return new Response(null, { status: 502 }) }
  }
}
