import test from 'node:test'
import assert from 'node:assert/strict'
import { createNga } from '../src/sites/nga/api.js'

const account = { uid: '42', token: 'fixture-only' }
const broken = '{"data":{"__R":{"0":{"lou":0,"content":"partial"}},'

test('a cut-off page recovers through compact JSON with the same account, page and GBK text', async t => {
  const outputs = []
  t.mock.method(globalThis, 'fetch', (url, init) => {
    assert.equal(url.pathname, '/read.php')
    assert.equal(url.searchParams.get('tid'), '99')
    assert.equal(url.searchParams.get('page'), '2')
    assert.equal(url.searchParams.has('access_token'), false)
    assert.deepEqual(Object.fromEntries(init.body), { access_uid: account.uid, access_token: account.token })
    outputs.push(url.searchParams.get('__output'))
    if (outputs.length === 1) return new Response(broken)
    // C2 A5 既是 GBK 的“楼”，也是 UTF-8 的“¥”；NGA 的紧凑 JSON 有时还带未转义的制表符。
    return new Response(Buffer.concat([
      Buffer.from('{"data":{"__T":{"subject":"A"},"__PAGE":2,"__ROWS":21,"__R":{"0":{"lou":20,"content":"'),
      Buffer.from([0xc2, 0xa5]), Buffer.from('\tB"}}}}'),
    ]))
  })
  const thread = await createNga().thread(99, 2, account)
  assert.deepEqual(outputs, ['11', '8'])
  assert.equal(thread.page, 2)
  assert.equal(thread.posts.length, 1)
  assert.equal(thread.posts[0].blocks[0].text, '楼\tB')
})

test('XML fallback restores original floors, authors and markup after both JSON formats fail', async t => {
  const outputs = []
  t.mock.method(globalThis, 'fetch', url => {
    outputs.push(url.searchParams.get('__output'))
    if (outputs.length === 1) return new Response(broken)
    if (outputs.length === 2) return new Response('{"data":{"__U":{}}}')
    assert.equal(url.searchParams.get('lite'), 'xml')
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><root>
      <__T><subject>未登录时的提示 &amp; 用法</subject></__T><__PAGE>1</__PAGE><__ROWS>3</__ROWS>
      <__U><item i="801"><username>北窗</username></item><item i="-3"><username>读者</username></item></__U>
      <__R><item i="0"><lou>0</lou><authorid>801</authorid><content><![CDATA[主楼]]></content></item>
      <item i="1"><lou>2</lou><authorid>-3</authorid><content>上行&lt;br/&gt;下行</content></item></__R></root>`)
  })
  const thread = await createNga().thread(99, 1, account)
  assert.deepEqual(outputs, ['11', '8', '10'])
  assert.equal(thread.title, '未登录时的提示 & 用法')
  assert.deepEqual(thread.posts.map(post => [post.floor, post.author, post.blocks[0].text]),
    [[0, '北窗', '主楼'], [2, '读者', '上行\n下行']])
})

test('exhausted formats do not show partial floors or the raw response', async t => {
  const bodies = [broken, '', '<root><__T><subject>partial</subject></__T><__R><item i="0"><lou>0</lou></item></__R>',
    '<html><div id="m_posts_c"><!--postliststart--><table><tr id="post1strow0"><td>partial']
  const fetch = t.mock.method(globalThis, 'fetch', () => new Response(bodies.shift()))
  await assert.rejects(createNga().thread(99, 1, account), error => {
    assert.equal(error.code, 'NGA_FORMAT')
    assert.match(error.message, /帖子正文.*HTTP 200/)
    assert.doesNotMatch(error.message, /partial|fixture-only/)
    return true
  })
  assert.equal(fetch.mock.callCount(), 4)
})

test('access denials, rate limits, HTTP errors and unconfirmed writes are never retried', async t => {
  const responses = [
    Response.json({ error: { 0: '权限不足' } }, { status: 403 }),
    Response.json({ error: { 0: '主题已删除' } }),
    new Response('', { status: 429 }), new Response('', { status: 503 }), new Response(broken),
  ]
  const fetch = t.mock.method(globalThis, 'fetch', () => responses.shift())
  const nga = createNga()
  await assert.rejects(nga.thread(99, 1, account), { code: 'NGA_REFUSED', message: '权限不足' })
  await assert.rejects(nga.thread(99, 1, account), { code: 'NGA_REFUSED', message: '主题已删除' })
  await assert.rejects(nga.list(1, account), { code: 'NGA_RATE_LIMIT' })
  await assert.rejects(nga.thread(99, 1, account), { code: 'NGA_RESPONSE' })
  await assert.rejects(nga.reply(99, 'test', null, account), { code: 'REPLY_UNKNOWN' })
  assert.equal(fetch.mock.callCount(), 5)
})
