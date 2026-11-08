import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { entry, workspaceName } from '../src/shared/boards.js'
import { forum } from '../src/sites/nga/boards.js'
import { boardLibrary } from '../src/host/board-library.js'
import { createNga } from '../src/sites/nga/api.js'
import { ngaSite } from '../src/sites/nga/index.js'
import { siteRegistry } from '../src/host/sites.js'
import { boardWorkspace } from '../src/host/workspace.js'
import { ngaReader } from '../test-support/reader.js'
import { readerSettings } from '../src/host/settings.js'

test('picking promotes the selected board, favorites remain protected and the original pin policy can be restored', async t => {
  const root = await mkdtemp(join(tmpdir(), 'nga-directory-'))
  const oldHome = process.env.DSH_HOME
  process.env.DSH_HOME = root
  t.after(async () => {
    if (oldHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = oldHome
    await rm(root, { recursive: true, force: true })
  })
  const fixed = forum('fid', -7, '闲谈'), collection = forum('stid', 42, '游戏合集')
  const settings = readerSettings(root)
  let catalogReads = 0, account = null
  const nga = createNga(async (path, query, fields) => {
    if (path === '/nuke.php') return { status: 200, payload: { data: [{ fid: -7, name: fixed.name }] } }
    assert.equal(path, '/app_api.php')
    assert.equal(query.__act, 'category')
    assert.deepEqual(fields, {})
    catalogReads++
    return { status: 200, payload: { data: [{ _id: 'games', name: '游戏', groups: [
      { name: '讨论', forums: [{ fid: -7, name: fixed.name }] },
      { name: '合集', forums: [{ fid: -7, stid: '42', name: collection.name }] },
    ] }] } }
  })
  const members = new Set(), pins = new Set(), archives = new Set()
  const workspace = { id: 'workspace', path: join(root, 'plugin-workspaces', workspaceName),
    get sessionIds() { return [...members] }, attachSession: id => members.add(id), detachSession: id => members.delete(id) }
  const registry = { create: () => workspace, get pinnedSessionIds() { return [...pins] }, get archivedSessionIds() { return [...archives] },
    pinSession: id => pins.add(id), unpinSession: id => pins.delete(id), archiveSession: id => archives.add(id), unarchiveSession: id => archives.delete(id) }
  const syncWorkspace = boardWorkspace({ workspaceRegistry: registry, sessionPersistence: { stat: () => ({ header: { cwd: workspace.path }, eventCount: 3 }) } })
  const sites = siteRegistry({ readRecord: () => ({ payload: account }) }, [ngaSite(nga)], settings.read)
  const library = boardLibrary(syncWorkspace, sites, () => registry.archivedSessionIds, settings)
  assert.equal((await library('workspace', {})).sessionId, entry.sessionId)
  const [category] = await sites.get('nga').directory.read()
  assert.deepEqual(category.groups.map(group => group.boards[0]), [fixed, collection])
  account = { uid: '77', token: 'fixture' }
  const request = { input: 'stid=42', fromDirectory: true }
  await library('openBoard', request)
  await library('openBoard', request)
  assert.deepEqual(members, new Set([fixed.sessionId, collection.sessionId]))
  assert.deepEqual([...pins], [collection.sessionId])
  assert.equal((await library('workspace', {})).boards[0].sessionId, collection.sessionId)
  const config = await settings.read()
  await settings.save({ ...config.values, promoteOnPick: false, openOnPick: false }, config.revision)
  assert.equal((await library('workspace', {})).settings.openOnPick, false)
  assert.deepEqual([...pins], [fixed.sessionId])
  assert.equal(catalogReads, 1)
  await assert.rejects(library('removeBoard', { input: 'fid=-7' }), { code: 'FAVORITE_BOARD' })
  assert.equal((await library('removeBoard', request)).removed, collection.sessionId)
  assert.deepEqual((await library('workspace', {})).manual, [])
  assert.ok(archives.has(collection.sessionId))
  await library('openBoard', request)
  assert.ok(!archives.has(collection.sessionId))
  assert.ok(members.has(collection.sessionId))
})

test('forgetting the legacy board erases both sources and prevents a late read from restoring its position', async () => {
  const rows = new Map()
  const storage = { get length() { return rows.size }, key: i => [...rows.keys()][i],
    getItem: k => rows.get(k), setItem: (k, v) => rows.set(k, v), removeItem: k => rows.delete(k) }
  const api = async (_action, { id, page }) => ({ id, page, pages: 3 })
  const other = ngaReader(api, storage, forum('fid', 9))
  await other.open(11, 2)
  other.draft({ text: '保留' })
  const legacy = ngaReader(api, storage)
  await legacy.open(11, 2)
  legacy.draft({ text: '清除', quote: { floor: 2 } })
  storage.setItem('dsh-nga-reader.v1.expanded.example.11.3', '[3]')
  legacy.scroll(11, 2, 130)
  legacy.setAppearance('effort', 'High')
  let finish
  const reopened = ngaReader(() => new Promise(resolve => { finish = resolve }), storage)
  const late = reopened.open(11, 3)
  reopened.clearReading()
  finish({ id: 11, page: 3, pages: 3 })
  await late
  const fresh = ngaReader(api, storage)
  assert.equal(fresh.snapshot().id, 0)
  assert.equal(fresh.snapshot().appearance.effort, 'High')
  await fresh.open(11)
  assert.equal(fresh.snapshot().page, 1)
  assert.deepEqual(fresh.snapshot().draft, { text: '', quote: null })
  assert.equal(storage.getItem('dsh-nga-reader.v1.expanded.example.11.3'), undefined)
  assert.equal(fresh.scroll(11, 2), 0)
  await other.open(11)
  assert.equal(other.snapshot().draft.text, '保留')
})
