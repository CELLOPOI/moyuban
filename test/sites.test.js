import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { call } from '../src/client/host-api.js'
import { createReader } from '../src/client/reader.js'
import { readingActions } from '../src/host/actions.js'
import { boardLibrary } from '../src/host/board-library.js'
import { registerRoutes } from '../src/host/index.js'
import { readerSettings } from '../src/host/settings.js'
import { siteRegistry } from '../src/host/sites.js'
import { boardForSession, boardRef, legacyBoard } from '../src/shared/boards.js'
import { createNga } from '../src/sites/nga/api.js'
import { ngaSite } from '../src/sites/nga/index.js'

function storage(rows = []) {
  const map = new Map(rows)
  return { get length() { return map.size }, key: i => [...map.keys()][i],
    getItem: key => map.get(key), setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }
}

function serveHostRoutes(t, sites, settings) {
  const routes = new Map()
  registerRoutes({ connection: { fetch: { register: route => routes.set(route.path, route.fetch) } } }, sites, settings)
  t.mock.method(globalThis, 'fetch', (address, options) => {
    const url = new URL(address, 'http://localhost')
    return routes.get(url.pathname)(new Request(url, options))
  })
}

test('a pre-site ACG draft follows the entry to the original thread, retaining its old quote until a confirmed receipt', async t => {
  const requests = []
  let confirmed = false
  const nga = createNga(async (path, query, form) => {
    assert.equal(form.access_token, 'fixture')
    requests.push({ path, query, form })
    if (path === '/thread.php') return { status: 200, payload: { __T: [{ tid: 71, quote_from: 42, subject: '跨版' }] } }
    if (path === '/read.php') return { status: 200, payload: { __T: { tid: 42, subject: '原帖' }, __R: [{ lou: 1, pid: 12, content: '正文' }] } }
    assert.equal(path, '/post.php')
    return { status: 200, payload: confirmed ? { data: ['回复成功'] } : {}, text: '' }
  })
  const sites = siteRegistry({ readRecord(key) {
    assert.equal(key, 'dsh-nga-reader/nga-account')
    return { payload: { uid: '17', token: 'fixture' } }
  } }, [ngaSite(nga)])
  serveHostRoutes(t, sites)
  const draft = { text: '原有草稿', quote: { pid: 12, floor: 1, page: 1, excerpt: '原有引用' } }
  const local = storage([['dsh-nga-reader.v1.source', '"example"'],
    ['dsh-nga-reader.v1.nav.example', '{"id":1,"page":2,"listPage":1}'],
    ['dsh-nga-reader.v1.draft.example.71', '{"text":"示例草稿","quote":null}'],
    ['dsh-nga-reader.v1.nav.live', '{"id":71,"page":1,"listPage":1}'],
    ['dsh-nga-reader.v1.draft.live.71', JSON.stringify(draft)], ['dsh-nga-reader.v1.scroll.live.71.1', '120']])
  const reader = createReader(call, local, boardForSession('dsh-nga-reader-acg'), sites.get('nga').info)
  await reader.activate()
  assert.deepEqual(reader.snapshot().draft, draft)
  assert.equal(reader.snapshot().targetId, 42)
  assert.equal(reader.scroll(71, 1), 120)
  await reader.submit()
  assert.match(reader.snapshot().notice, /未确认/)
  assert.deepEqual(reader.snapshot().draft, draft)
  confirmed = true
  await reader.submit()
  const posts = requests.filter(r => r.path === '/post.php')
  assert.equal(posts.length, 2)
  assert.ok(posts.every(r => r.form.tid === 42 && r.form.pid === 12 && r.form.post_content.includes('[pid=12,42,1]')))
  assert.ok(requests.filter(r => r.path === '/read.php').every(r => r.query.tid === 42))
  assert.equal(local.getItem('dsh-nga-reader.v1.draft.live.71'), undefined)
})

test('a registered read-only site keeps its own catalog, matching board and thread IDs, drafts and writes', async t => {
  const home = await mkdtemp(join(tmpdir(), 'reader-sites-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const settings = readerSettings(home)
  const ref = boardRef('sample', 'fid', legacyBoard.id, '同编号版面')
  const sample = { id: 'sample', name: '测试论坛',
    list: ({ board, account }) => {
      assert.equal(board.site, 'sample')
      assert.equal(account, undefined)
      return { items: [{ id: '42', title: '同编号主题', author: '读者' }], page: 1, hasNext: false }
    },
    thread: ({ id, page }) => ({ id, page, pages: 1, title: '测试主题', posts: [{ id: 'floor-1', floor: 0, author: '读者', blocks: [{ kind: 'text', text: '正文' }] }] }),
  }
  const credentials = { readRecord: () => null }
  const noAccount = { ...sample, id: 'no-account', followedBoards() { assert.fail('Followed boards require an account service') } }
  const sites = siteRegistry(credentials, [ngaSite({}), sample, noAccount], settings.read)
  serveHostRoutes(t, sites, settings)
  await settings.withBoards(async ({ boardPath }) => {
    await writeFile(join(boardPath, legacyBoard.sessionId + '.json'), JSON.stringify({ kind: 'fid', id: legacyBoard.id, name: '原来的入口' }))
    const wrongFile = boardRef('sample', 'fid', 12).sessionId + '.json'
    await writeFile(join(boardPath, wrongFile), JSON.stringify({ site: 'sample', kind: 'fid', id: '13', name: '与文件名不符' }))
  })
  const library = boardLibrary(boards => ({ boards, sessionId: boards[0].sessionId }), sites, () => [], settings)
  const added = await library('openBoard', { site: ref.site, board: ref.sessionId, name: ref.name })
  assert.deepEqual(added.boards.map(b => [b.site, b.name]), [['sample', ref.name]])
  assert.deepEqual((await library('workspace')).boards.map(b => [b.site, b.name]), [['nga', '原来的入口']])
  assert.equal(JSON.parse(await readFile(join((await settings.read()).boardPath, ref.sessionId + '.json'))).site, 'sample')
  const local = storage([['dsh-nga-reader.v1.draft.live.42', '{"text":"NGA 草稿","quote":null}']])
  const config = await call('getSettings')
  assert.equal(config.sites.find(s => s.id === noAccount.id).capabilities.followed, false)
  await assert.rejects(call('followedBoards', { site: noAccount.id }), { code: 'UNSUPPORTED' })
  const info = config.sites.find(s => s.id === 'sample')
  for (const cap of ['reply', 'quote', 'login', 'favorites', 'followed']) assert.equal(info.capabilities[cap], false)
  assert.ok(config.sites.every(site => !Object.hasOwn(site.capabilities, 'example')))
  const reader = createReader(call, local, ref, info, config.values)
  await reader.activate()
  await reader.open(reader.snapshot().list.items[0].id)
  assert.equal(reader.snapshot().draft.text, '')
  reader.draft({ text: '只存本地' })
  await reader.submit()
  assert.equal(reader.snapshot().notice, '')
  const restored = createReader(call, local, boardForSession(ref.sessionId), info)
  await restored.activate()
  assert.equal(restored.snapshot().draft.text, '只存本地')
  assert.equal(restored.snapshot().thread.posts[0].id, 'floor-1')
  const target = { site: ref.site, board: ref.sessionId, mode: 'live', id: '42', text: '测试', requestId: crypto.randomUUID() }
  await assert.rejects(call('reply', target), { code: 'UNSUPPORTED' })
  await assert.rejects(call('reply', { ...target, site: 'nga' }), { code: 'INVALID_INPUT' })
  await assert.rejects(call('reply', { ...target, mode: 'example' }), { code: 'UNSUPPORTED' })
  for (const action of ['reply', 'login', 'logout', 'syncBoards', 'openBoard', 'removeBoard', 'saveSettings']) {
    await assert.rejects(call(action, { ...target, site: 'missing' }), { code: 'UNKNOWN_SITE' })
  }
  await library('removeBoard', target)
  restored.clearReading()
  assert.equal(JSON.parse(local.getItem('dsh-nga-reader.v1.draft.live.42')).text, 'NGA 草稿')
  assert.deepEqual((await library('workspace')).boards.map(b => b.sessionId), [legacyBoard.sessionId])
})

test('a lost or unreadable HTTP reply receipt stays unconfirmed', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new TypeError('Disconnected') })
  await assert.rejects(call('reply'), /未确认.*核对/)
  fetch.mock.mockImplementation(() => new Response('<html>'))
  await assert.rejects(call('reply'), /未确认.*核对/)
  await assert.rejects(call('thread'), /无法连接阅读插件/)
  assert.equal(fetch.mock.callCount(), 3)
})

test('a stale example client is rejected before any live read or send, even with a connected account', async t => {
  const transport = t.mock.fn(() => ({ status: 200, payload: { data: ['回复成功'] } }))
  const sites = siteRegistry({ readRecord: () => ({ payload: { uid: '17', token: 'fixture' } }) }, [ngaSite(createNga(transport))])
  serveHostRoutes(t, sites)
  const fields = { board: legacyBoard.sessionId, mode: 'example', id: 1, page: 1, text: '旧草稿', requestId: crypto.randomUUID() }
  for (const action of ['topics', 'thread', 'replies', 'reply']) {
    await assert.rejects(call(action, fields), { code: 'UNSUPPORTED', message: /示例模式已停用/ })
  }
  await assert.rejects(call('reply', { ...fields, mode: undefined }), { code: 'INVALID_INPUT' })
  assert.equal(transport.mock.callCount(), 0)
  assert.equal((await call('reply', { ...fields, mode: 'live' })).sent, true)
  assert.deepEqual(transport.mock.calls.map(c => c.arguments[0]), ['/post.php'])
})

test('a board with only old example navigation opens the real index and cannot restore an example draft by ID', async () => {
  const ref = boardRef('nga', 'fid', '12')
  const prefix = 'dsh-nga-reader.v1.' + ref.sessionId + '.'
  const local = storage([['source', '"example"'], ['nav.example', '{"id":1,"page":2,"listPage":2}'],
    ['page.example.1', '2'], ['draft.example.1', '{"text":"旧草稿","quote":{"pid":8}}'],
    ['expanded.example.1.1', '[7]'], ['scroll.example.1.1', '80']].map(([key, value]) => [prefix + key, value]))
  const requests = []
  const api = async (action, fields) => {
    requests.push(action)
    if (action === 'account') return { connected: true }
    assert.equal(fields.mode, 'live')
    assert.equal(fields.page, 1)
    return action === 'topics' ? { items: [{ id: 1, title: '来自站点' }] } : { id: 1, page: 1, pages: 1, posts: [] }
  }
  const reader = createReader(api, local, ref, siteRegistry({}).get('nga').info)
  await reader.activate()
  assert.equal(reader.snapshot().id, 0)
  assert.deepEqual(requests, ['account', 'topics'])
  await reader.open(reader.snapshot().list.items[0].id)
  assert.deepEqual(reader.snapshot().draft, { text: '', quote: null })
  assert.equal(reader.scroll(1, 1), 0)
  assert.deepEqual(reader.expanded(1, 1), [])
  await reader.submit()
  assert.deepEqual(requests, ['account', 'topics', 'thread'])
})

test('live submissions with the same user, topic and request IDs use only their own site grant and transport', async () => {
  const sent = []
  const nga = ngaSite({ reply: async (_id, _text, _quote, user) => { sent.push(user.token); return { sent: true } } })
  const second = { id: 'sample', name: '测试站', list() {}, thread() {}, replyRequiresLogin: true,
    createAccount: grant => ({ read: grant.read, id: user => user.uid }),
    reply: ({ account }) => { sent.push(account.token); return { sent: true } } }
  const credentials = { readRecord: key => ({ payload: { uid: '17', token: key } }) }
  const run = readingActions(siteRegistry(credentials, [nga, second]))
  const target = { mode: 'live', id: 42, text: '测试', requestId: crypto.randomUUID() }
  const other = { ...target, site: 'sample', board: boardRef('sample', legacyBoard.kind, legacyBoard.id).sessionId }
  await run('reply', target)
  await run('reply', other)
  await run('reply', other)
  assert.deepEqual(sent, ['dsh-nga-reader/nga-account', 'dsh-nga-reader/sample-account'])
})
