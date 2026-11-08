import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from 'playwright-core'
import { openSource, restoreLoginCookies } from '../src/sites/xhs/browser.js'
import { createFeed } from '../src/sites/xhs/feed.js'
import { origin } from '../src/sites/xhs/content.js'

const id = '1234567890abcdef12345678'
const card = '<section class="note-item"><a class="cover" href="/explore/' + id + '?xsec_token=fixture"></a><b class="title">可读条目</b></section>'
const pageWith = (body, feeds = []) => '<!doctype html><meta charset="utf-8"><script>window.__INITIAL_STATE__=' +
  JSON.stringify({ user: { loggedIn: true }, feed: { feeds } }) + '</script>' + body

test('first load and refresh recover usable home data and distinguish site refusals', { timeout: 35000 }, async t => {
  let browser
  for (const channel of ['chrome', 'msedge', undefined]) {
    try { browser = await chromium.launch({ channel, headless: true, timeout: 6000,
      args: ['--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND'] }); break } catch {}
  }
  if (!browser) return t.skip('A local Chromium browser is needed for the offline home fixture')
  t.after(() => browser.close())
  await t.test('one rejected auxiliary cookie does not discard a valid saved session or widen its scope', async () => {
    const ctx = await browser.newContext(), empty = await browser.newContext()
    const base = { domain: '.xiaohongshu.com', path: '/', secure: true, sameSite: 'Lax' }
    const saved = [{ ...base, name: 'web_session', value: 'fixture-session', httpOnly: true, expires: -1 },
      { ...base, name: 'scoped', value: 'fixture-scoped', path: '/only' }, { ...base, name: 'invalid', value: 'x', sameSite: 'unspecified' },
      { ...base, name: 'foreign', value: 'x', domain: 'other.invalid' }]
    try {
      await restoreLoginCookies(ctx, saved)
      assert.deepEqual((await ctx.cookies(origin + '/explore')).map(c => c.name), ['web_session'])
      assert.deepEqual((await ctx.cookies(origin + '/only')).map(c => c.name).sort(), ['scoped', 'web_session'])
      assert.deepEqual(await ctx.cookies('https://other.invalid'), [])
      await assert.rejects(restoreLoginCookies(empty, [{ ...saved[0], expires: 1 }]), { code: 'LOGIN_REQUIRED' })
      await assert.rejects(restoreLoginCookies(empty, [{ ...saved[0], sameSite: 'unspecified' }]), { code: 'LOGIN_REQUIRED' })
      await assert.rejects(restoreLoginCookies(empty, [{ ...saved[0], path: '/only' }]), { code: 'LOGIN_REQUIRED' })
    } finally { await Promise.all([ctx.close(), empty.close()]) }
  })
  let mode = 'missing-body', opened = 0, closed = 0
  const savedGrant = { generation: 'test', cookies: [{ name: 'web_session', value: 'fixture-session', domain: '.xiaohongshu.com',
    path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }] }
  const source = grant => openSource(grant, async () => {
    const ctx = await browser.newContext({ serviceWorkers: 'block' }), page = await ctx.newPage()
    opened++
    const scenario = mode
    // Chrome 回收文档响应体后，已挂载的卡片和页面发出的推荐请求仍然可用。
    if (scenario === 'missing-body') {
      const go = page.goto.bind(page)
      page.goto = async (...args) => {
        const response = await go(...args)
        response.text = async () => { throw Error('Protocol error (Network.getResponseBody): No resource with given identifier found') }
        return response
      }
    }
    await page.route('**/*', async route => {
      const u = new URL(route.request().url())
      if (u.origin !== origin) return route.abort()
      if (!(await route.request().headerValue('cookie'))?.includes('web_session=fixture-session')) {
        return route.fulfill({ status: 401, body: 'Missing test session' })
      }
      if (scenario === 'offline') return route.abort('namenotresolved')
      if (u.pathname === '/deferred.js') return
      if (u.pathname === '/api/sns/web/v1/homefeed') return route.fulfill({ json: { code: 0, data: {
        items: scenario === 'api-before-dom-ready' ? [{ id, xsec_token: 'fixture', note_card: { display_title: '接口中的条目' } }] : [], has_more: false,
      } } })
      if (u.pathname === '/login') return route.fulfill({ contentType: 'text/html', body: pageWith(card) })
      if (u.pathname !== '/explore') return route.abort()
      if (scenario === 'login') return route.fulfill({ contentType: 'text/html', body: '<script>location.replace("/login")</script>' })
      if (scenario === 'unauthorized') return route.fulfill({ status: 401, contentType: 'text/html', body: pageWith(card) })
      if (scenario === 'limited') return route.fulfill({ status: 429, contentType: 'text/html', body: pageWith(card) })
      let html = pageWith(card, scenario === 'invalid-ssr' ? {} : [])
      if (scenario === 'late-cards') html = pageWith('<main></main><script>fetch("/api/sns/web/v1/homefeed").then(() => setTimeout(() => document.querySelector("main").innerHTML=' + JSON.stringify(card) + ', 180))</script>')
      if (scenario === 'api-before-dom-ready') html = pageWith('<script>fetch("/api/sns/web/v1/homefeed")</script><script defer src="/deferred.js"></script>')
      if (scenario === 'expired-session') html = pageWith(card).replace('"loggedIn":true', '"loggedIn":false')
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html })
    })
    return { browser: { close: async () => { closed++; await ctx.close() } }, context: ctx, page }
  })
  const feed = createFeed({ read: async () => savedGrant }, { source })
  t.after(feed.dispose)
  await t.test('a missing response body does not discard live cards', async () => {
    assert.deepEqual((await feed.action('homeFeed', { batch: 0 })).items.map(x => x.id), [id])
  })
  for (const scenario of ['invalid-ssr', 'late-cards', 'api-before-dom-ready']) await t.test('refresh reads valid cards: ' + scenario, async () => {
    mode = scenario
    assert.deepEqual((await feed.action('feedRefresh', { generation: 'test' })).items.map(x => x.id), [id])
  })
  for (const [scenario, code] of [['offline', 'HOME_NETWORK'], ['login', 'LOGIN_REQUIRED'], ['unauthorized', 'LOGIN_REQUIRED'],
    ['expired-session', 'LOGIN_REQUIRED'], ['limited', 'SOURCE_RATE_LIMITED']]) {
    await t.test(scenario + ' reports ' + code + ' and keeps the prior run', async () => {
      mode = 'missing-body'
      const prior = await feed.action('homeFeed', { batch: 0 })
      mode = scenario
      await assert.rejects(feed.action('feedRefresh', { run: prior.run, generation: 'test' }), { code })
      assert.equal((await feed.action('homeFeed', { batch: 0 })).run, prior.run)
      assert.equal(opened - closed, 1)
    })
  }
})

test('retry after a failed first load uses a fresh browser; an empty refresh cannot retire a readable index', async t => {
  let opened = 0, closed = 0
  const feed = createFeed({ read: async () => null }, { source: async () => {
    const n = ++opened
    return { home: async () => {
      if (n === 1) throw Error('Browser closed')
      return { items: n === 2 ? [{ id, title: '原条目' }] : [], more: false }
    }, close: async () => { closed++ } }
  } })
  t.after(feed.dispose)
  await assert.rejects(feed.action('homeFeed', { batch: 0 }))
  assert.equal(closed, 1)
  const second = await feed.action('homeFeed', { batch: 0 })
  await assert.rejects(feed.action('feedRefresh', { run: second.run, generation: '' }), { code: 'HOME_EMPTY' })
  assert.equal((await feed.action('homeFeed', { batch: 0 })).run, second.run)
  assert.equal(closed, 2)
})
