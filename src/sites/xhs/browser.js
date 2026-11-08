import { setTimeout as delay } from 'node:timers/promises'
import { ReaderError } from '../../shared/errors.js'
import { cardLink, commentPage, detailNote, feedCard, initialState, mediaUrl, official, origin, preferCardLink } from './content.js'
import { checkPage, displayedDetail, loginRequired, noteRoot, responseError, restricted, stateDetail, unavailable } from './detail.js'
import { inspectIndex, readHome } from './home.js'

const cleanCookies = cookies => Array.isArray(cookies) ? cookies.filter(c => typeof c?.domain === 'string' && official(c.domain.replace(/^\./, ''))) : []
const homePath = '/api/sns/web/v1/homefeed', notePath = '/api/sns/web/v1/feed', commentsPath = '/api/sns/web/v2/comment/page'

export async function restoreLoginCookies(context, saved) {
  const cookies = cleanCookies(saved).filter(c => c.expires == null || c.expires === -1 || c.expires > Date.now() / 1000)
  const hasSession = list => list.some(c => c.name === 'web_session' && c.value)
  if (!hasSession(cookies)) throw loginRequired()
  try { await context.addCookies(cookies) } catch (error) {
    if (!context.browser()?.isConnected()) throw error
    // Chromium 会因一个无效的附属 Cookie 拒绝整批。按原域、路径和分区逐项恢复，不放宽任何作用域。
    for (const cookie of cookies) {
      try { await context.addCookies([cookie]) } catch (e) { if (!context.browser()?.isConnected()) throw e }
    }
  }
  if (!hasSession(await context.cookies(origin + '/explore'))) throw loginRequired()
}

async function launch(visible) {
  const { chromium } = await import('playwright-core').catch(() => {
    throw new ReaderError('BROWSER_UNAVAILABLE', 'DSH 未能加载浏览器组件，请重新安装插件并重启 DSH。', 503)
  })
  let browser
  for (const channel of ['chrome', 'msedge', undefined]) {
    try { browser = await chromium.launch({ channel, headless: !visible, args: ['--mute-audio'], timeout: 10000 }); break } catch {}
  }
  if (!browser) throw new ReaderError('BROWSER_UNAVAILABLE', visible ? '宿主需要可显示窗口的 Chrome 或 Edge 才能扫码。' :
    '宿主没有可用的 Chrome 或 Edge。安装浏览器后可重新读取。', 503)
  try {
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1400, height: 825 }, acceptDownloads: false })
    return { browser, context, page: await context.newPage() }
  } catch {
    await browser.close().catch(() => {})
    throw new ReaderError('BROWSER_UNAVAILABLE', 'DSH 未能建立浏览器会话，请重试。', 503)
  }
}

export async function openLogin() {
  const { browser, context, page } = await launch(true)
  try { await page.goto(origin + '/login', { waitUntil: 'domcontentloaded', timeout: 18000 }) }
  catch { await browser.close(); throw unavailable() }
  return {
    close: () => browser.close(),
    async check() {
      if (page.isClosed()) throw new ReaderError('LOGIN_CLOSED', '扫码窗口已关闭。', 409)
      const u = new URL(page.url())
      if (!official(u.hostname) || u.pathname.includes('error')) throw restricted()
      if (u.pathname !== '/explore') return null
      const cookies = cleanCookies(await context.cookies())
      if (!cookies.some(c => c.name === 'web_session' && c.value)) return null
      return { cookies }
    },
  }
}

async function waitFor(read, timeout = 6500) {
  const until = Date.now() + timeout
  do {
    const value = await read()
    if (value != null) return value
    await delay(120)
  } while (Date.now() < until)
  throw unavailable()
}

export async function openSource(grant, start = launch) {
  const { browser, context, page } = await start(false)
  // 官网在后台只提供数据。扫码使用另一个由用户主动打开的上下文。
  try {
    if (grant) await restoreLoginCookies(context, grant.cookies)
    await context.route('**/*', route => ['image', 'media'].includes(route.request().resourceType()) ? route.abort() : route.continue())
  } catch (error) {
    await browser.close().catch(() => {})
    if (error instanceof ReaderError) throw error
    throw new ReaderError('BROWSER_UNAVAILABLE', '读取首页的浏览器未能启动，请重试。', 503)
  }
  const batches = [], notes = new Map(), comments = new Map(), cardLinks = new Map()
  const noteRequests = new WeakMap()
  let extra, reading, mainDetail = false, first, homeError
  function acceptComments(id, cursor, result) {
    if (!comments.has(id)) comments.set(id, new Map())
    comments.get(id).set(cursor || '', result)
  }
  function acceptDetail(result) {
    if (!result?.note) return
    notes.set(result.note.id, result.note)
    if (result.comments?.items.length) acceptComments(result.note.id, '', result.comments)
  }
  function rememberCards(rows) {
    for (const row of rows) cardLinks.set(row.id, preferCardLink(cardLinks.get(row.id), row.href, row.id))
    return cardLinks
  }
  context.on('request', req => {
    if (!reading) return
    try {
      const u = new URL(req.url())
      if (official(u.hostname) && u.pathname === notePath && req.frame().page() === reading.page) {
        const data = req.postDataJSON(), id = data?.source_note_id ?? data?.note_id ?? u.searchParams.get('note_id')
        if (id && id !== reading.id) return
        noteRequests.set(req, { owner: reading, matched: id === reading.id })
        reading.pending.add(req)
      }
    } catch { /* 只把能确认编号和页面的请求归给这次点击。 */ }
  })
  context.on('requestfailed', req => noteRequests.get(req)?.owner.pending.delete(req))
  context.on('response', async r => {
    try {
      const u = new URL(r.url())
      if (!official(u.hostname)) return
      const req = r.request(), attempt = reading
      if (attempt?.page === page && req.isNavigationRequest() && r.frame() === page.mainFrame() && cardLink(u.href, attempt.id)) {
        if (r.status() >= 300 && r.status() < 400) return
        const error = responseError(r.status(), null, true)
        if (error) { attempt.error = error; return }
        const state = initialState(await r.text())
        if (reading === attempt && !attempt.error) acceptDetail(stateDetail(state, attempt.id))
        return
      }
      if (![homePath, notePath, commentsPath].includes(u.pathname)) return
      if (u.pathname === homePath && r.frame().page() !== page) return
      const request = noteRequests.get(req)
      const body = await r.json().catch(() => null)
      request?.owner.pending.delete(req)
      const error = responseError(r.status(), body, u.pathname === notePath)
      if (error) {
        if (u.pathname === homePath) homeError = error
        if (u.pathname === commentsPath) acceptComments(u.searchParams.get('note_id'), u.searchParams.get('cursor'), error)
        if (request?.matched) request.owner.error = error
        return
      }
      if (!body) return
      if (u.pathname === homePath) {
        if (!Array.isArray(body.data?.items)) return
        const items = body.data.items.map(feedCard).filter(Boolean)
        batches.push({ items, more: body.data?.has_more !== false && (items.length > 0 || Boolean(body.data?.cursor_score)) })
      } else if (u.pathname === notePath) {
        if (!request || request.owner !== reading) return
        for (const row of body.data?.items ?? []) {
          const data = row.note_card ?? row.noteCard
          if (!row.id || row.id === reading.id) acceptDetail({ note: detailNote(data, reading.id, row.id) })
        }
      } else {
        const result = commentPage(body.data)
        if (result) acceptComments(u.searchParams.get('note_id'), u.searchParams.get('cursor'), result)
      }
    } catch { /* 页面导航取消未完成的响应；读取方会报告超时或访问限制。 */ }
  })
  async function home() {
    if (first) return first
    homeError = null
    first = await readHome(page, { signedIn: Boolean(grant), batches, getError: () => homeError, remember: rememberCards })
    return first
  }
  async function backToFeed(required = false) {
    reading = null
    if (extra) { await extra.close().catch(() => {}); extra = null }
    if (mainDetail && new URL(page.url()).pathname !== '/explore') {
      if (new URL(page.url()).pathname.startsWith('/explore/')) {
        await page.keyboard.press('Escape')
        await page.waitForURL(u => u.pathname === '/explore', { timeout: 1800 }).catch(() => {})
      }
      // 有的卡会整页跳到正文或单篇错误页，Esc 只能关闭站内的预览层。
      if (new URL(page.url()).pathname !== '/explore') {
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 3500 }).catch(() => {})
      }
    }
    checkPage(page)
    mainDetail = new URL(page.url()).pathname !== '/explore'
    if (mainDetail && required) throw new ReaderError('FEED_EXPIRED', '来源未能返回原索引，请重新打开索引。', 409)
  }
  async function next() {
    await backToFeed(true)
    for (let step = 0; step < 10; step++) {
      checkPage(page)
      if (homeError) throw homeError
      // 下一次滚动后，官网可能立刻回收这批 DOM。趁原卡还在，记下它的完整链接。
      rememberCards((await inspectIndex(page))?.rows ?? [])
      if (batches.length) return batches.shift()
      await page.mouse.move(900, 550)
      await page.mouse.wheel(0, 2200)
      await delay(350)
    }
    return waitFor(() => {
      if (batches.length) return batches.shift()
      checkPage(page)
      if (homeError) throw homeError
    }, 4500)
  }
  async function direct(card) {
    const href = preferCardLink(card.href, cardLinks.get(card.id), card.id)
    if (!href) throw unavailable()
    if (extra) await extra.close().catch(() => {})
    extra = await context.newPage()
    reading = { id: card.id, page: extra, fresh: true, pending: new Set() }
    let res
    try { res = await extra.goto(href, { waitUntil: 'domcontentloaded', timeout: 16000 }) }
    catch { if (official(new URL(extra.url()).hostname)) checkPage(extra, true); if (!cardLink(extra.url(), card.id)) throw unavailable() }
    checkPage(extra, true)
    if (reading.error) throw reading.error
    if (res && cardLink(res.url(), card.id)) {
      const error = responseError(res.status(), null, true)
      if (error) throw error
      acceptDetail(stateDetail(initialState(await res.text().catch(() => '')), card.id))
    }
  }
  async function visit(card) {
    if (reading?.id === card.id && !reading.page.isClosed()) return
    await backToFeed()
    const cover = page.locator('section.note-item a.cover[href*="/explore/' + card.id + '"]').first()
    if (new URL(page.url()).pathname === '/explore' && await cover.count()) {
      const link = cardLink(await cover.getAttribute('href').catch(() => null), card.id)
      if (link) {
        cardLinks.set(card.id, preferCardLink(cardLinks.get(card.id), link, card.id))
        const occupied = await page.locator(noteRoot).evaluateAll(els => els.some(el => el.getClientRects().length))
        reading = { id: card.id, page, fresh: !occupied, pending: new Set() }; mainDetail = true
        try { await cover.click({ timeout: 3500 }); return } catch {
          checkPage(page, true)
          if (reading.error) throw reading.error
        }
      }
    }
    // 虚拟列表已回收旧行时在同一账号的新页打开。首页的游标和滚动上下文继续保留。
    await direct(card)
  }
  async function readNote(card) {
    const start = Date.now()
    const read = async () => {
      checkPage(reading.page, true)
      if (reading.error) throw reading.error
      if (!notes.has(card.id)) {
        const shown = await displayedDetail(reading.page, card, reading.fresh)
        checkPage(reading.page, true)
        if (reading.error) throw reading.error
        // 正在加载的同编号详情可能带完整图集；不要先用首张可见图结束读取。
        if (!notes.has(card.id) && (!shown?.rendered || Date.now() - start >= (reading.pending.size ? 8000 : 250))) acceptDetail(shown)
      }
      return notes.get(card.id)
    }
    try { return await waitFor(read, 4500) }
    catch (error) {
      if (error.code !== 'SOURCE_UNAVAILABLE' || reading.error || !reading.pending.size) throw error
      return waitFor(read, 4500)
    }
  }
  return {
    home, next, close: () => browser.close(),
    async detail(card) {
      try {
        let note = notes.get(card.id)
        if (!note) {
          await visit(card)
          try { note = await readNote(card) }
          catch (error) {
            if (reading.page !== page || reading.error || error.code !== 'SOURCE_UNAVAILABLE') throw error
            // 点击后未出现这篇的内容，再从原卡链接进入。官网明确拒绝时不重开。
            await direct(card); note = await readNote(card)
          }
        }
        if (note.type === 'video' && !note.video && reading?.id === card.id) {
          // 有些推荐的详情响应只有视频元数据，直达页另附播放器能使用的资源。
          try {
            if (reading.page === page) {
              await backToFeed(); await direct(card)
              note.video = notes.get(card.id)?.video
            }
            if (!note.video && cardLink(reading.page.url(), card.id)) {
              const src = await reading.page.locator('video').first().evaluate(v => v.currentSrc || v.src, null, { timeout: 1600 }).catch(() => '')
              note.video = mediaUrl(src)
            }
          } catch { /* 视频资源未开放时，保留这次已经读到的正文。 */ }
          notes.set(card.id, note)
        }
        return note
      }
      catch (error) { reading = null; throw error }
    },
    async comments(card, cursor) {
      const result = () => {
        const chunk = comments.get(card.id)?.get(cursor)
        if (chunk instanceof Error) throw chunk
        return chunk
      }
      if (result()) return result()
      await visit(card)
      const scroller = reading.page.locator('.note-scroller, .comments-el, .comments-container').first()
      if (await scroller.count()) await scroller.evaluate(el => {
        let parent = el
        while (parent && parent.scrollHeight <= parent.clientHeight) parent = parent.parentElement
        if (parent) parent.scrollTop = parent.scrollHeight
      })
      return waitFor(() => result() ?? (checkPage(reading.page, true), null))
    },
  }
}
