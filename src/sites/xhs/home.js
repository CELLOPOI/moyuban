import { setTimeout as delay } from 'node:timers/promises'
import { ReaderError } from '../../shared/errors.js'
import { feedCard, initialState, official, origin, preferCardLink } from './content.js'
import { checkLocation, loginRequired, responseError } from './detail.js'

const homeAddress = url => { const u = new URL(url); return u.origin === origin && /^\/explore\/?$/.test(u.pathname) }
const internalPage = url => url === 'about:blank' || url === 'chrome-error://chromewebdata/'
const cards = rows => Array.isArray(rows) ? rows.map(feedCard).filter(Boolean) : []
const browserClosed = () => new ReaderError('BROWSER_CLOSED', '读取首页的浏览器已关闭，请重试。', 503)
function navigationError(error) {
  // 原始异常可能含带签名的地址；只向阅读端传 Chromium 的网络错误代号。
  const code = /\bnet::(ERR_[A-Z0-9_]+)\b/.exec(error?.message)?.[1]
  if (code === 'ERR_HTTP_RESPONSE_CODE_FAILURE') return new ReaderError('HOME_NAVIGATION', '小红书未能提供首页，请稍后重试。', 502)
  if (code && code !== 'ERR_ABORTED') return new ReaderError('HOME_NETWORK', '宿主浏览器无法连接小红书（' + code + '），请检查网络或代理后重试。', 502)
  if (error?.name === 'TimeoutError') return new ReaderError('HOME_TIMEOUT', '打开小红书首页超时，请检查宿主网络后重试。', 504)
  return new ReaderError('HOME_NAVIGATION', '宿主浏览器未能打开小红书首页，请重试。', 502)
}

export async function inspectIndex(page, includeState = false) {
  const view = await page.evaluate(({ site, full }) => {
    if (location.origin !== site || !/^\/explore\/?$/.test(location.pathname)) return null
    const state = full ? window.__INITIAL_STATE__ : null
    const rows = Array.from(document.querySelectorAll('section.note-item'), el => {
      const a = el.querySelector('a.cover[href*="/explore/"]')
      if (!a) return null
      return { id: new URL(a.href).pathname.split('/').pop(), href: a.href, title: el.querySelector('.title')?.textContent,
        author: el.querySelector('.author .name,.author-wrapper .name')?.textContent, type: el.querySelector('.play-icon,.video-icon') ? 'video' : 'normal' }
    })
    return { rows, feeds: Array.isArray(state?.feed?.feeds) ? state.feed.feeds : [], loggedIn: state?.user?.loggedIn,
      login: full && Array.from(document.querySelectorAll('.login-modal,.login-container')).some(el => el.getClientRects().length && /扫码登录|登录后查看/.test(el.innerText)) }
  }, { site: origin, full: includeState })
  return view && { rows: cards(view.rows), feeds: cards(view.feeds), loggedIn: view.loggedIn, login: view.login }
}

export async function readHome(page, { signedIn, batches, getError, remember }) {
  let doc, navError, viewError, documentPending = false
  const checkRefusal = () => {
    const error = getError()
    if (error && ['LOGIN_REQUIRED', 'SOURCE_RESTRICTED', 'SOURCE_RATE_LIMITED'].includes(error.code)) throw error
  }
  try {
    // 首页一旦提交就可以观察接口和页面；慢脚本、已被浏览器回收的 HTML 都不应挡住已到的推荐。
    const res = await page.goto(origin + '/explore', { waitUntil: 'commit', timeout: 18000 })
    if (res) {
      checkLocation(res.url())
      const error = responseError(res.status())
      if (error) throw error
      if (homeAddress(res.url())) {
        documentPending = true
        void res.text().then(html => {
          const state = initialState(html)
          doc = { feeds: cards(state.feed?.feeds), loggedIn: state.user?.loggedIn }
        }).catch(() => {}).finally(() => { documentPending = false })
      }
    }
  } catch (error) {
    if (error instanceof ReaderError) throw error
    if (page.isClosed()) throw browserClosed()
    if (!internalPage(page.url())) checkLocation(page.url())
    navError = navigationError(error)
    if (navError.code === 'HOME_NETWORK') throw navError
  }
  const until = Date.now() + (navError ? 1200 : 8000)
  do {
    if (page.isClosed()) throw browserClosed()
    const address = page.url(), onHome = homeAddress(address)
    if (signedIn && doc?.loggedIn === false) throw loginRequired()
    checkRefusal()
    if (!onHome) {
      // 游客可以读官网首页已交付的首批。遇到登录或验证页后不从新页面提取数据。
      if (!signedIn && doc?.feeds.length && official(new URL(address).hostname)) return { items: doc.feeds, more: true }
      if (!documentPending && !internalPage(address)) checkLocation(address)
    } else {
      let view
      try { view = await inspectIndex(page, true) } catch (error) {
        if (page.isClosed()) throw browserClosed()
        if (!/execution context was destroyed|cannot find context|navigation|frame was detached/i.test(error.message)) {
          viewError = new ReaderError('HOME_READ_FAILED', '首页已打开，但浏览器未能读取推荐，请重试。', 502)
        }
      }
      if (!homeAddress(page.url())) continue
      checkRefusal()
      if (signedIn && (doc?.loggedIn === false || view?.loggedIn === false || (view?.login && view.loggedIn !== true))) throw loginRequired()
      // 已连接账号不能在登录状态尚待首页确认时，抢先交付游客卡片。
      if (signedIn && documentPending && view?.loggedIn !== true) { await delay(100); continue }
      const links = remember(view?.rows ?? [])
      const complete = items => items.map(row => ({ ...row, href: preferCardLink(row.href, links.get(row.id), row.id) }))
      const initial = doc?.feeds.length ? doc.feeds : view?.feeds
      if (initial?.length) return { items: complete(initial), more: true }
      // 空事件可能先于首屏渲染，不能就此宣告首页没有内容并替换旧索引。
      while (batches.length) {
        const batch = batches.shift()
        if (batch.items.length) return { ...batch, items: complete(batch.items) }
      }
      if (view?.rows.length) return { items: view.rows, more: true }
      if (view?.login && !documentPending) throw loginRequired()
      if (getError() && !documentPending) throw getError()
    }
    await delay(100)
  } while (Date.now() < until)
  if (page.isClosed()) throw browserClosed()
  if (!internalPage(page.url())) checkLocation(page.url())
  throw navError ?? getError() ?? viewError ?? new ReaderError('HOME_EMPTY', '小红书首页没有返回可读的推荐，请稍后刷新。', 503)
}
