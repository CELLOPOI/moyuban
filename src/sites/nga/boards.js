export const board = {
  site: 'nga', kind: 'fid', id: '-447601',
  sessionId: 'dsh-nga-reader-acg',
  name: '二次元国家地理',
}

const forumHosts = new Set(['bbs.nga.cn', 'nga.178.com', 'ngabbs.com', 'www.ngabbs.com'])

export function forum(kind, id, name) {
  if (kind !== 'fid' && kind !== 'stid') return null
  if (typeof id !== 'number' && typeof id !== 'string') return null
  id = String(id)
  if (!/^-?[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || (kind === 'stid' && id.startsWith('-'))) return null
  const legacy = kind === board.kind && id === board.id
  return { site: 'nga', kind, id, sessionId: legacy ? board.sessionId : 'dsh-nga-reader-' + kind + '-' + id,
    name: (typeof name === 'string' && name.trim().slice(0, 120)) || (legacy ? board.name : (kind === 'fid' ? '版面 ' : '合集 ') + id) }
}

export function boardForSession(id) {
  if (typeof id !== 'string') return null
  if (id === board.sessionId) return board
  const match = /^dsh-nga-reader-(fid|stid)-(-?\d+)$/.exec(id)
  const item = match && forum(match[1], match[2])
  return item?.sessionId === id ? item : null
}

export function parseBoardInput(input) {
  if (typeof input !== 'string' || input.length > 2048) return null
  const value = input.trim()
  const simple = /^(?:(fid|stid)\s*[=:：]\s*)?(-?\d+)$/i.exec(value)
  if (simple) return forum(simple[1]?.toLowerCase() || 'fid', simple[2])
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value)
    if (!forumHosts.has(url.hostname) || url.pathname !== '/thread.php' || url.port || url.username || url.password) return null
    return forum('stid', url.searchParams.get('stid')) || forum('fid', url.searchParams.get('fid'))
  } catch { return null }
}
