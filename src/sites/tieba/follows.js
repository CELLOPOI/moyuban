import { parse } from 'parse5'
import { ReaderError } from '../../shared/errors.js'
import { bytes, loginRequired } from './account.js'
import { baiduSession } from './session.js'
import { webUrl } from './content.js'
import { forum } from './forum.js'

const origin = 'https://tieba.baidu.com'
const mobile = { name: '移动版', path: '/mg/o/getForumHome', parse: mobilePage }
const desktop = { name: '网页版', path: '/f/like/mylike', parse: desktopPage }
const passport = 'https://passport.baidu.com'
const isAuthExchange = url => url && [passport, 'https://wappass.baidu.com'].includes(url.origin) && /^\/v3\/login\/api\/auth\/?$/.test(url.pathname)
const redirects = new Set([301, 302, 303, 307, 308])
const invalid = () => new ReaderError('TIEBA_RESPONSE', '关注列表格式异常', 502)
const restricted = message => new ReaderError('TIEBA_RESTRICTED', message, 502)
const verification = () => restricted('百度要求安全验证')
const digits = value => /^(?:0|[1-9]\d*)$/.test(String(value)) ? Number(value) : NaN

function mobilePage(raw, _, page) {
  let result
  try { result = JSON.parse(raw.toString('utf8')) } catch { throw invalid() }
  const code = digits(result?.errno)
  if (code !== 0) {
    if (Number.isSafeInteger(code)) throw new ReaderError('TIEBA_RESPONSE', '百度返回错误码 ' + code, 502)
    throw invalid()
  }
  const data = result.data, logged = data?.user_info?.is_login
  if (logged === false || String(logged) === '0') throw loginRequired()
  const list = data?.like_forum?.list, pagination = data?.like_forum?.page
  // 同一响应也包含推荐吧。只有已登录账号的 like_forum 才是关注列表。
  if (!(logged === true || String(logged) === '1') || !Array.isArray(list)) throw invalid()
  const current = digits(pagination?.cur_page), last = digits(pagination?.total_page)
  if (page === 1 && last === 0 && !list.length && (current === 0 || current === 1)) return { names: [], last: 1 }
  if (current !== page || !Number.isSafeInteger(last) || last < current) throw invalid()
  return { names: list.map(item => item?.forum_name), last }
}

const attr = (node, key) => node.attrs?.find(item => item.name === key)?.value
function* nodes(node) {
  yield node
  for (const child of node.childNodes ?? []) yield* nodes(child)
}

function desktopPage(raw, type, page) {
  const utf8 = /charset\s*=\s*["']?utf-8/i.test(type + raw.toString('latin1', 0, 512))
  const html = new TextDecoder(utf8 ? 'utf-8' : 'gbk').decode(raw)
  if (/\bvar\s+Tbs\s*=\s*null\b/.test(html)) throw loginRequired()
  const dom = [...nodes(parse(html))]
  const table = dom.find(n => attr(n, 'class')?.split(/\s+/).includes('forum_table'))
  if (!table || ![...nodes(table)].some(n => n.tagName === 'table')) throw invalid()
  const names = []
  for (const row of nodes(table)) {
    if (row.tagName !== 'tr') continue
    const cells = [...nodes(row)]
    if (!cells.some(n => n.tagName === 'td')) continue
    const link = cells.find(n => n.tagName === 'a' && webUrl(attr(n, 'href'), origin)?.pathname === '/f' && attr(n, 'title'))
    names.push(link && attr(link, 'title'))
  }
  if (!names.length && !/\bvar\s+Tbs\s*=\s*["'][^"']+["']/.test(html)) throw invalid()
  let last = page
  for (const link of dom) {
    if (link.tagName !== 'a') continue
    const url = webUrl(attr(link, 'href'), origin + desktop.path)
    if (url?.hostname !== 'tieba.baidu.com' || url.pathname !== desktop.path) continue
    const pn = digits(url.searchParams.get('pn'))
    if (Number.isSafeInteger(pn)) last = Math.max(last, pn)
  }
  return { names, last }
}

// 只显示已知网络错误码，异常原文和重定向参数可能包含会话信息。
const networkCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH',
  'EHOSTUNREACH', 'EPIPE', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_HEADERS_OVERFLOW', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'])
function networkError(error) {
  if (error instanceof ReaderError) return error
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return new ReaderError('TIEBA_TIMEOUT', '请求超时', 504)
  const cause = error.cause
  const code = [cause?.code, error.code, ...(Array.isArray(cause?.errors) ? cause.errors.map(e => e?.code) : [])]
    .find(value => networkCodes.has(value))
  return new ReaderError('TIEBA_ACCESS', '连接失败（' + (code || 'FETCH_FAILED') + '）', 502)
}

function redirectTarget(response, url) {
  const target = webUrl(response.headers.get('location'), url)
  if (target?.protocol === 'http:' && !target.port && ['tieba.baidu.com', 'passport.baidu.com'].includes(target.hostname)) target.protocol = 'https:'
  return target
}

async function request(url, context, signal) {
  const headers = { Referer: origin + '/' }, cookie = context.session.header(url)
  if (cookie) headers.Cookie = cookie
  const response = await context.fetchPage(url, { headers, cache: 'no-store', credentials: 'omit', redirect: 'manual', signal })
  context.session.receive(url, response.headers)
  return response
}

function accessDenied(response, target) {
  if (response.status === 403 || response.status === 429) throw restricted('百度限制了请求（HTTP ' + response.status + '）')
  if (target && ['passport.baidu.com', 'wappass.baidu.com'].includes(target.hostname)) {
    if (/captcha|verify/i.test(target.pathname)) throw verification()
    if (/login/i.test(target.pathname) || target.searchParams.has('login')) throw loginRequired()
  }
}

async function authorize(passUrl, listUrl, context, signal) {
  const failed = () => new ReaderError('TIEBA_SESSION', '百度账号中心未完成贴吧授权', 502)
  if (context.attemptedAuth) throw failed()
  context.attemptedAuth = true
  // 账号中心签发站点票据，回到原贴吧地址后才会设置贴吧自己的 STOKEN。
  let callback
  for (let hop = 0; hop < 3; hop++) {
    const auth = await request(passUrl, context, signal)
    callback = redirectTarget(auth, passUrl)
    await auth.body?.cancel()
    if (redirects.has(auth.status) && isAuthExchange(callback)) { passUrl = callback; continue }
    accessDenied(auth, callback)
    if (!redirects.has(auth.status)) throw failed()
    break
  }
  if (callback?.origin !== origin || ![listUrl.pathname, '/f/user/passport', '/', '/index.html'].includes(callback.pathname)) throw failed()
  if (callback.searchParams.has('errno') && callback.searchParams.get('errno') !== '0') throw loginRequired()
  if (!callback.searchParams.has('stoken')) throw failed()
  const accepted = await request(callback, context, signal)
  const next = redirectTarget(accepted, callback)
  await accepted.body?.cancel()
  accessDenied(accepted, next)
  if ((!accepted.ok && !redirects.has(accepted.status)) || !context.session.hasTiebaToken(listUrl)) throw failed()
  context.linked = true
  await context.remember?.(context.session.snapshot())
}

async function readPage(source, page, context) {
  let url = new URL(source.path, origin)
  url.searchParams.set('pn', page)
  if (source === mobile) url.searchParams.set('rn', 50)
  const signal = AbortSignal.timeout(15_000)
  for (let hops = 0; ; hops++) {
    const response = await request(url, context, signal)
    if (!response.ok) {
      await response.body?.cancel()
      const http = 'HTTP ' + response.status
      if (redirects.has(response.status)) {
        const target = redirectTarget(response, url)
        if (isAuthExchange(target)) {
          await authorize(target, url, context, signal)
          continue
        }
        // 只携带凭据跟随原站、原列表、原页码的规范化跳转。
        if (target?.origin === origin && target.pathname.replace(/\/$/, '') === source.path &&
            (target.searchParams.get('pn') ?? '1') === String(page) && target.href !== url.href && hops < 3) {
          url = target
          continue
        }
        accessDenied(response, target)
        throw new ReaderError('TIEBA_REDIRECT', '百度返回跳转（' + http + '）', 502)
      }
      if (response.status === 401) throw loginRequired()
      accessDenied(response)
      throw new ReaderError('TIEBA_ACCESS', http, 502)
    }
    const raw = await bytes(response, 4 * 1024 * 1024)
    if (/<title[^>]*>\s*百度安全验证/i.test(raw.toString('utf8', 0, 8192))) throw verification()
    return source.parse(raw, response.headers.get('content-type') || '', page)
  }
}

async function readList(source, context) {
  const boards = new Map()
  let last = 1, page = 1
  try {
    for (; page <= last; page++) {
      const result = await readPage(source, page, context)
      last = Math.max(last, result.last)
      if (last > 1000) throw invalid()
      const previousSize = boards.size
      for (const name of result.names) {
        const board = forum(name)
        if (!board) throw invalid()
        boards.set(board.sessionId, board)
      }
      if (boards.size === previousSize && (page > 1 || last > 1)) throw invalid()
    }
    return [...boards.values()]
  } catch (cause) {
    const error = networkError(cause)
    const detail = error.code === 'LOGIN_REQUIRED' ? '百度返回未登录' : error.message.replace(/。$/, '')
    throw new ReaderError(error.code, source.name + '第 ' + page + ' 页，' + detail + '。', error.status)
  }
}

export async function followedBoards(user, fetchPage, account) {
  const context = { session: baiduSession(user), fetchPage, remember: account && (rows => account.rememberSession(user, rows)) }
  try {
    return await readList(mobile, context)
  } catch (first) {
    if (['TIEBA_RESTRICTED', 'ACCOUNT_CHANGED'].includes(first.code)) throw first
    try {
      // 从第一页重新读取，避免把两种排序或不同时间的分页拼在一起。
      return await readList(desktop, context)
    } catch (second) {
      if (['TIEBA_RESTRICTED', 'ACCOUNT_CHANGED'].includes(second.code)) throw second
      if (context.linked && first.code === 'LOGIN_REQUIRED') return readList(mobile, context)
      if (first.code === 'LOGIN_REQUIRED' && second.code === 'LOGIN_REQUIRED') throw loginRequired()
      throw new ReaderError('TIEBA_ACCESS', first.message + second.message, 502)
    }
  }
}
