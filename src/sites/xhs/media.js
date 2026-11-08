import { mediaUrl } from './content.js'

const MiB = 1024 * 1024
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
export async function readAttachment(value, kind, request, download = fetch) {
  const url = mediaUrl(value)
  if (!url) return new Response(null, { status: 400, headers })
  const raw = request.headers.get('range')
  let range, start, end
  if (raw) {
    const match = /^bytes=(\d{1,15})-(\d{0,15})$/.exec(raw)
    if (!match) return new Response(null, { status: 416, headers })
    start = Number(match[1])
    end = Math.min(match[2] ? Number(match[2]) : Infinity, start + 2 * MiB - 1)
    if (end < start) return new Response(null, { status: 416, headers })
    range = 'bytes=' + start + '-' + end
  }
  try {
    const upstream = await download(url, { redirect: 'error', credentials: 'omit', headers: range ? { Range: range } : {},
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(45000)]) })
    const reject = async (status, extra = {}) => {
      await upstream.body?.cancel()
      return new Response(null, { status, headers: { ...headers, ...extra } })
    }
    if (upstream.status === 416) {
      const value = upstream.headers.get('content-range')
      return reject(416, /^bytes \*\/\d+$/.test(value) ? { 'Content-Range': value } : {})
    }
    const mime = upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
    const allowed = kind === 'video' ? mime === 'video/mp4' : /^image\/(jpeg|png|webp|avif|gif)$/.test(mime)
    if (!allowed || upstream.status !== (range ? 206 : 200) || !upstream.body) return reject(502)
    const send = { ...headers, 'Content-Type': mime, 'Accept-Ranges': 'bytes' }
    let limit = kind === 'video' ? 256 * MiB : 16 * MiB
    if (range) {
      const contentRange = upstream.headers.get('content-range'), parts = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange)
      if (!parts || Number(parts[1]) !== start || Number(parts[2]) > end || Number(parts[2]) < start || Number(parts[3]) <= Number(parts[2])) return reject(502)
      send['Content-Range'] = contentRange
      limit = Number(parts[2]) - start + 1
    }
    const size = upstream.headers.get('content-length')
    if (size !== null) {
      if (!/^\d+$/.test(size) || Number(size) > limit || (range && Number(size) !== limit)) return reject(502)
      send['Content-Length'] = size
    }
    let bytes = 0
    const bounded = new TransformStream({ transform(chunk, controller) {
      bytes += chunk.byteLength
      if (bytes > limit) throw new Error('Media exceeds size limit')
      controller.enqueue(chunk)
    } })
    return new Response(upstream.body.pipeThrough(bounded), { status: upstream.status, headers: send })
  } catch { return new Response(null, { status: 502, headers }) }
}
