import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { boardForSession, legacySite, workspaceName } from '../shared/boards.js'

export function dshHome() {
  const configured = process.env.DSH_HOME
  if (!configured?.trim()) return join(homedir(), '.dsh')
  // 与 DSH 的主目录解析规则一致，包含 Windows 上配置的 ~/ 和 ~\ 前缀。
  if (configured === '~') return homedir()
  if (/^~[/\\]/.test(configured)) return resolve(homedir(), configured.slice(2))
  return resolve(configured)
}

export function siteWorkspacePath(site, home = dshHome()) {
  const folder = site.id === legacySite ? workspaceName : site.workspaceName || site.id
  return join(home, 'plugin-workspaces', folder)
}

// DSH 工作区只展示带已开始轮次的常驻会话。这个已结束的本地轮次是阅读视图的挂载点。
// 主题与楼层由客户端按需读取，持久会话里只保存标题和轮次边界。
export function boardWorkspace(ctx) {
  let queue = Promise.resolve()
  async function attach(workspace, item) {
    const store = ctx.sessionPersistence
    const id = item.sessionId
    const existing = await store.stat(id)
    if (existing && existing.header.cwd !== workspace.path) throw new Error('Board session belongs to a different workspace')
    let empty = !existing || existing.eventCount === 0
    if (existing && existing.eventCount === undefined) {
      const handle = await store.open(id, 'read')
      try { empty = (await handle.read(0, 1)).events.length === 0 } finally { await handle.close() }
    }
    if (empty) {
      const time = Date.now()
      const events = [
        { type: 'session/title', data: { title: item.name, messageSeqs: [], source: { kind: 'user' } } },
        { type: 'turn/start', data: { turn: 1 } },
        { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
      ].map((event, seq) => ({ ...event, seq, time }))
      let handle
      try {
        if (!existing) {
          const { header } = ctx.sessions.prepare(id, { meta: { cwd: workspace.path } })
          try { handle = await store.create(header) }
          catch (error) {
            if (error.name !== 'SessionAlreadyExistsError' || (await store.stat(id))?.header.cwd !== workspace.path) throw error
            handle = await store.open(id, 'write')
          }
        }
        if (existing) handle = await store.open(id, 'write')
        if (handle) {
          const { events: saved } = await handle.read(0, 1)
          if (!saved.length) await handle.append(events)
          await handle.flush()
        }
      } finally { if (handle) await handle.close() }
    }
    await workspace.attachSession(id)
  }
  async function reconcile(boards, pinIds, site) {
    const path = siteWorkspacePath(site)
    await mkdir(path, { recursive: true })
    const workspace = await ctx.workspaceRegistry.create(path, site.id === legacySite ? workspaceName : site.workspaceName || site.name)
    const managed = id => boardForSession(id)?.site === site.id
    const wanted = new Set(boards.map(item => item.sessionId))
    const attached = new Set(workspace.sessionIds)
    for (const id of ctx.workspaceRegistry.archivedSessionIds ?? []) {
      if (wanted.has(id)) await ctx.workspaceRegistry.unarchiveSession(id)
    }
    // DSH 把新增会话放在最前。对已有会话保留用户设置的顺序和标题。
    for (const item of [...boards].reverse()) if (!attached.has(item.sessionId)) await attach(workspace, item)
    // 置顶只管理本工作区的阅读入口，保留其他工作区的置顶和排序。
    const pinned = new Set(ctx.workspaceRegistry.pinnedSessionIds)
    for (const id of pinned) {
      if ((attached.has(id) || wanted.has(id)) && managed(id) && !pinIds.includes(id)) await ctx.workspaceRegistry.unpinSession(id)
    }
    for (const id of [...pinIds].reverse()) if (!pinned.has(id)) await ctx.workspaceRegistry.pinSession(id)
    for (const id of attached) {
      if (!managed(id) || wanted.has(id)) continue
      // 仅解除挂接会把目录或已移除的版面漏到 DSH 的「未分组」中。
      await ctx.workspaceRegistry.archiveSession(id)
      await workspace.detachSession(id)
    }
    return { workspaceId: workspace.id, sessionId: boards[0].sessionId, boards }
  }
  return (boards, pinIds = [], site = { id: legacySite }) => {
    const result = queue.then(() => reconcile(boards, pinIds, site))
    queue = result.catch(() => {})
    return result
  }
}
