import React from 'react'
import { boardForSession } from '../shared/boards.js'
import { clearStoredReading, createReader } from './reader.js'
import { call } from './host-api.js'
import { BoardTranscript } from './transcript.jsx'
import { BoardComposer } from './composer.jsx'
import { categoryAddress, categoryTab, CategoryPreview, directorySource } from './directory.jsx'
import { followedDirectory } from './followed.js'
import { BoardRemoveAction, BoardRemoveMenu } from './remove-board.jsx'
import { WithSettings } from './preferences.jsx'
import { preferences } from './settings-store.js'
import { ReaderSettings } from './settings.jsx'
import { workspaceNavigation } from './workspace-navigation.js'
import { excerptStore } from './excerpt-store.js'
import { excerptAddress, excerptTab, ExcerptIndex, ExcerptComposer, ExcerptPreview, OpenExcerptIndex } from './excerpts.jsx'
import css from './reader.css'

export const name = 'moyuban'
export const inject = ['slots', 'shortcuts', 'layout', 'sessions', 'uiWorkspace', 'workspaces', 'sidebarRight', 'sidebarRightTabs']

export function apply(ctx) {
  const prefs = preferences(call)
  const storage = {
    get length() { return window.localStorage.length },
    key: index => window.localStorage.key(index),
    getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: key => window.localStorage.removeItem(key),
  }
  const readers = new Map()
  function readerFor(id) {
    if (!readers.has(id)) {
      const ref = boardForSession(id)
      const { sites, values } = prefs.snapshot()
      const site = sites?.find(site => site.id === ref?.site)
      if (!site) return null
      readers.set(id, createReader(call, storage, ref, site, values))
    }
    return readers.get(id)
  }
  const listeners = new Set()
  const workspaces = new Map()
  const navigation = workspaceNavigation(ctx, workspaces, load)
  let catalog = { boards: [], manual: [], favorites: [], warnings: {} }, queue = Promise.resolve(), pending, lastSync = 0
  const removalKey = 'dsh-nga-reader.removed'
  function forgetReading(id, local) {
    const reader = readers.get(id)
    if (reader) reader.clearReading(local)
    else if (local) clearStoredReading(storage, id)
    readers.delete(id)
    navigation.forgetBoard(id)
    // 同一个阅读端可能打开多个标签页，它们也要丢弃内存里的旧草稿。
    if (local) try { storage.setItem(removalKey, id); storage.removeItem(removalKey) } catch {}
  }
  function refresh(action = 'workspace', fields, changedSite) {
    const origin = navigation.current()
    const task = queue.then(async () => {
      const result = await call(action, fields)
      if (result.removed) forgetReading(result.removed, true)
      let sessions = ctx.sessions.list.getSnapshot().byId
      if (result.boards.some(item => !sessions[item.sessionId])) {
        await ctx.sessions.refresh()
        sessions = ctx.sessions.list.getSnapshot().byId
      }
      // 原生侧栏按会话投影显示标题；冷启动时分批补齐，避免几十个收藏同时发请求。
      const missing = result.boards.filter(item => !sessions[item.sessionId]?.title)
      for (let i = 0; i < missing.length; i += 6) {
        await Promise.all(missing.slice(i, i + 6).map(item => ctx.sessions.refreshProjections(item.sessionId)))
      }
      const before = workspaces.get(result.site)
      const changed = changedSite || (before && before.accountId !== result.accountId)
      workspaces.set(result.site, result)
      const all = [...workspaces.values()]
      catalog = { boards: all.flatMap(i => i.boards), manual: all.flatMap(i => i.manual), favorites: all.flatMap(i => i.favorites),
        warnings: Object.fromEntries(all.map(i => [i.site, i.warning])), settings: result.settings }
      lastSync = Date.now()
      if (changed) for (const reader of readers.values()) if (reader.site.id === result.site) reader.invalidateAccount()
      for (const notify of listeners) notify()
      const active = navigation.current()
      const ref = navigation.readingSession(active)
      const visible = result.boards.some(item => item.sessionId === active)
      const removedActive = result.removed && result.removed === origin && !active && !ctx.layout.panelInfo.getSnapshot().activePanelId
      if (removedActive || (action !== 'openBoard' && active === origin && ref?.site === result.site && ref.kind && !visible)) {
        ctx.uiWorkspace.openSession(navigation.destination(result))
      } else if (changed && ref?.site === result.site) {
        await readers.get(ref.sessionId)?.authChanged()
      }
      return result
    })
    queue = task.catch(() => {})
    return task
  }
  function load() {
    pending ??= prefs.load().then(async () => {
      const { sites, warning } = prefs.snapshot()
      if (!sites) throw new Error(warning || '未能读取站点列表。')
      await Promise.all(sites.map(({ id }) => refresh('workspace', { site: id })))
    }).finally(() => { pending = undefined })
    return pending
  }
  async function pick(ref, signal, fromDirectory, generation) {
    const transition = ctx.layout.beginNavigation()
    const result = await refresh('openBoard', { site: ref.site, board: ref.sessionId, name: ref.name, fromDirectory, generation })
    if (result.opened && !transition.aborted && !signal?.aborted && result.settings.openOnPick) {
      ctx.uiWorkspace.openSession(result.opened)
    }
    return result
  }
  const directories = new Map()
  const followed = followedDirectory((action, fields, signal) => call(action, { ...fields, site: 'tieba' }, signal))
  const accountKey = 'dsh-nga-reader.tieba-account-changed'
  const excerptKey = 'dsh-nga-reader.excerpt-account-changed'
  const excerpts = excerptStore((action, fields) => call(action, { ...fields, site: 'xhs' }),
    () => { try { storage.setItem(excerptKey, String(Date.now())) } catch {} })
  const openExcerpt = () => ctx.sidebarRight.openResource(excerptAddress, { kind: excerptTab.kind, destination: 'sidebar' })
  async function refreshExcerpt() {
    const session = navigation.current()
    if (await excerpts.refresh() && navigation.current() === session) {
      const tab = ctx.sidebarRight.active()
      if (tab?.kind === excerptTab.kind && ctx.sidebarRight.isExpanded()) ctx.sidebarRight.hide(tab.id)
    }
  }
  function closeExcerpt() {
    const tab = ctx.sidebarRight.active()
    if (tab?.kind === excerptTab.kind && ctx.sidebarRight.isExpanded()) ctx.sidebarRight.hide(tab.id)
    excerpts.close()
  }
  const showIndex = id => ctx.uiWorkspace.openSession(id)
  const library = {
    followed,
    notifyAccount() { try { storage.setItem(accountKey, String(Date.now())) } catch {} },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    snapshot: () => catalog,
    sync: site => refresh('syncBoards', { site }),
    accountChanged: site => refresh(site.capabilities.favorites ? 'syncBoards' : 'workspace', { site: site.id }, site.id),
    preferences: prefs, workspace: ctx.uiWorkspace,
    syncSettings: load,
    directory(site) {
      if (!directories.has(site)) directories.set(site, directorySource(() => call('boardDirectory', { site }), () => prefs.snapshot(), site === 'tieba'))
      return directories.get(site)
    },
    async saveDirectory(categories, revision) {
      const source = library.directory('tieba')
      const active = ctx.sidebarRight.active()
      const before = source.snapshot().categories.find(c => categoryAddress('tieba', c) === active?.contentId)
      const result = await call('saveBoardDirectory', { site: 'tieba', categories, revision })
      source.accept(result)
      const after = before && result.categories.find(c => c.key === before.key)
      if (after && before.name !== after.name && ctx.sidebarRight.active()?.id === active.id) {
        ctx.sidebarRight.openResource(categoryAddress('tieba', after), { kind: categoryTab.kind, replaceTab: active.id })
      }
    },
    findBoards: (site, query, signal) => call('findBoards', { site, query }, signal),
    browse: navigation.browse,
    preview(site, category) {
      ctx.sidebarRight.openResource(categoryAddress(site, category), { kind: categoryTab.kind, destination: 'sidebar' })
      if (category.kind === 'followed') void followed.open()
      else if (followed.snapshot().phase !== 'idle') followed.clear()
    },
    add: (ref, signal, generation) => pick(ref, signal, !generation, generation),
    open: (ref, signal) => pick(ref, signal, false),
    remove: ref => refresh('removeBoard', { site: ref.site, board: ref.sessionId }),
  }
  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = css
    document.head.append(style)
    let attempted = false
    let archived = ''
    function sync() {
      navigation.rememberCurrent()
      if (!attempted && ctx.sessions.list.getSnapshot().phase === 'ready') {
        attempted = true
        void load().catch(error => console.warn('Reader workspace setup failed:', error.message))
      }
      const next = ctx.workspaces.list.getSnapshot().archivedSessionIds.filter(id => catalog.boards.some(item => item.sessionId === id)).join('/')
      if (next !== archived) {
        archived = next
        if (next) void load().catch(error => console.warn('Reader archive sync failed:', error.message))
      }
    }
    function escape(event) {
      if (event.key !== 'Escape' || event.repeat || event.isComposing || event.defaultPrevented) return
      if (!navigation.readingSession(navigation.current()) || document.querySelector('dialog[open], .ngar-menu, [data-context-menu]')) return
      event.preventDefault()
      event.stopPropagation()
      const tab = ctx.sidebarRight.active()
      if (tab?.kind === excerptTab.kind && ctx.sidebarRight.isExpanded()) { closeExcerpt(); return }
      if (tab?.kind === categoryTab.kind && ctx.sidebarRight.isExpanded()) { ctx.sidebarRight.hide(tab.id); return }
      navigation.back()
    }
    function focus() {
      void prefs.load(true)
      if (attempted && Date.now() - lastSync > 60_000) void load().catch(error => console.warn('Reader workspace sync failed:', error.message))
    }
    function storageChanged(event) {
      if (event.key === removalKey && boardForSession(event.newValue)?.kind) forgetReading(event.newValue, false)
      if (event.key === accountKey && followed.snapshot().phase !== 'idle') void followed.open(false)
      if (event.key === excerptKey) { excerpts.conceal(); void excerpts.check() }
    }
    const subscriptions = [ctx.sessions.list, ctx.workspaces.list, ctx.sidebarRight.mounted].map(source => source.subscribe(sync))
    sync()
    window.addEventListener('keydown', escape, true)
    window.addEventListener('focus', focus)
    window.addEventListener('storage', storageChanged)
    return () => {
      for (const dispose of subscriptions) dispose()
      excerpts.dispose()
      style.remove()
      window.removeEventListener('storage', storageChanged)
      window.removeEventListener('focus', focus)
      window.removeEventListener('keydown', escape, true)
    }
  })
  ctx.effect(() => ctx.sidebarRightTabs.register(categoryTab))
  ctx.effect(() => ctx.sidebarRightTabs.register(excerptTab))
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: excerptTab.id,
  }, props => <ExcerptPreview {...props} source={excerpts} close={closeExcerpt} refresh={refreshExcerpt} />))
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config', key: name,
  }, () => <ReaderSettings library={library} />))
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: categoryTab.id,
  }, props => <WithSettings source={prefs}>{() => <CategoryPreview {...props} library={library} />}</WithSettings>))
  ctx.slots.inject('sidebar.workspaces.session.row.action', () => ctx.slots.register({
    name: 'sidebar.workspaces.session.row.action', id: 'nga-remove-board', order: 105,
  }, ({ sessionId }) => boardForSession(sessionId) ? <BoardRemoveAction sessionId={sessionId} library={library} /> : null))
  ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
    name: 'sidebar.workspaces.session.menu.item', id: 'nga-remove-board', order: 500,
  }, props => boardForSession(props.sessionId) ? <BoardRemoveMenu {...props} library={library} /> : null))
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail', id: 'nga-board-content', order: 10,
  }, ({ sessionId, turn }) => boardForSession(sessionId) && turn.turn === 1
    ? <WithSettings source={prefs}>{() => {
      if (boardForSession(sessionId).site === 'xhs') return <ExcerptIndex source={excerpts} mounted={ctx.sidebarRight.mounted} sessionId={sessionId} open={openExcerpt} refresh={refreshExcerpt} />
      const reader = readerFor(sessionId)
      return reader ? <BoardTranscript key={sessionId} reader={reader} library={library} entryOnly={!boardForSession(sessionId).kind} /> :
        <p className="ngar-hint" role="status">这个会话的站点当前不可用。</p>
    }}</WithSettings> : null))
  ctx.slots.inject('conversation.composer', () => ctx.slots.register({
    name: 'conversation.composer', priority: -10,
    select: owner => navigation.readingSession(owner.sessionId) ? owner.sessionId : null,
  }, ({ matched }) => {
    return <WithSettings source={prefs}>{() => {
      const board = navigation.readingSession(matched)
      if (board?.site === 'xhs') return matched === board.sessionId ? <ExcerptComposer source={excerpts} back={navigation.back} refresh={refreshExcerpt} library={library} /> :
        <OpenExcerptIndex open={showIndex} sessionId={board.sessionId} />
      const reader = board && readerFor(board.sessionId)
      return reader && <BoardComposer key={matched} reader={reader} board={board} directoryBlank={matched !== board.sessionId} library={library} back={navigation.back} />
    }}</WithSettings>
  }))
  const binding = { code: 'KeyJ', modifiers: ['primary', 'alt', 'shift'] }
  ctx.effect(() => ctx.shortcuts.register({
    id: 'nga-reader.toggle', label: () => '切换讨论记录与工作对话', aliases: ['摸鱼', '小红书', 'NGA', '贴吧', '阅读', '看帖'],
    defaults: { 'desktop:windows': binding, 'web:windows': binding, 'desktop:linux': binding, 'desktop:macos': binding, 'web:macos': binding },
    regions: ['page', 'editable'], resolve: () => ({ status: 'handled', run: navigation.toggle }),
  }))
}
