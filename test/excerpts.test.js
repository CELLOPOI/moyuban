import assert from 'node:assert/strict'
import test from 'node:test'
import { excerptStore } from '../src/client/excerpt-store.js'
import { readingActions } from '../src/host/actions.js'
import { siteRegistry } from '../src/host/sites.js'
import { commentPage, detailNote, feedCard, initialState, mediaUrl } from '../src/sites/xhs/content.js'
import { createFeed } from '../src/sites/xhs/feed.js'
import { readAttachment } from '../src/sites/xhs/media.js'

const a = '1234567890abcdef12345678', b = '1234567890abcdef12345679'
const cdn = 'https://sns-webpic.xhscdn.com/opaque?stamp=fixture'
const secret = 'private-link-context'
const rawCard = id => ({ id, xsec_token: secret, note_card: { display_title: '标题', type: 'normal', user: { nickname: '作者' } } })
const note = id => detailNote({ note_id: id, type: 'normal', title: '标题', desc: '正文',
  image_list: [{ url_default: cdn }, { url_default: 'https://other.invalid/x' }, { url_default: cdn + '2' }] }, id)
function grantStore() {
  let current = null
  return { read: async () => current, save: async transform => { current = transform(current) }, clear: async () => { current = null } }
}

test('the homepage uses its own cursor, suppresses duplicate SSR batches, and only exposes media for opened notes', async t => {
  const grant = grantStore(), next = [[a], [a, b]]
  const feed = createFeed(grant, { source: async () => ({
    home: async () => ({ items: [feedCard(rawCard(a))], more: true }),
    next: async () => ({ items: next.shift().map(id => feedCard(rawCard(id))), more: true }),
    detail: async card => note(card.id),
    comments: async (_card, cursor) => ({ items: [{ id: 'reply', text: '正文' }], cursor: cursor ? '' : 'private', more: !cursor }),
    close: async () => {},
  }) })
  t.after(feed.dispose)
  const run = readingActions(siteRegistry({}, [{ id: 'xhs', name: '资料摘录', createFeed: () => feed }]))
  const call = (action, body) => run(action, { site: 'xhs', ...body })
  const first = await call('homeFeed', { batch: 0 }), fields = { run: first.run, id: b }
  assert.ok(!JSON.stringify(first).includes(secret))
  const [fresh, repeated] = await Promise.all([1, 1].map(batch => call('homeFeed', { ...fields, batch })))
  assert.deepEqual(fresh, repeated)
  assert.deepEqual(fresh.items.map(r => r.id), [b])
  await assert.rejects(feed.attachment(fields, 'image', '0'), { code: 'INVALID_INPUT' })
  const opened = await call('feedNote', fields)
  assert.deepEqual(opened.images.map(r => r.available), [true, false, true])
  assert.ok(!JSON.stringify(opened).includes(cdn))
  assert.equal(await feed.attachment(fields, 'image', '2'), cdn + '2')
  await assert.rejects(feed.attachment(fields, 'image', '3'), { code: 'INVALID_INPUT' })
  await assert.rejects(call('feedComments', { ...fields, batch: 1 }), { code: 'INVALID_INPUT' })
  assert.ok((await call('feedComments', { ...fields, batch: 0 })).more)
  assert.equal((await call('feedComments', { ...fields, batch: 1 })).more, false)
  await assert.rejects(call('reply', fields), { code: 'UNSUPPORTED' })
})

test('switching credentials invalidates an in-flight page, its cursor and every old attachment', async t => {
  const grant = grantStore()
  await grant.save(() => ({ generation: 'old' }))
  const pending = Promise.withResolvers(), entered = Promise.withResolvers()
  let closed = 0
  const feed = createFeed(grant, { source: async () => ({
    home: async () => ({ items: [feedCard(rawCard(a))], more: true }),
    next: async () => { entered.resolve(); return pending.promise }, detail: async () => note(a), close: async () => { closed++ },
  }) })
  t.after(feed.dispose)
  const first = await feed.action('homeFeed', { batch: 0 })
  await feed.action('feedNote', { run: first.run, id: a })
  const old = feed.action('homeFeed', { run: first.run, batch: 1 })
  await entered.promise; await grant.save(() => ({ generation: 'new' }))
  pending.resolve({ items: [feedCard(rawCard(b))], more: false })
  await assert.rejects(old, { code: 'ACCOUNT_CHANGED' })
  await assert.rejects(feed.attachment({ run: first.run, id: a }, 'image', '0'), { code: 'FEED_EXPIRED' })
  const restarted = await feed.action('homeFeed', { batch: 0 })
  assert.notEqual(restarted.run, first.run)
  assert.equal(restarted.generation, 'new')
  assert.equal(closed, 1)
})

test('only the login ticket that opened the official window may save its grant and the window closes', async t => {
  const grant = grantStore()
  let closed = 0
  const feed = createFeed(grant, { login: async () => ({ close: async () => { closed++ }, check: async () => ({ cookies: [{ value: secret }] }) }) })
  t.after(feed.dispose)
  const { ticket } = await feed.action('feedLogin', {})
  await assert.rejects(feed.action('feedPoll', { ticket: 'unknown' }), { code: 'LOGIN_CLOSED' })
  const result = await feed.action('feedPoll', { ticket })
  assert.deepEqual(Object.keys(result), ['generation'])
  assert.equal((await grant.read()).cookies[0].value, secret)
  await assert.rejects(feed.action('feedLogout', { generation: 'stale' }), { code: 'ACCOUNT_CHANGED' })
  await feed.action('feedLogout', result)
  assert.equal(await grant.read(), null)
  assert.equal(closed, 1)
})

test('refresh acquires a new first batch before retiring the old feed and its media grants', async t => {
  const grant = grantStore(), closed = []
  let opened = 0
  const feed = createFeed(grant, { source: async () => {
    const n = ++opened
    return {
      home: async () => { if (n === 2) throw Error('Offline'); return { items: [feedCard(rawCard(n === 1 ? a : b))], more: true } },
      next: async () => ({ items: [feedCard(rawCard(b))], more: false }),
      detail: async () => note(a), close: async () => { closed.push(n) },
    }
  } })
  t.after(feed.dispose)
  const call = readingActions(siteRegistry({}, [{ id: 'xhs', name: '资料摘录', createFeed: () => feed }]))
  const act = (action, fields) => call(action, { site: 'xhs', ...fields })
  const first = await act('homeFeed', { batch: 0 }), fields = { run: first.run, id: a }
  await act('feedNote', fields)
  await assert.rejects(act('feedRefresh', { generation: '' }), { code: 'SOURCE_UNAVAILABLE' })
  assert.deepEqual(closed, [2])
  assert.equal(await feed.attachment(fields, 'image', '0'), cdn)
  assert.deepEqual((await act('homeFeed', { ...fields, batch: 1 })).items.map(row => row.id), [b])
  const fresh = await act('feedRefresh', { generation: '' })
  assert.deepEqual(closed, [2, 1])
  assert.notEqual(fresh.run, first.run)
  assert.deepEqual(fresh.items.map(row => row.id), [b])
  assert.equal((await act('feedRefresh', { run: first.run, generation: '' })).run, fresh.run)
  assert.equal(opened, 3)
  await assert.rejects(feed.attachment(fields, 'image', '0'), { code: 'FEED_EXPIRED' })
  await grant.save(() => ({ generation: 'other' }))
  await assert.rejects(act('feedRefresh', { generation: '' }), { code: 'ACCOUNT_CHANGED' })
  assert.deepEqual(closed, [2, 1, 3])
})

test('refresh racing a changed grant clears both browser sessions even if the new fetch fails', async t => {
  const grant = grantStore(), result = Promise.withResolvers(), started = Promise.withResolvers(), closed = []
  let i = 0
  const feed = createFeed(grant, { source: async () => {
    const n = ++i
    return { home: () => { if (n > 1) { started.resolve(); return result.promise } return { items: [feedCard(rawCard(a))], more: true } },
      close: async () => { closed.push(n) } }
  } })
  t.after(feed.dispose)
  const first = await feed.action('homeFeed', { batch: 0 })
  const refresh = feed.action('feedRefresh', { generation: '' })
  await started.promise; await grant.save(() => ({ generation: 'other' })); result.reject(Error('Offline'))
  await assert.rejects(refresh, { code: 'ACCOUNT_CHANGED' })
  assert.deepEqual(closed, [2, 1])
  await assert.rejects(feed.action('feedNote', { run: first.run, id: a }), { code: 'FEED_EXPIRED' })
})

test('only the matching official detail and its ordered data are used; arbitrary links and HTML cannot become media', async () => {
  assert.deepEqual(initialState('<script>window.__INITIAL_STATE__={"a":"undefined","b":undefined};</script>'), { a: 'undefined', b: null })
  assert.equal(feedCard({ ...rawCard(a), xsec_token: '', href: 'https://attacker.test/explore/' + a }), null)
  assert.equal(detailNote({ note_id: b }, a), null)
  assert.equal(mediaUrl('https://xhscdn.com.evil.test/x'), null)
  assert.equal(mediaUrl('https://x.xhscdn.com@evil.test/x'), null)
  assert.equal(detailNote({ noteId: a, type: 'video', video: { mediaV2: { stream: { h264: [{ masterUrl: cdn }] } } } }, a).video, cdn)
  assert.equal(detailNote({ note_id: a, type: 'video', video: { media: { stream: {
    EF5: [{ master_url: cdn + 'other', video_codec: 'hevc' }], EF4: [{ master_url: cdn, video_codec: 'h264' }],
  } } } }, a).video, cdn)
  assert.deepEqual(commentPage({ has_more: true, cursor: 'next', comments: [{ id: '1', user_info: { nickname: '作者' }, content: '内容' }] }),
    { items: [{ id: '1', author: '作者', text: '内容' }], more: true, cursor: 'next' })
  const req = new Request('http://localhost/media', { headers: { range: 'bytes=48-' } })
  const res = await readAttachment(cdn, 'video', req, async (url, options) => {
    assert.equal(url, cdn); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error')
    assert.equal(options.headers.Range, 'bytes=48-2097199')
    return new Response(new Uint8Array([1, 2]), { status: 206, headers: { 'content-range': 'bytes 48-49/50', 'content-type': 'video/mp4', 'content-length': '2' } })
  })
  assert.equal(res.status, 206); assert.equal(res.headers.get('content-range'), 'bytes 48-49/50')
  assert.match(res.headers.get('cache-control'), /no-store/)
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [1, 2])
  const bad = await readAttachment(cdn, 'image', new Request('http://localhost'), async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }))
  assert.equal(bad.status, 502)
})

test('a late note cannot reopen attachments; changing windows, changing notes and returning to the index keep images closed', async () => {
  const pending = Promise.withResolvers(), positions = [], opened = []
  const source = excerptStore(async (action, body) => {
    if (action === 'feedStatus') return { generation: '' }
    if (action === 'homeFeed') return { run: 'test', batch: 0, items: [a, b].map(id => ({ id })), more: false, generation: '' }
    if (action === 'feedNote') { opened.push(body.id); return body.id === a ? pending.promise : { id: b, type: 'normal', images: [1, 2] } }
  })
  await source.load()
  source.onRestore((anchor, focus) => positions.push([anchor.id, anchor.offset, focus]))
  source.remember(a, -34); const late = source.select(a)
  source.remember(b, 52); await source.select(b)
  assert.equal(source.snapshot().media, false)
  source.reveal(); source.step(1); source.step(1)
  assert.equal(source.snapshot().index, 1)
  assert.deepEqual(opened, [a, b])
  source.conceal(); assert.equal(source.snapshot().media, false)
  source.reveal(); source.close()
  pending.resolve({ id: a, type: 'normal', images: [1, 2] }); await late
  assert.equal(source.snapshot().note, null); assert.equal(source.snapshot().media, false)
  assert.deepEqual(positions, [[b, 52, true]])
  assert.equal(source.snapshot().rows.length, 2)
})
