import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { followedDirectory } from '../src/client/followed.js'
import { siteRegistry } from '../src/host/sites.js'
import { readingActions } from '../src/host/actions.js'
import { boardLibrary } from '../src/host/board-library.js'
import { readerSettings } from '../src/host/settings.js'
import { tiebaSite } from '../src/sites/tieba/index.js'
import { followedBoards } from '../src/sites/tieba/follows.js'
import { baiduSession } from '../src/sites/tieba/session.js'

test('Passport QR exchange uses DSH credentials; paged follows stay separate from manual sessions and stale grants', async t => {
  const home = await mkdtemp(join(tmpdir(), 'tieba-account-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  let record = null, user = '11', status = 'waiting', follows = 'offline', hold
  let credentialReads = 0
  const key = 'dsh-nga-reader/tieba-account', calls = []
  const credentials = {
    readRecord(k) { assert.equal(k, key); credentialReads++; return record },
    modifyRecord(k, fn) { assert.equal(k, key); record = fn(record) },
    deleteRecord(k) { assert.equal(k, key); record = null },
  }
  const settings = readerSettings(home)
  const sites = siteRegistry(credentials, [tiebaSite(async (url, options) => {
    const path = url.pathname
    calls.push(path)
    assert.equal(options.redirect, ['/mg/o/getForumHome', '/f/like/mylike'].includes(path) ? 'manual' : 'error')
    assert.ok(!options.method || options.method === 'GET')
    function jsonp(data, headers) { return new Response('bd_reader(' + JSON.stringify(data) + ')', { headers }) }
    if (url.origin === 'https://passport.baidu.com') {
      if (path === '/v2/api/getqrcode') return jsonp({ errno: 0, sign: 'sign', imgurl: 'passport.baidu.com/v2/api/qrcode?sign=sign' },
        { 'Set-Cookie': 'passportOnly=private; Path=/; Secure' })
      assert.match(options.headers.Cookie, /passportOnly=private/)
      if (path === '/v2/api/qrcode') return new Response(Buffer.from('89504e470d0a1a0a', 'hex'))
      if (path === '/channel/unicast') return jsonp(status === 'waiting' ? { errno: 1 } :
        { errno: 0, channel_v: JSON.stringify({ status: status === 'scanned' ? 1 : 0, v: 'exchange-only' }) })
      assert.equal(path, '/v3/login/main/qrbdusslogin')
      assert.equal(url.searchParams.get('bduss'), 'exchange-only')
      const data = user === '11' ? { user: { userId: '11', displayName: '账号11' } } : {}
      return jsonp({ errInfo: { no: status === 'refused' ? '1' : '0' }, data },
        status === 'no-grant' ? {} : { 'Set-Cookie': 'BDUSS=test-' + user + '; Domain=.baidu.com; Path=/; Secure; HttpOnly' })
    }
    assert.equal(url.origin, 'https://tieba.baidu.com')
    if (path === '/mg/f/getFrsData') {
      assert.equal(options.headers?.Cookie, undefined)
      return Response.json({ errno: 0, data: { forum: { name: url.searchParams.get('kw') } } })
    }
    const id = /^BDUSS=test-(\d+)$/.exec(options.headers.Cookie)?.[1]
    assert.ok(id)
    if (path === '/f/user/json_userinfo' || follows === 'offline') throw new TypeError('fetch failed')
    if (path === '/f/like/mylike') {
      assert.equal(follows, 'expired')
      return new Response('<script>var Tbs = null;</script>')
    }
    assert.equal(path, '/mg/o/getForumHome')
    if (follows === 'expired') return Response.json({ errno: 0, data: { user_info: { is_login: 0 }, recomm_forum: ['推荐吧'] } })
    if (hold) { hold.started(); await hold.release }
    const first = url.searchParams.get('pn') === '1'
    const name = id === '22' ? '摄影' : first ? 'Arknights' : '高达模型'
    return Response.json({ errno: 0, data: { user_info: { is_login: 1 }, recomm_forum: [{ forum_name: '推荐吧' }],
      like_forum: { list: [{ forum_name: name }], page: { cur_page: first ? 1 : 2, total_page: id === '11' ? 2 : 1 } } } })
  })], settings.read, home)
  const run = readingActions(sites)
  const call = (action, fields) => run(action, { site: 'tieba', ...fields })
  const library = boardLibrary(boards => ({ boards, sessionId: boards[0].sessionId }), sites, () => [], settings)
  const workspace = () => library('workspace', { site: 'tieba' })
  await workspace()
  const manual = await call('boardDirectory')
  assert.equal(manual.categories[0].kind, 'followed')
  assert.deepEqual(calls, [])
  assert.equal(credentialReads, 0)
  await assert.rejects(call('followedBoards'), { code: 'LOGIN_REQUIRED' })
  let ticket = await call('login')
  assert.deepEqual(Object.keys(ticket).sort(), ['expiresAt', 'id', 'image'])
  assert.equal((await call('poll', { id: ticket.id })).state, 'pending')
  status = 'scanned'
  assert.equal((await call('poll', { id: ticket.id })).state, 'scanned')
  assert.equal(record, null)
  status = 'confirmed'
  const [confirmed] = await Promise.all([call('poll', { id: ticket.id }), call('poll', { id: ticket.id })])
  assert.deepEqual(confirmed, { state: 'connected', name: '账号11' })
  assert.ok(calls.every(p => !p.startsWith('/f/')))
  assert.equal(calls.filter(p => p === '/v3/login/main/qrbdusslogin').length, 1)
  assert.deepEqual(record.payload.sessionCookies, [{ name: 'BDUSS', value: 'test-11', domain: 'baidu.com', path: '/' }])
  const a = await call('account')
  assert.ok(!JSON.stringify(a).includes('test-11'))
  await assert.rejects(call('followedBoards', { generation: a.generation }), { code: 'TIEBA_ACCESS' })
  assert.deepEqual(await call('account'), a)
  follows = 'online'
  const first = await call('followedBoards', { generation: a.generation })
  assert.equal(calls.filter(p => p === '/v2/api/getqrcode').length, 1)
  assert.ok(!calls.includes('/f/user/json_userinfo'))
  assert.deepEqual(first.boards.map(b => b.name), ['Arknights吧', '高达模型吧'])
  assert.deepEqual((await workspace()).favorites, [])
  assert.equal((await workspace()).boards[0].kind, undefined)
  const disk = await readdir((await settings.read()).boardPath)
  assert.ok(!disk.some(file => file.startsWith('favorites-')))
  const picked = first.boards[0]
  const selected = await library('openBoard', { site: 'tieba', board: picked.sessionId, generation: a.generation })
  assert.deepEqual(selected.manual, [picked.sessionId]); assert.equal(selected.promoted, picked.sessionId)
  const started = Promise.withResolvers(), gate = Promise.withResolvers()
  hold = { started: started.resolve, release: gate.promise }
  const stale = call('followedBoards', { generation: a.generation })
  await started.promise
  await call('logout'); assert.equal(record, null)
  user = '22'; ticket = await call('login'); await call('poll', { id: ticket.id })
  hold = null; gate.resolve()
  await assert.rejects(stale, { code: 'ACCOUNT_CHANGED' })
  await assert.rejects(library('openBoard', { site: 'tieba', board: first.boards[1].sessionId, generation: a.generation }), { code: 'ACCOUNT_CHANGED' })
  const b = await call('account')
  assert.equal(b.name, '百度用户'); assert.notEqual(b.generation, a.generation)
  assert.deepEqual((await call('followedBoards', { generation: b.generation })).boards.map(b => b.name), ['摄影吧'])
  assert.deepEqual((await workspace()).manual, [picked.sessionId])
  assert.equal((await call('boardDirectory')).revision, manual.revision)
  follows = 'expired'
  await assert.rejects(call('followedBoards', { generation: b.generation }), { code: 'LOGIN_REQUIRED' })
  await call('logout')
  for (const [state, code] of [['refused', 'TIEBA_LOGIN'], ['no-grant', 'LOGIN_REQUIRED']]) {
    status = state; ticket = await call('login')
    await assert.rejects(call('poll', { id: ticket.id }), { code })
    assert.equal(record, null)
  }
  ticket = await call('login'); await call('cancelLogin', { id: ticket.id })
  await assert.rejects(call('poll', { id: ticket.id }), { code: 'LOGIN_EXPIRED' })
  assert.equal(record, null)
})

test('Passport and Tieba receive their own tokens during the redirect exchange; the next sync uses the saved site token', async () => {
  const passport = 'https://passport.baidu.com', tieba = 'https://tieba.baidu.com'
  const issued = new Headers()
  for (const cookie of ['BDUSS=shared; Domain=.baidu.com', 'PTOKEN=private; Domain=passport.baidu.com',
    'STOKEN=passport-only; Domain=passport.baidu.com', 'temporary=unused']) issued.append('Set-Cookie', cookie + '; Path=/; Secure')
  const jar = baiduSession(); jar.receive(new URL('/v3/login/main/qrbdusslogin', passport), issued)
  let user = { generation: 'login-a', sessionCookies: jar.snapshot() }, saves = 0
  const account = { rememberSession: async (before, rows) => { assert.equal(before, user); user = { ...user, sessionCookies: rows }; saves++ } }
  const received = [], redirect = (location, cookie) => new Response(null, { status: 302, headers: {
    Location: location, ...(cookie && { 'Set-Cookie': cookie }) } })
  async function fetchPage(url, options) {
    const cookies = options.headers.Cookie, path = url.pathname
    received.push(url.hostname + path)
    if (url.origin === passport) {
      assert.equal(path, '/v3/login/api/auth/')
      assert.match(cookies, /STOKEN=passport-only/); assert.match(cookies, /PTOKEN=private/)
      assert.doesNotMatch(cookies, /temporary|site-only/)
      return redirect(tieba + '/f/like/mylike?errno=0&pn=1&stoken=site-ticket')
    }
    assert.equal(url.origin, tieba); assert.match(cookies, /BDUSS=shared/)
    assert.doesNotMatch(cookies, /PTOKEN|passport-only|temporary/)
    if (path === '/mg/o/getForumHome') {
      const data = cookies.includes('STOKEN=site-only') ? { user_info: { is_login: 1 },
        like_forum: { list: [{ forum_name: '模型' }], page: { cur_page: 1, total_page: 1 } } } : { user_info: { is_login: 0 } }
      return Response.json({ errno: 0, data })
    }
    assert.equal(path, '/f/like/mylike')
    if (url.searchParams.get('stoken') === 'site-ticket') return redirect(tieba + '/', 'STOKEN=site-only; Domain=tieba.baidu.com; Path=/; HttpOnly')
    if (!cookies.includes('STOKEN=site-only')) return redirect(passport + '/v3/login/api/auth/?tpl=tb&jump=1&u=' + encodeURIComponent(url),
      'STOKEN=deleted; Domain=tieba.baidu.com; Path=/; Max-Age=0')
    return new Response('<div class="forum_table"><table><tr><td><a href="/f?kw=x" title="模型"></a></td></tr></table></div>',
      { headers: { 'Content-Type': 'text/html;charset=utf-8' } })
  }
  assert.deepEqual((await followedBoards(user, fetchPage, account)).map(b => b.name), ['模型吧'])
  assert.equal(saves, 1); assert.equal(received.filter(p => p.startsWith('passport.')).length, 1)
  assert.ok(!JSON.stringify(user).includes('site-ticket'))
  received.length = 0
  assert.deepEqual((await followedBoards(user, fetchPage, account)).map(b => b.name), ['模型吧'])
  assert.deepEqual(received, ['tieba.baidu.com/mg/o/getForumHome']); assert.equal(saves, 1)
})

test('a Passport handoff only sends scoped credentials to the approved Tieba callback', async () => {
  const user = { cookies: { BDUSS: 'fixture', PTOKEN: 'passport-only' } }, hosts = []
  const fetchPage = (url, options) => {
    hosts.push(url.hostname)
    if (url.pathname.startsWith('/mg/')) return Response.json({ errno: 0, data: { user_info: { is_login: 0 } } })
    if (url.hostname === 'passport.baidu.com') {
      assert.match(options.headers.Cookie, /PTOKEN=passport-only/)
      return Response.redirect('https://untrusted.invalid/f/like/mylike?stoken=secret')
    }
    assert.doesNotMatch(options.headers.Cookie, /passport-only/)
    return Response.redirect('https://passport.baidu.com/v3/login/api/auth/?tpl=tb')
  }
  await assert.rejects(followedBoards(user, fetchPage), e => {
    assert.match(e.message, /未完成贴吧授权/); assert.doesNotMatch(e.message, /secret|untrusted/); return true
  })
  assert.deepEqual(hosts, ['tieba.baidu.com', 'tieba.baidu.com', 'passport.baidu.com'])
})

test('an unavailable second mobile page restarts the desktop list without mixing results or forwarding redirected credentials', async () => {
  const seen = [], user = { cookies: { BDUSS: 'fixture' } }
  const fetchPage = async (url, options) => {
    seen.push(url.pathname + '#' + url.searchParams.get('pn'))
    assert.equal(url.origin, 'https://tieba.baidu.com')
    assert.equal(options.headers.Cookie, 'BDUSS=fixture')
    assert.equal(options.redirect, 'manual')
    const page = Number(url.searchParams.get('pn'))
    if (url.pathname === '/mg/o/getForumHome') {
      if (page === 2) return Response.redirect('https://example.invalid/private?code=fixture-secret')
      return Response.json({ errno: 0, data: { user_info: { is_login: '1' }, like_forum: {
        list: [{ forum_name: '移动端旧结果' }], page: { cur_page: '1', total_page: '2' } } } })
    }
    if (url.pathname === '/f/like/mylike' && page === 1) return Response.redirect(url.origin + url.pathname + '/?pn=1')
    const name = page === 1 ? '甲' : '乙'
    const more = page === 1 ? '<a href="http://tieba.baidu.com/f/like/mylike?pn=2">下一页</a>' : ''
    return new Response('<div class="forum_table"><table><tr><td><a href="/f?kw=x" title="' + name + '"></a></td></tr></table></div>' + more,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
  assert.deepEqual((await followedBoards(user, fetchPage)).map(board => board.name), ['甲吧', '乙吧'])
  assert.deepEqual(seen, ['/mg/o/getForumHome#1', '/mg/o/getForumHome#2', '/f/like/mylike#1', '/f/like/mylike/#1', '/f/like/mylike#2'])
})

test('follow sync reports both safe failure reasons; recommendations, sign-in and security checks do not become empty follow lists', async () => {
  const user = { cookies: { BDUSS: 'fixture-secret' } }
  const network = () => { throw new TypeError('fixture-secret', { cause: Object.assign(new Error('fixture-secret'), { code: 'ECONNRESET' }) }) }
  const moved = () => Response.redirect('https://example.invalid/path?token=fixture-secret')
  await assert.rejects(followedBoards(user, url => url.pathname.startsWith('/mg/') ? moved() : network()), err => {
    assert.match(err.message, /移动版第 1 页.*HTTP 302.*网页版第 1 页.*ECONNRESET/)
    assert.doesNotMatch(err.message, /fixture-secret|example\.invalid/); return true
  })
  const names = await followedBoards(user, () => Response.json({ errno: 0, data: { user_info: { is_login: 1 },
    like_forum: { list: [], page: { cur_page: 0, total_page: 0 } }, recomm_forum: [{ forum_name: '推荐' }] } }))
  assert.deepEqual(names, [])
  const empty = () => new Response('<div class="forum_table"><table></table></div>')
  await assert.rejects(followedBoards(user, url => url.pathname.startsWith('/mg/') ?
    Response.json({ errno: 0, data: { user_info: { is_login: 0 }, recomm_forum: [{ forum_name: '推荐' }] } }) : empty()),
  { code: 'TIEBA_ACCESS' })
  let count = 0
  await assert.rejects(followedBoards(user, () => {
    count++
    return Response.redirect('https://wappass.baidu.com/static/captcha/verify?token=fixture-secret')
  }), { code: 'TIEBA_RESTRICTED' })
  assert.equal(count, 1)
})

test('switching accounts clears the preview before the next account or a late follow list arrives', async () => {
  let id = 'A'
  const stale = Promise.withResolvers(), started = Promise.withResolvers()
  const source = followedDirectory(async (action) => {
    if (action === 'account') return { connected: Boolean(id), generation: id, name: id }
    if (action === 'logout') { id = ''; return {} }
    if (id === 'A') { started.resolve(); return stale.promise }
    return { generation: id, boards: ['B-only'] }
  })
  const old = source.open(); await started.promise
  await source.logout(true, () => {})
  assert.equal(source.snapshot().phase, 'login'); assert.deepEqual(source.snapshot().boards, [])
  id = 'B'; await source.open(false)
  stale.resolve({ generation: 'A', boards: ['A-only'] }); await old
  assert.deepEqual(source.snapshot().boards, ['B-only'])
  id = ''; await source.check()
  assert.equal(source.snapshot().phase, 'signedOut'); assert.deepEqual(source.snapshot().boards, [])
})
