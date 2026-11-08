import assert from 'node:assert/strict'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { openSource } from '../src/sites/xhs/browser.js'
import { feedCard, origin, preferCardLink } from '../src/sites/xhs/content.js'
import { responseError } from '../src/sites/xhs/detail.js'
import { createFeed } from '../src/sites/xhs/feed.js'

const id = n => n.toString(16).padStart(24, '0')
const path = n => '/explore/' + id(n)
const domLink = n => n === 1 ? path(n) : path(n) + '?from=original%2Bcard&xsec_token=fixture-' + n + '&xsec_source=index'
const row = n => ({ id: id(n), xsec_token: 'fixture-' + n, note_card: { display_title: '索引 ' + n } })

test('an unexplained business error is not reported as a deleted note or an access restriction', () => {
  assert.equal(responseError(200, { code: 4001, msg: '系统繁忙' }, true).code, 'SOURCE_UNAVAILABLE')
  assert.equal(responseError(200, { code: 300012 }, true).code, 'SOURCE_RESTRICTED')
})
const attachment = n => 'https://fixture.xhscdn.com/' + n

test('a placeholder or foreign card link cannot replace an original signed link', () => {
  const card = feedCard({ ...row(1), href: path(1) })
  assert.equal(new URL(card.href).searchParams.get('xsec_token'), 'fixture-1')
  const full = origin + domLink(2)
  assert.equal(preferCardLink(card.href, full, id(1)), card.href)
  assert.equal(preferCardLink(full, path(2), id(2)), full)
  assert.equal(preferCardLink(full, 'https://example.org' + domLink(2), id(2)), full)
})

const groups = Array.from({ length: 5 }, (_, i) => Array.from({ length: i ? 30 : 28 }, (_, j) => (i ? 28 + (i - 1) * 30 : 0) + j + 1))
function homeDocument() {
  return `<!doctype html><meta charset="utf-8"><main></main>
<script>window.__INITIAL_STATE__=${JSON.stringify({ feed: { feeds: groups[0].map(row) } })}</script>
<script>
const groups=${JSON.stringify(groups)}, id=${id.toString()}, path=${path.toString()}, domLink=${domLink.toString()}, attachment=${attachment.toString()};
let batch=0, busy=false;
function render() {
  document.querySelector('main').innerHTML=groups[batch].map(n=>'<section class="note-item"><a class="cover" data-n="'+n+'" href="'+domLink(n)+'">正文</a><b class="title">索引 '+n+'</b></section>').join('');
}
render();
addEventListener('wheel', async () => {
  if(busy || batch + 1 >= groups.length || location.pathname !== '/explore') return;
  busy=true;await fetch('/api/sns/web/v1/homefeed',{method:'POST',body:JSON.stringify({batch:batch+1})});batch++;render();busy=false;
});
addEventListener('keydown', e=>{ if(e.key==='Escape' && location.pathname.startsWith('/explore/')) {
  document.querySelector('#noteContainer')?.remove();history.replaceState({},'', '/explore');
}});
function requestNote(n) {return fetch('/api/sns/web/v1/feed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source_note_id:id(n)})})}
function surface(html) {const el=document.createElement('div');el.id='noteContainer';el.innerHTML=html;document.body.append(el);return el}
function slide(i,duplicate=false) {return '<div class="swiper-slide'+(duplicate?' swiper-slide-duplicate':'')+'" data-swiper-slide-index="'+i+'"><img src="'+attachment(i)+'"></div>'}
document.addEventListener('click', e=>{
  const a=e.target.closest('a.cover');if(!a)return;const n=Number(a.dataset.n);
  if(n<138 || n>146)return;
  e.preventDefault();history.pushState({},'',a.href);
  if(n===141 || n===146) {
    const el=surface('<div id="detail-title">当前正文标题</div><div id="detail-desc">'+(n===146?'别篇正文':'官网显示的正文')+'</div>');
    if(n===146)el.dataset.noteId=id(1);
  } else if(n===142) {
    surface('<div class="swiper-wrapper">'+slide(0)+'</div>');requestNote(2).then(()=>requestNote(n));
  } else if(n===145) {
    surface('<div class="swiper-wrapper">'+slide(2,true)+slide(1)+slide(2)+slide(0)+'</div>');
  } else if(n===138) {surface('<video src="'+attachment('video')+'"></video>')}
  else requestNote(n);
});
</script>`
}
const article = n => ({ noteId: id(n), title: '详情 ' + n, desc: '同编号正文 ' + n, type: 'normal' })

test('real browser reads five virtualized batches, active note pages, and source refusals', { timeout: 60_000 }, async t => {
  let browser
  for (const channel of ['chrome', 'msedge', undefined]) {
    try { browser = await chromium.launch({ channel, headless: true, timeout: 6000 }); break } catch {}
  }
  if (!browser) return t.skip('A local Chromium browser is needed for the offline page fixture')
  t.after(() => browser.close())
  const context = await browser.newContext({ locale: 'zh-CN', serviceWorkers: 'block' }), page = await context.newPage()
  const source = await openSource(null, async () => ({ browser, context, page }))
  const documents = [], denied = new Set([143])
  // 所有请求都在这个新上下文内截获；合成的原站页面不访问网络或账号。
  await context.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url())
    const html = (body, status = 200) => route.fulfill({ status, contentType: 'text/html; charset=utf-8', body })
    const json = body => route.fulfill({ json: body })
    if (u.origin !== origin) return route.abort()
    if (u.pathname === '/explore') return html(homeDocument())
    if (u.pathname.endsWith('/homefeed')) {
      const { batch } = req.postDataJSON()
      return json({ code: 0, data: { items: groups[batch].map(row), has_more: batch < groups.length - 1 } })
    }
    if (u.pathname.endsWith('/feed')) {
      const n = parseInt(req.postDataJSON().source_note_id, 16)
      if (denied.has(n) || n === 2) return json({ code: 4001, success: false, msg: '该笔记已被作者删除' })
      if (n === 144) return route.fulfill({ status: 429, body: 'Too many requests' })
      const note = article(n)
      if (n === 142) {
        await delay(600)
        note.imageList = [0, 1, 2, 3].map(i => ({ url: attachment(i) }))
      }
      if (n === 139) note.type = 'video'
      return json({ code: 0, data: { items: [{ id: id(n), note_card: note }] } })
    }
    if (u.pathname === '/website-login/error') return html('<p>安全验证</p>')
    if (!u.pathname.startsWith('/explore/')) return route.abort()
    const n = parseInt(u.pathname.split('/').pop(), 16)
    documents.push(n)
    if (n === 147) return route.fulfill({ status: 302, headers: { location: '/website-login/error?error_code=300012' } })
    if (n === 148) return html('<p>这篇笔记当前无法查看</p>', 404)
    if (n === 139) return html('<p>视频暂不可用</p>', 403)
    if (n === 45 && req.url() !== origin + domLink(n)) return html('<p>没有原卡访问上下文</p>', 403)
    if (n === 1 && u.searchParams.get('xsec_token') !== 'fixture-1') return html('<p>没有原卡访问上下文</p>', 403)
    if (n === 45) return html('<meta charset="utf-8"><div id="noteContainer"><div id="detail-desc">已回收卡片的正文</div></div>')
    return html('<script>window.__INITIAL_STATE__=' + JSON.stringify({ note: { noteDetailMap: { [id(n)]: { note: article(n) } } } }) + '</script>')
  })
  const feed = createFeed({ read: async () => null }, { source: async () => source })
  t.after(() => feed.dispose())
  const first = await feed.action('homeFeed', { batch: 0 }), fields = { run: first.run }
  const open = n => feed.action('feedNote', { ...fields, id: id(n) })
  const seen = new Set(first.items.map(c => c.id))
  for (let batch = 1; batch < 4; batch++) {
    const chunk = await feed.action('homeFeed', { ...fields, batch })
    for (const card of chunk.items) seen.add(card.id)
  }
  assert.equal(await page.locator('a[data-n="45"]').count(), 0)
  assert.equal((await open(45)).body, '已回收卡片的正文')
  assert.equal((await open(1)).body, '同编号正文 1')
  const last = await feed.action('homeFeed', { ...fields, batch: 4 })
  for (const card of last.items) seen.add(card.id)
  assert.equal(seen.size, 148)
  assert.equal(last.more, false)
  assert.equal((await open(140)).body, '同编号正文 140')
  assert.equal((await open(141)).body, '官网显示的正文')
  const complete = await open(142)
  assert.equal(complete.body, '同编号正文 142')
  assert.equal(complete.images.length, 4)
  assert.equal(await feed.attachment({ ...fields, id: id(142) }, 'image', '3'), attachment(3))
  await assert.rejects(open(143), { code: 'NOTE_UNAVAILABLE', status: 404 })
  denied.delete(143)
  assert.equal((await open(143)).body, '同编号正文 143')
  await assert.rejects(open(144), { code: 'SOURCE_RATE_LIMITED', status: 429 })
  const gallery = await open(145)
  assert.equal(gallery.body, '')
  assert.equal(gallery.images.length, 3)
  for (const i of [0, 1, 2]) assert.equal(await feed.attachment({ ...fields, id: id(145) }, 'image', String(i)), attachment(i))
  const player = await open(138)
  assert.equal(player.type, 'video')
  assert.equal(player.video, true)
  assert.equal(await feed.attachment({ ...fields, id: id(138) }, 'video', '0'), attachment('video'))
  assert.deepEqual(documents, [45, 1])
  assert.equal((await open(146)).body, '同编号正文 146')
  assert.deepEqual(documents, [45, 1, 146])
  assert.equal((await open(139)).body, '同编号正文 139')
  await assert.rejects(open(147), { code: 'SOURCE_RESTRICTED' })
  await assert.rejects(open(148), { code: 'NOTE_UNAVAILABLE', status: 404 })
})
