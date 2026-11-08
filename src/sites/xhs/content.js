export const origin = 'https://www.xiaohongshu.com'
export const noteId = value => typeof value === 'string' && /^[0-9a-f]{24}$/.test(value)
export const official = host => host === 'xiaohongshu.com' || host.endsWith('.xiaohongshu.com')
const text = (value, max = 180) => typeof value === 'string' ? value.trim().slice(0, max) : ''

// 首屏和直达详情可能由服务端渲染。只解析状态数据，不执行网页脚本。
export function initialState(html) {
  const raw = /<script\b[^>]*>\s*window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script\s*>/i.exec(html)?.[1]
  if (!raw) return {}
  try { return JSON.parse(raw.trim().replace(/;$/, '').replace(/"(?:[^"\\]|\\.)*"|\bundefined\b/g, v => v === 'undefined' ? 'null' : v)) ?? {} }
  catch { return {} }
}

export function mediaUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) return null
  try {
    const u = new URL(value)
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port || !u.hostname.endsWith('.xhscdn.com')) return null
    u.protocol = 'https:'
    return u.href
  } catch { return null }
}

export function cardLink(value, id) {
  try {
    const u = new URL(value, origin)
    if (u.origin === origin && !u.username && !u.password && u.pathname === '/explore/' + id) return u.href
  } catch {}
  return null
}

// 同一张卡的占位链接可能没有签名；保留官网实际给过的完整访问上下文。
export function preferCardLink(current, next, id) {
  const a = cardLink(current, id), b = cardLink(next, id)
  if (!b || (a && new URL(a).searchParams.get('xsec_token') && !new URL(b).searchParams.get('xsec_token'))) return a
  return b
}

export function feedCard(row) {
  const card = row?.note_card ?? row?.noteCard ?? row
  const id = row?.id
  if (!noteId(id) || (row.model_type ?? row.modelType ?? 'note') !== 'note') return null
  const token = text(row.xsec_token ?? row.xsecToken, 2048)
  const link = preferCardLink(token ? origin + '/explore/' + id + '?' +
    new URLSearchParams({ xsec_token: token, xsec_source: text(row.xsec_source ?? row.xsecSource) || 'pc_feed' }) : null, row.href, id)
  if (!link) return null
  return { id, href: link, type: card.type === 'video' ? 'video' : 'normal',
    title: text(card.display_title ?? card.displayTitle ?? card.title) || '无标题摘录',
    author: text(card.user?.nickname ?? card.user?.nickName ?? card.author, 80) }
}

export function detailNote(note, expected, outerId) {
  if (!note || !noteId(expected) || (note.note_id ?? note.noteId ?? note.id ?? outerId) !== expected) return null
  const images = (note.image_list ?? note.imageList ?? []).slice(0, 100).map(i => ({
    width: Number(i.width) || 0, height: Number(i.height) || 0,
    url: [i.url_default, i.urlDefault, i.url, ...(i.info_list ?? i.infoList ?? []).map(v => v.url), i.url_pre, i.urlPre].map(mediaUrl).find(Boolean) ?? null,
  }))
  const streams = [note.video?.media, note.video?.media_v2, note.video?.mediaV2].map(m => m?.stream).filter(Boolean)
  // 官网也会用 EF4、EF5 等编号分组。根据流本身的编码挑普通浏览器可播放的 MP4。
  const candidates = streams.flatMap(s => Object.entries(s).flatMap(([group, rows]) => Array.isArray(rows) ?
    rows.filter(row => row && !/m3u8|dash|hls/i.test(row.format)).map(row => ({ row,
      rank: /h\.?264|avc/i.test([group, row.video_codec, row.videoCodec].join(' ')) ? 0 : 1 })) : []))
  const video = candidates.sort((a, b) => a.rank - b.rank).map(c => c.row)
    .flatMap(s => [s.master_url, s.masterUrl, s.url, ...(s.backup_urls ?? s.backupUrls ?? [])]).map(mediaUrl).find(Boolean)
  return { id: expected, type: note.type === 'video' ? 'video' : 'normal', title: text(note.title),
    body: text(note.desc, 32000), author: text(note.user?.nickname ?? note.user?.nickName, 80),
    images, video, commentCount: String(note.interact_info?.comment_count ?? note.interactInfo?.commentCount ?? '') }
}

export function commentPage(data) {
  const rows = data?.comments ?? data?.list
  if (!Array.isArray(rows)) return null
  return { items: rows.slice(0, 100).map(c => ({ id: text(c.id), author: text(c.user_info?.nickname ?? c.userInfo?.nickname ?? c.userInfo?.nickName, 80),
    text: text(c.content, 4000) })).filter(c => c.id && c.text), more: Boolean(data.has_more ?? data.hasMore), cursor: text(data.cursor, 2048) }
}
