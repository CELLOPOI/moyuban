import { boardForSession, entryForSite, legacySite } from '../shared/boards.js'

function readTab(key) { try { return sessionStorage.getItem('dsh-nga-reader.' + key) } catch { return null } }
function saveTab(key, value) { try { sessionStorage.setItem('dsh-nga-reader.' + key, value) } catch {} }

export function workspaceNavigation(ctx, workspaces, loadWorkspaces) {
  let previous = readTab('previous'), lastBoard = readTab('last-board')
  let lastSite = readTab('last-site') || boardForSession(lastBoard)?.site || legacySite
  const current = () => ctx.sidebarRight.mounted.getSnapshot()
  const nativeWorkspaces = () => ctx.workspaces.list.getSnapshot().items

  function workspaceSite(workspace) {
    return workspace && ([...workspaces.values()].find(item => item.workspaceId === workspace.workspaceId)?.site ??
      workspace.sessionIds.map(boardForSession).find(Boolean)?.site)
  }
  function readingSession(id) {
    const ref = boardForSession(id)
    if (ref) return ref
    if (!id || !ctx.sessions.list.getSnapshot().byId[id]?.blank) return null
    // 「新会话」的归属取自原生工作区，用户改名后仍能识别对应站点。
    const site = workspaceSite(nativeWorkspaces().find(item => item.sessionIds.includes(id)))
    return site ? entryForSite(site) : null
  }
  function rememberCurrent() {
    const id = current()
    const ref = readingSession(id)
    if (ref) {
      if (ref.site !== lastSite) { lastSite = ref.site; saveTab('last-site', ref.site) }
      if (ref.kind && id !== lastBoard) { lastBoard = id; saveTab('last-board', id) }
    } else if (id && id !== previous) {
      const session = ctx.sessions.list.getSnapshot().byId[id]
      // 空会话先进入会话列表，工作区成员到齐后才能确定它是否是选版入口。
      if (session && (!session.blank || nativeWorkspaces().some(item => item.sessionIds.includes(id)))) {
        previous = id
        saveTab('previous', id)
      }
    }
  }
  function forgetBoard(id) {
    if (lastBoard === id) { lastBoard = null; saveTab('last-board', '') }
  }
  function destination(result) {
    return result.boards.some(item => item.sessionId === lastBoard) ? lastBoard : result.sessionId
  }
  function browse(from) {
    if (from && from !== current()) return
    const site = readingSession(current())?.site
    const id = site && (workspaces.get(site)?.workspaceId ?? nativeWorkspaces().find(item => workspaceSite(item) === site)?.workspaceId)
    if (id) ctx.uiWorkspace.startSession(id)
  }
  function back() {
    const sessions = ctx.sessions.list.getSnapshot().byId
    if (previous && sessions[previous] && !readingSession(previous)) {
      ctx.uiWorkspace.openSession(previous)
    } else {
      const other = nativeWorkspaces().find(item => !workspaceSite(item))
      ctx.uiWorkspace.startSession(other?.workspaceId)
    }
  }
  async function toggle() {
    if (readingSession(current())) return back()
    const navigation = ctx.layout.beginNavigation()
    if (!workspaces.has(lastSite)) await loadWorkspaces()
    const result = workspaces.get(lastSite) ?? workspaces.get(legacySite)
    if (result && !navigation.aborted) ctx.uiWorkspace.openSession(destination(result))
  }
  return { current, readingSession, rememberCurrent, forgetBoard, destination, browse, back, toggle }
}
