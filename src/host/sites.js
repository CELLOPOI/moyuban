import { boardForSession, legacySite, restoreBoard, validSlug } from '../shared/boards.js'
import { ReaderError } from '../shared/errors.js'
import { defaults } from '../shared/settings.js'
import { ngaSite } from '../sites/nga/index.js'
import { tiebaSite } from '../sites/tieba/index.js'
import { xhsSite } from '../sites/xhs/feed.js'
import { cachedDirectory } from './cache.js'
import { siteWorkspacePath } from './workspace.js'

export const installedSites = () => [ngaSite(), tiebaSite(), xhsSite()]

export function unsupported() {
  return new ReaderError('UNSUPPORTED', '这个站点不支持此操作。', 405)
}

export function readBoardAccount(site) {
  // 贴吧账号用于关注卡。版面阅读与工作区投影都沿用匿名访问。
  return site.info.capabilities.followed ? null : site.account?.read()
}

export function boardIn(site, row) {
  const board = restoreBoard(row)
  if (board?.site !== site.id || (row.sessionId !== undefined && board.sessionId !== row.sessionId)) {
    throw new ReaderError('INVALID_INPUT', '版面与所选站点不匹配。')
  }
  return board
}

export function siteRegistry(credentials, adapters = installedSites(), getSettings = () => ({ values: defaults }), home) {
  const sites = new Map()
  for (const adapter of adapters) {
    const { id, name } = adapter
    if (!validSlug(id) || sites.has(id) || !name || (!adapter.createFeed && (typeof adapter.list !== 'function' || typeof adapter.thread !== 'function'))) {
      throw new Error('Invalid reader adapter: ' + id)
    }
    const record = 'dsh-nga-reader/' + id + '-account'
    const grant = {
      read: async () => (await credentials.readRecord(record))?.payload ?? null,
      save: getPayload => credentials.modifyRecord(record, current => ({ kind: 'grant', payload: getPayload(current?.payload ?? null) })),
      clear: () => credentials.deleteRecord(record),
    }
    const account = adapter.createAccount?.(grant)
    const feed = adapter.createFeed?.(grant)
    const directory = adapter.editableDirectory?.(siteWorkspacePath(adapter, home)) ??
      (adapter.directory && cachedDirectory(id, adapter.directory, getSettings))
    const info = { id, name, editor: adapter.editor, inputHint: adapter.inputHint, inputLabel: adapter.inputLabel,
      capabilities: { homeFeed: Boolean(feed), directory: Boolean(directory), editDirectory: Boolean(directory?.save), followed: Boolean(account && adapter.followedBoards),
        lookup: Boolean(adapter.parseBoard || adapter.searchBoards),
        login: Boolean(account), favorites: Boolean(account && adapter.favorites),
        reply: Boolean(adapter.reply), replies: Boolean(adapter.replies), quote: Boolean(adapter.reply && adapter.quoteTarget),
        replyRequiresLogin: Boolean(adapter.replyRequiresLogin), media: Boolean(adapter.imageUrl) } }
    sites.set(id, { ...adapter, info, account, directory, feed })
  }
  function get(id = legacySite) {
    const site = sites.get(id)
    if (!site) throw new ReaderError('UNKNOWN_SITE', '无法识别所选站点。', 400)
    return site
  }
  return {
    get, has: id => sites.has(id), all: [...sites.values()], descriptions: [...sites.values()].map(site => site.info),
    forRequest(body) {
      const site = get(body.site)
      if (body.mode === 'example') throw new ReaderError('UNSUPPORTED', '示例模式已停用，请重新打开版面。', 405)
      if (body.board !== undefined) {
        const ref = boardForSession(body.board)
        if (!ref || ref.site !== site.id) throw new ReaderError('INVALID_INPUT', '版面与所选站点不匹配。')
      }
      return site
    },
  }
}
