import { board as legacyBoard, boardForSession as ngaSession, forum } from '../sites/nga/boards.js'

export { legacyBoard }
export const legacySite = legacyBoard.site
export const workspaceName = '资料整理'
export const validSlug = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,23}$/.test(value)
export function entryForSite(site = legacySite) {
  if (!validSlug(site)) return null
  return { site, sessionId: 'dsh-nga-reader-start' + (site === legacySite ? '' : '-' + site), name: site === 'xhs' ? '阅读索引' : '选择版面' }
}
export const entry = entryForSite()

// 新站点的外部编号可以包含中文或区分大小写。小写十六进制在 Windows 文件名里同样可逆。
export function encodeId(value) {
  return Array.from(new TextEncoder().encode(value), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function boardRef(site, kind, id, name) {
  if (site === legacySite) return forum(kind, id, name)
  if (!validSlug(site) || !validSlug(kind) || (typeof id !== 'string' && !Number.isSafeInteger(id))) return null
  id = String(id)
  if (!id || !id.isWellFormed() || /[\u0000-\u001f]/.test(id)) return null
  const encoded = encodeId(id)
  if (encoded.length > 128) return null
  return { site, kind, id, name: (typeof name === 'string' && name.trim().slice(0, 120)) || id,
    sessionId: 'dsh-nga-reader-site-' + site + '_' + kind + '_' + encoded }
}

export function boardForSession(id) {
  if (id === entry.sessionId) return entry
  if (typeof id !== 'string') return null
  if (id.startsWith(entry.sessionId + '-')) {
    const ref = entryForSite(id.slice(entry.sessionId.length + 1))
    return ref?.sessionId === id ? ref : null
  }
  const match = /^dsh-nga-reader-site-([a-z][a-z0-9-]{0,23})_([a-z][a-z0-9-]{0,23})_((?:[a-f0-9]{2}){1,64})$/.exec(id)
  if (!match) return ngaSession(id)
  const bytes = Uint8Array.from(match[3].match(/../g), byte => parseInt(byte, 16))
  const ref = boardRef(match[1], match[2], new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes))
  return ref?.sessionId === id ? ref : null
}

export function restoreBoard(row) {
  if (!row) return null
  return boardRef(row.site === undefined ? legacySite : row.site, row.kind, row.id, row.name)
}

export function readingPrefix(sessionId) {
  return 'dsh-nga-reader.v1.' + (sessionId === legacyBoard.sessionId ? '' : sessionId + '.')
}
