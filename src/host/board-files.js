import { boardForSession, encodeId, legacySite } from '../shared/boards.js'

// 文件名也是设置迁移时识别版面数据的依据。NGA 沿用站点拆分前的文件名。
export const manualBoardFile = board => board.sessionId + '.json'
export const lastPickFile = site => site === legacySite ? 'last-pick.json' : 'last-pick-' + site + '.json'

export function favoritesFile(site, uid) {
  const suffix = site === legacySite ? uid : site + '_' + encodeId(uid)
  return 'favorites-' + suffix + '.json'
}

export function manualBoardForFile(file) {
  if (!file.endsWith('.json')) return null
  const board = boardForSession(file.slice(0, -5))
  return board?.kind ? board : null
}

export function isBoardDataFile(file) {
  return /^favorites-(?:\d+|[a-z][a-z0-9-]{0,23}_(?:[a-f0-9]{2})+)\.json$/.test(file) ||
    /^last-pick(?:-[a-z][a-z0-9-]{0,23})?\.json$/.test(file) || Boolean(manualBoardForFile(file))
}
