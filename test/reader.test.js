import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createActions } from '../src/host/index.js'
import { createNga, normalizeList, normalizeThread, verifyReply } from '../src/sites/nga/api.js'
import { contentBlocks } from '../src/sites/nga/content.js'
import { ngaReader } from '../test-support/reader.js'

function credentials() {
  let value
  return {
    readRecord: async () => value,
    modifyRecord: async (_key, update) => { value = await update(value) },
    deleteRecord: async () => { value = undefined },
  }
}

test('numbered NGA rows preserve authors, original floors and the last partial page', () => {
  const list = normalizeList({ __T: { 0: { tid: '91', subject: 'A &amp; B', author: '北窗' } }, __T__ROWS_PAGE: 1, __ROWS: 2 }, 1)
  assert.equal(list.items[0].title, 'A & B')
  assert.equal(list.hasNext, true)
  const thread = normalizeThread({ __T: { tid: 91, subject: 'A', replies: 20 }, __R: { 0: { pid: 18, authorid: -5, lou: 20, content: '楼层' } },
    __U: { '-5': { username: '匿名' } }, __ROWS: 21, __PAGE: 2 }, 91, 2)
  assert.deepEqual([thread.pages, thread.posts[0].floor, thread.posts[0].author], [2, 20, '匿名'])
  assert.throws(() => normalizeThread({ __T: {} }, 91, 1), { code: 'NGA_RESPONSE' })
})

test('forum markup renders as text and images are limited to NGA origins', () => {
  const blocks = contentBlocks('开头<br>第二行[quote][b]引文[/b][/quote][img]./mon_202611/a.jpg[/img][img]https://nga.cn.fake.invalid/a.jpg[/img]<script>alert(1)</script>')
  assert.equal(blocks[0].text, '开头\n第二行')
  assert.deepEqual(blocks[1], { kind: 'quote', text: '引文', runs: [{ text: '引文', bold: true }] })
  assert.equal(blocks.filter(block => block.kind === 'image').length, 1)
  assert.equal(blocks[2].url, 'https://img.nga.cn/attachments/mon_202611/a.jpg')
})

test('QR secrets stay on the host and desktop and web can read the same grant', async () => {
  const creds = credentials()
  const user = { uid: '17', name: '测试账号', token: 'test-only-credential' }
  let polls = 0
  const nga = {
    beginLogin: async () => ({ key: 'test-qr', secret: 'test-only-secret', url: 'https://bbs.nga.cn/' }),
    pollLogin: async () => ++polls === 1 ? null : user,
  }
  const desktop = createActions(creds, nga)
  const web = createActions(creds, nga)
  const ticket = await desktop('login')
  assert.deepEqual(Object.keys(ticket).sort(), ['expiresAt', 'id', 'image'])
  assert.deepEqual(await desktop('poll', { id: ticket.id }), { state: 'pending' })
  assert.deepEqual(await desktop('poll', { id: ticket.id }), { state: 'connected', name: user.name })
  assert.deepEqual(await web('account'), { connected: true, name: user.name })
  await web('logout')
  assert.equal((await desktop('account')).connected, false)
})

test('a refused visitor request and an unconfirmed reply have different recovery paths', async () => {
  const refused = createNga(async () => ({ status: 403, payload: {}, text: '<script>guestJs</script>' }))
  await assert.rejects(refused.list(1), { code: 'NGA_ACCESS' })
  assert.throws(() => verifyReply({ status: 200, text: '<html>登入</html>' }), { code: 'REPLY_UNKNOWN' })
  assert.throws(() => verifyReply({ status: 200, payload: { data: { post_content: '回复成功' } }, text: '' }), { code: 'REPLY_UNKNOWN' })
  assert.throws(() => verifyReply({ status: 200, payload: { error: { 0: '已锁定' } }, text: '' }), { code: 'REPLY_REFUSED' })
  assert.doesNotThrow(() => verifyReply({ status: 200, payload: { error: { 0: ':发贴完毕' } }, text: '' }))
})

test('real reply requires an account, sends credentials in the body and includes the quote target', async () => {
  let form
  const nga = createNga(async (path, query, fields) => {
    assert.equal(path, '/post.php')
    assert.equal(query.access_token, undefined)
    form = fields
    return { status: 200, payload: { data: { 0: '回复成功' } }, text: '' }
  })
  await assert.rejects(nga.reply(9, '回复', null), { code: 'LOGIN_REQUIRED' })
  await nga.reply(9, '回复', { pid: 12, floor: 2, page: 1, excerpt: '引用的文字' }, { uid: '17', token: 'fixture' })
  assert.equal(form.access_token, 'fixture')
  assert.match(form.post_content, /\[pid=12,9,1\]/)
  assert.equal(form.tid, 9)
})

test('a concurrent replay of the same live submission sends once', async () => {
  const creds = credentials()
  await creds.modifyRecord('', () => ({ kind: 'grant', payload: { uid: '17', token: 'fixture' } }))
  let sent = 0
  const run = createActions(creds, { reply: async () => { sent++; return { sent: true } } })
  const data = { id: 1, mode: 'live', text: '回帖', requestId: randomUUID() }
  await Promise.all([run('reply', data), run('reply', data)])
  await assert.rejects(run('reply', { ...data, text: '已修改' }), { code: 'REPLY_CONFLICT' })
  assert.equal(sent, 1)
})

test('changing thread ignores a slower response and keeps the correct draft after a remount', async () => {
  const store = new Map()
  const storage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) }
  let done
  const api = async (action, { id } = {}) => {
    if (action === 'thread' && id === 1) return new Promise(resolve => { done = resolve })
    if (action === 'thread') return { id, page: 1, pages: 1, posts: [] }
    if (action === 'reply') throw new Error('未确认')
    return {}
  }
  const reader = ngaReader(api, storage)
  const old = reader.open(1)
  await reader.open(2)
  reader.draft({ text: '保留这一条' })
  done({ id: 1, page: 1, pages: 1 })
  await old
  assert.equal(reader.snapshot().thread.id, 2)
  await reader.submit()
  assert.equal(reader.snapshot().draft.text, '保留这一条')
  const reopened = ngaReader(api, storage)
  await reopened.open(2)
  assert.equal(reopened.snapshot().draft.text, '保留这一条')
})

test('a confirmed reply preserves a newer draft written by another tab', async () => {
  const rows = new Map()
  const storage = { getItem: key => rows.get(key), setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key) }
  const receipt = Promise.withResolvers()
  const api = async (action, { id, page }) => {
    if (action === 'reply') return receipt.promise
    if (action === 'topics') return { items: [] }
    return { id, page, pages: 1, posts: [] }
  }
  const first = ngaReader(api, storage), second = ngaReader(api, storage)
  await first.open(42)
  first.draft({ text: '已发送的原稿' })
  await second.open(42)
  const sending = first.submit()
  const newer = { text: '另一标签页的新稿', quote: { postId: 9, floor: 3, page: 1, excerpt: '新的引用' } }
  second.draft(newer)
  receipt.resolve({ sent: true, page: 1 })
  await sending
  const reopened = ngaReader(api, storage)
  await reopened.open(42)
  assert.deepEqual(reopened.snapshot().draft, newer)
  assert.deepEqual(first.snapshot().draft, newer)
})
