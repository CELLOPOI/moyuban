export function linkUrl(value) {
  try {
    if (!/^https?:\/\//i.test(value) || /[\s<>\[\]]/.test(value)) return null
    const url = new URL(value)
    return url.username || url.password ? null : url.href
  } catch { return null }
}

export function imageUrl(value) {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw || /[\s<>\[\]\\]/u.test(raw)) return null
  try {
    let url
    if (/^(?:https?:)?\/\//i.test(raw)) {
      url = new URL(raw, 'https://bbs.nga.cn')
    } else if (/^img\d*\.(?:nga\.cn|nga\.178\.com|ngacn\.cc)\//i.test(raw)) {
      url = new URL('https://' + raw)
    } else if (/^\/?ngabbs\/post\/smile\//i.test(raw)) {
      url = new URL(raw, 'https://img4.nga.cn')
    } else {
      const path = raw.replace(/^\.?\//, '').replace(/^attachments\//i, '')
      if (!/^mon(?:_\d+)?\//i.test(path)) return null
      url = new URL('/attachments/' + path, 'https://img.nga.cn')
      if (!url.pathname.startsWith('/attachments/')) return null
    }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port) return null
    if (!/(^|\.)(nga\.cn|nga\.178\.com|ngacn\.cc)$/.test(url.hostname)) return null
    if (!/\.(?:avif|bmp|gif|jpe?g|png|webp)$/i.test(url.pathname)) return null
    url.protocol = 'https:'
    // 同一附件会同时出现在正文和附件表；旧 CDN、缩略图和相对路径统一到原图。
    if (/^img\d*\.(?:nga\.cn|nga\.178\.com|ngacn\.cc)$/.test(url.hostname)) {
      if (url.pathname.startsWith('/attachments/')) {
        url.hostname = 'img.nga.cn'
        url.pathname = url.pathname.replace(/(\.(?:gif|jpe?g|png|webp))\.(?:thumb(?:_ss?)?|medium)\.\w+$/i, '$1')
      } else if (url.pathname.startsWith('/ngabbs/post/smile/')) url.hostname = 'img4.nga.cn'
    }
    url.hash = ''
    return url.href
  } catch { return null }
}
