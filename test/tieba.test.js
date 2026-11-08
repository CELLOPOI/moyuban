import assert from 'node:assert/strict'
import test from 'node:test'
import { readingActions } from '../src/host/actions.js'
import { siteRegistry } from '../src/host/sites.js'
import { entry, entryForSite, boardForSession } from '../src/shared/boards.js'
import { tiebaSite } from '../src/sites/tieba/index.js'
import { forum } from '../src/sites/tieba/forum.js'

test('a 320036 thread opens the same page anonymously through the posts API and retains floor authors and pictures', async () => {
  const id = 11177792222, board = forum('明日方舟'), picture = 'https://tiebapic.baidu.com/forum/pic/item/abc.jpg'
  let resultForum = board.id, webCode = 320036, requested = 0
  const site = tiebaSite(async (url, options) => {
    assert.equal(options.credentials, 'omit'); assert.equal(options.headers?.Cookie, undefined)
    if (url.pathname === '/mg/p/getPbData') {
      assert.equal(url.searchParams.get('kz'), String(id)); assert.equal(url.searchParams.get('pn'), '2')
      return Response.json({ errno: webCode, errmsg: '网页暂不支持' })
    }
    requested++
    assert.equal(url.origin + url.pathname, 'https://tieba.baidu.com/c/f/pb/page'); assert.equal(options.method, 'POST')
    assert.equal(options.body.get('kz'), String(id)); assert.equal(options.body.get('pn'), '2')
    assert.match(options.body.get('sign'), /^[A-F0-9]{32}$/)
    return Response.json({ error_code: 0, thread: { id, title: '读帖测试' }, forum: { name: resultForum },
      page: { current_page: 2, total_page: 3 }, user_list: [{ id: '9', name_show: '甲' }],
      post_list: [{ id: '123456789000', floor: '32', author_id: 9, sub_post_number: 1, content: [
        { type: 0, text: '正文' }, { type: 3, origin_src: picture },
      ] }] })
  })
  const args = { id, board, page: 2 }, result = await site.thread(args)
  assert.equal(result.pages, 3); assert.equal(result.posts[0].floor, 32); assert.equal(result.posts[0].author, '甲')
  assert.deepEqual(result.posts[0].blocks, [{ kind: 'text', text: '正文' }, { kind: 'image', url: picture }])
  resultForum = '其他'; await assert.rejects(site.thread(args), { code: 'TIEBA_RESPONSE' })
  webCode = 123; await assert.rejects(site.thread(args), { code: 'TIEBA_ACCESS' }); assert.equal(requested, 2)
})

test('Tieba reads a bar, preserves missing floor numbers and paginates subreplies independently', async () => {
  const page = (current_page, total_page) => ({ current_page, total_page, has_more: Number(current_page < total_page) })
  const forum = { id: 3171, name: 'linux' }, calls = []
  const tieba = tiebaSite(async (url, options) => {
    assert.equal(url.origin, 'https://tieba.baidu.com')
    assert.equal(options.credentials, 'omit')
    const q = Object.fromEntries(url.searchParams); calls.push([url.pathname, q])
    if (url.pathname === '/mg/f/getFrsData') {
      if (q.kw === 'linux吧') return Response.json({ errno: 340000, errmsg: '该吧还未建立' })
      return Response.json({ errno: 0, data: { forum, page: page(Number(q.pn), 3),
        thread_list: [{ tid: 42, title: '一个 &amp; 两个', author: { name_show: '吧友' } }, { tid: 42 }] } })
    }
    if (url.pathname === '/mg/p/getPbData') return Response.json({ errno: 0, data: { forum, page: page(2, 3), thread: { id: 42 },
      post_list: [{ id: 107, floor: 39, title: '回复：一个 &amp; 两个', sub_post_number: 12, author: { name: '某某' }, content: [
        { type: 0, text: '甲<br/>乙' }, { type: 2, c: '滑稽', src: 'https://tb2.bdstatic.com/tb/editor/images/face/i_f25.png' },
        { type: 3, origin_src: '307106', src: 'http://tiebapic.baidu.com/forum/pic/item/123.jpg' },
        { type: 1, text: '链接', link: 'javascript:alert(1)' },
      ] }, { id: 109, floor: 41, content: [{ type: 0, text: '下一楼' }] }] } })
    assert.equal(url.pathname, '/mo/q/flr'); assert.deepEqual(q, { kz: '42', pid: '107', pnum: '2' })
    return Response.json({ no: 0, data: { page: page(2, 2), total_num: 1,
      floor_html: '<li pid="113" class="list_item_floor"><a class="user_name">甲：</a><span class="floor_content">回复 <a href="/home/main?un=b">乙</a>：好<br/>收到<script>bad()</script></span></li>' } })
  })
  const sites = siteRegistry({ readRecord() { assert.fail('Tieba should not read credentials') } }, [tieba])
  const run = readingActions(sites), lookup = query => run('findBoards', { site: 'tieba', query })
  const { board } = await lookup('linux吧')
  assert.equal(board.sessionId, (await lookup('https://tieba.baidu.com/f?kw=LINUX')).board.sessionId)
  assert.deepEqual(boardForSession(board.sessionId).id, 'linux')
  const fields = { site: 'tieba', board: board.sessionId, mode: 'live', page: 2 }
  const list = await run('topics', fields)
  assert.deepEqual(list, { page: 2, hasNext: true, items: [{ id: 42, title: '一个 & 两个', author: '吧友' }] })
  const thread = await run('thread', { ...fields, id: 42 })
  assert.equal(thread.title, '一个 & 两个'); assert.deepEqual(thread.posts.map(p => p.floor), [39, 41])
  const post = thread.posts[0]
  assert.equal(post.replyCount, 12); assert.equal(post.blocks[0].text, '甲\n乙〔滑稽〕')
  assert.match(post.blocks[0].runs[1].smile, /i_f25/); assert.equal(post.blocks[1].url, 'https://tiebapic.baidu.com/forum/pic/item/123.jpg')
  assert.equal(post.blocks[2].text, '链接'); assert.equal(post.blocks[2].runs, undefined)
  const replies = await run('replies', { ...fields, id: 42, postId: post.id })
  assert.equal(replies.pages, 2); assert.equal(replies.items[0].author, '甲')
  assert.equal(replies.items[0].blocks[0].text, '回复 乙：好\n收到')
  assert.equal(replies.items[0].blocks[0].runs.find(run => run.href).href, 'https://tieba.baidu.com/home/main?un=b')
  const n = calls.length
  for (const query of ['https://example.org/f?kw=linux', 'https://tieba.baidu.com/p/42']) await assert.rejects(lookup(query), { code: 'INVALID_INPUT' })
  await assert.rejects(run('reply', fields), { code: 'UNSUPPORTED' })
  assert.equal(sites.get('tieba').info.capabilities.followed, true)
  assert.equal(sites.get('tieba').info.capabilities.favorites, false)
  await assert.rejects(run('topics', { ...fields, mode: 'example' }), { code: 'UNSUPPORTED' })
  assert.equal(calls.length, n)
  assert.equal(tieba.imageUrl('https://tiebapic.baidu.com.evil.test/forum/pic/item/123.jpg'), null)
})

test('workspace directory sessions are site-bound; verification and unknown bars cannot become empty lists', async () => {
  assert.deepEqual(boardForSession(entry.sessionId), entry)
  const tbEntry = entryForSite('tieba')
  assert.notEqual(tbEntry.sessionId, entry.sessionId)
  assert.deepEqual(boardForSession(tbEntry.sessionId), tbEntry)
  const tieba = tiebaSite(async url => {
    const kw = url.searchParams.get('kw')
    if (kw === '验证') return new Response('<html><head><title>百度安全验证</title></head></html>')
    if (kw === '无效响应') return new Response('<html>暂不可用</html>')
    if (kw === '空吧') return Response.json({ errno: 0, data: { forum: { name: kw }, thread_list: [],
      page: { current_page: 1, total_page: 0, total_num: 0 } } })
    return Response.json({ errno: 340000 })
  })
  const sites = siteRegistry({}, [tieba])
  assert.throws(() => sites.forRequest({ site: 'tieba', board: entry.sessionId }), { code: 'INVALID_INPUT' })
  await assert.rejects(tieba.parseBoard('验证'), { code: 'TIEBA_RESTRICTED', message: /安全验证/ })
  await assert.rejects(tieba.parseBoard('无效响应'), { code: 'TIEBA_RESPONSE' })
  await assert.rejects(tieba.parseBoard('不存在'), { code: 'BOARD_NOT_FOUND' })
  assert.deepEqual(await tieba.list({ board: forum('空吧'), page: 1 }), { page: 1, hasNext: false, items: [] })
})
