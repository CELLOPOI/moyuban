import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { boardForSession, entryForSite, restoreBoard } from '../shared/boards.js'
import { ReaderError } from '../shared/errors.js'
import { favoritesFile, lastPickFile, manualBoardFile, manualBoardForFile } from './board-files.js'
import { writeAtomic } from './files.js'
import { boardIn, readBoardAccount, unsupported } from './sites.js'

const savedBoard = ({ site, kind, id, name }) => ({ site, kind, id, name })
const save = (path, value) => writeAtomic(path, JSON.stringify(value))
async function read(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error }
}

function accountId(site, user) {
  return user ? site.account.id(user) : ''
}

function favoritesForSite() {
  const checked = new Map()
  return async (site, user, config, force) => {
    if (!user || !site.favorites) {
      checked.delete(site.id)
      return { boards: [], warning: '' }
    }
    const uid = accountId(site, user)
    const path = join(config.boardPath, favoritesFile(site.id, uid))
    const saved = await read(path, null)
    const boards = (saved ?? []).map(restoreBoard).filter(ref => ref?.site === site.id)
    const minutes = config.values.favoriteSyncMinutes
    const key = JSON.stringify([path, minutes])
    const last = checked.get(site.id)
    if (!force && last?.key === key && Date.now() < last.until) return { boards, warning: last.warning }
    try {
      const fresh = (await site.favorites(user)).map(row => boardIn(site, row))
      const rows = fresh.map(savedBoard)
      if (JSON.stringify(rows) !== JSON.stringify(saved)) await save(path, rows)
      checked.set(site.id, { key, until: Date.now() + minutes * 60_000, warning: '' })
      return { boards: fresh, warning: '' }
    } catch (error) {
      if (!(error instanceof ReaderError)) throw error
      const warning = '收藏版面同步失败：' + error.message + (boards.length ? ' 已保留上次的收藏。' : '')
      checked.set(site.id, { key, until: Date.now() + 15_000, warning })
      return { boards, warning }
    }
  }
}

export function boardLibrary(workspace, sites, archived, settings) {
  const favoritesFor = favoritesForSite()
  async function update(action, body, selected, config) {
    const { boardPath: dir, values } = config
    const user = await readBoardAccount(selected)
    const uid = accountId(selected, user)
    const { boards: saved, warning: favoriteWarning } = await favoritesFor(selected, user, config, action === 'syncBoards')
    let warning = favoriteWarning
    if (action === 'workspace' && selected.directory?.initialize) {
      try { await selected.directory.initialize() }
      catch (error) { warning = error instanceof ReaderError ? error.message : '选吧目录暂时无法初始化，请检查工作区目录的读写权限。' }
    }
    const favorites = new Map(saved.map(item => [item.sessionId, item]))
    // 每个手动入口单独保存。文件名和内容必须指向同一个站点、同一个会话。
    const manual = new Map()
    for (const file of await readdir(dir)) {
      const ref = manualBoardForFile(file)
      if (ref?.site !== selected.id) continue
      const item = restoreBoard(await read(join(dir, file), null))
      if (item?.sessionId === ref.sessionId) manual.set(item.sessionId, item)
    }
    const pickPath = join(dir, lastPickFile(selected.id))
    let picked = await read(pickPath, null)
    let opened, removed
    if (action === 'openBoard' || action === 'removeBoard') {
      if (body.generation !== undefined && (!selected.info.capabilities.followed || (await selected.account.read())?.generation !== body.generation)) {
        throw new ReaderError('ACCOUNT_CHANGED', '百度账号已变更，请重新打开关注列表。', 409)
      }
      // 旧客户端提交 input。新客户端从目录或搜索结果传回完整会话编号。
      const input = body.board === undefined ? await selected.parseBoard?.(body.input) : boardForSession(body.board)
      const ref = boardIn(selected, { ...input, name: body.name || input?.name })
      const path = join(dir, manualBoardFile(ref))
      if (action === 'openBoard') {
        opened = favorites.get(ref.sessionId) ?? manual.get(ref.sessionId)
        if (!opened) {
          if (body.fromDirectory) await selected.directory?.read(config)
          opened = selected.directory?.find(ref.sessionId) ?? (selected.resolveBoard
            ? boardIn(selected, await selected.resolveBoard(ref, user)) : ref)
          if (opened.sessionId !== ref.sessionId) throw new ReaderError('INVALID_INPUT', '站点返回的版面编号与所选入口不同。')
          await save(path, savedBoard(opened))
          manual.set(opened.sessionId, opened)
        }
        if (picked !== opened.sessionId) { picked = opened.sessionId; await save(pickPath, picked) }
      } else {
        if (favorites.has(ref.sessionId)) throw new ReaderError('FAVORITE_BOARD', '收藏版面固定显示，请在 ' + selected.name + ' 管理收藏。', 409)
        await rm(path, { force: true })
        manual.delete(ref.sessionId)
        removed = ref.sessionId
        if (picked === removed) { picked = null; await rm(pickPath, { force: true }) }
      }
    }
    // 慢请求返回时仍须使用本工作区当前登录的账号。
    if (accountId(selected, await readBoardAccount(selected)) !== uid) return update('workspace', {}, selected, config)
    const visible = new Map(favorites), hidden = new Set(archived())
    for (const [id, item] of manual) {
      if (!visible.has(id) && (!hidden.has(id) || opened?.sessionId === id)) visible.set(id, item)
    }
    if (!visible.size) {
      const entry = entryForSite(selected.id)
      visible.set(entry.sessionId, entry)
    }
    const promoted = values.promoteOnPick && visible.has(picked) ? picked : null
    const boards = [...visible.values()]
    const ordered = promoted ? [visible.get(promoted), ...boards.filter(item => item.sessionId !== promoted)] : boards
    const projection = await workspace(ordered, promoted ? [promoted] : [...favorites.keys()], selected)
    return { ...projection, site: selected.id, opened: opened?.sessionId, promoted, removed, favoriteCount: favorites.size,
      favorites: [...favorites.keys()], manual: [...manual.keys()].filter(id => visible.has(id) && !favorites.has(id)),
      settings: values, accountId: uid, connected: Boolean(user), warning }
  }
  return async (action, body = {}) => {
    const selected = sites.forRequest(body)
    if (selected.feed && action !== 'workspace') throw unsupported()
    if (action === 'syncBoards' && !selected.info.capabilities.favorites) throw unsupported()
    return settings.withBoards(config => update(action, body, selected, config))
  }
}
