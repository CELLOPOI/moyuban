import { randomUUID } from 'node:crypto'
import JSON5 from 'json5'
import { ReaderError } from '../../shared/errors.js'
import { webUrl } from './content.js'
import { baiduSession, cookieValue } from './session.js'

const passport = 'https://passport.baidu.com', tieba = 'https://tieba.baidu.com'
export const loginRequired = () => new ReaderError('LOGIN_REQUIRED', '请重新扫码连接百度贴吧。', 401)
const expired = () => new ReaderError('LOGIN_EXPIRED', '二维码已失效，请重新获取。', 410)
const unavailable = () => new ReaderError('TIEBA_ACCESS', '百度暂未返回可用的数据，请稍后重试。', 502)
const callback = 'bd_reader'
const stages = { '/v2/api/getqrcode': '获取二维码', '/v2/api/qrcode': '读取二维码图片', '/channel/unicast': '查询扫码状态',
  '/v3/login/main/qrbdusslogin': '确认百度登录' }
const badResponse = path => new ReaderError('TIEBA_RESPONSE', stages[path] + '失败，百度返回了无法识别的数据。', 502)

async function get(fetchPage, url, session, timeout = 15_000) {
  try {
    const headers = { Referer: url.origin + '/' }
    const cookie = session.header(url)
    if (cookie) headers.Cookie = cookie
    const response = await fetchPage(url, { headers, redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(timeout) })
    session.receive(url, response.headers)
    if (!response.ok) {
      await response.body?.cancel()
      throw new ReaderError('TIEBA_ACCESS', stages[url.pathname] + '失败（HTTP ' + response.status + '）。', 502)
    }
    return response
  } catch (error) {
    if (error instanceof ReaderError) throw error
    if (error.name === 'TimeoutError') throw new ReaderError('TIEBA_TIMEOUT', stages[url.pathname] + '超时，请重试。', 504)
    throw new ReaderError('TIEBA_ACCESS', stages[url.pathname] + '时未能连接百度，请稍后重试。', 502)
  }
}

export async function bytes(response, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of response.body ?? []) {
    if ((size += chunk.length) > limit) throw unavailable()
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function passportCall(fetchPage, path, fields, ticket) {
  const url = new URL(path, passport)
  url.search = new URLSearchParams({ tpl: 'tb', apiver: 'v3', tt: Date.now(), callback, ...fields })
  const response = await get(fetchPage, url, ticket.session, path === '/channel/unicast' ? 40_000 : 15_000)
  const raw = (await bytes(response, 256 * 1024)).toString('utf8').trim()
  try {
    const wrapped = /^bd_reader\(([\s\S]*)\);?$/.exec(raw)
    return JSON5.parse(wrapped ? wrapped[1] : raw)
  } catch { throw badResponse(path) }
}

export function tiebaAccount(grant, fetchPage) {
  let current
  function check(ticket) {
    if (ticket !== current || Date.now() >= ticket.expiresAt) throw expired()
  }
  async function complete(ticket) {
    let reply
    try {
      reply = await passportCall(fetchPage, '/channel/unicast', { channel_id: ticket.sign, gid: ticket.gid, _sdkFrom: 1 }, ticket)
    } catch (error) {
      check(ticket)
      // 百度用长轮询等待手机确认。等待超时仍可用同一张二维码继续查询。
      if (error.code === 'TIEBA_TIMEOUT' || error.name === 'TimeoutError') return { state: 'pending' }
      throw error
    }
    check(ticket)
    if (Number(reply.errno) === 1) return { state: 'pending' }
    if (String(reply.errno) !== '0') throw badResponse('/channel/unicast')
    let channel
    try { channel = typeof reply.channel_v === 'string' ? JSON5.parse(reply.channel_v) : reply.channel_v }
    catch { throw badResponse('/channel/unicast') }
    if (channel?.status == null) return { state: 'pending' }
    if (String(channel?.status) === '1') return { state: 'scanned' }
    if (String(channel?.status) === '2') throw expired()
    if (String(channel?.status) !== '0' || !cookieValue(channel.v)) throw badResponse('/channel/unicast')
    const result = await passportCall(fetchPage, '/v3/login/main/qrbdusslogin', {
      bduss: channel.v, u: tieba + '/', loginVersion: 'v4', qrcode: 1, v: Date.now(),
    }, ticket)
    check(ticket)
    if (String(result?.errInfo?.no) !== '0') throw new ReaderError('TIEBA_LOGIN', '百度未确认登录，请在手机上完成验证后重新扫码。', 403)
    ticket.session.acceptPassportSession(result.data?.session)
    if (!ticket.session.hasLogin()) throw loginRequired()
    // Passport 已确认并签发凭据。昵称可以缺省，不能因贴吧资料接口不可用而丢弃这次登录。
    const generation = randomUUID(), user = result.data?.user
    const uid = /^[1-9]\d*$/.test(String(user?.userId)) ? String(user.userId) : generation
    const name = [user?.displayName, user?.username, result.data?.userName]
      .find(value => typeof value === 'string' && value.trim())?.trim() || '百度用户'
    await grant.save(previous => {
      check(ticket)
      if ((previous?.generation ?? '') !== ticket.previous) throw new ReaderError('ACCOUNT_CHANGED', '百度账号已在其他窗口变更，请重新打开关注列表。', 409)
      return { uid, name, sessionCookies: ticket.session.snapshot(), generation }
    })
    if (current === ticket) current = null
    return { state: 'connected', name }
  }
  return {
    read: grant.read, id: user => user.uid,
    async rememberSession(user, sessionCookies) {
      await grant.save(previous => {
        if (!previous || previous.generation !== user.generation) throw new ReaderError('ACCOUNT_CHANGED', '百度账号已变更，请重新读取。', 409)
        // 同一登录可能在多个窗口同步。较慢的请求不能覆盖别的窗口刚领到的凭据。
        if (JSON.stringify(previous.sessionCookies ?? null) !== JSON.stringify(user.sessionCookies ?? null)) return previous
        return { uid: previous.uid, name: previous.name, generation: previous.generation, sessionCookies }
      })
    },
    async login() {
      const ticket = current = { id: randomUUID(), gid: randomUUID().toUpperCase(), expiresAt: Date.now() + 590_000,
        session: baiduSession() }
      ticket.previous = (await grant.read())?.generation ?? ''
      check(ticket)
      const result = await passportCall(fetchPage, '/v2/api/getqrcode', { lp: 'pc', qrloginfrom: 'pc', gid: ticket.gid }, ticket)
      if (String(result.errno) !== '0' || !cookieValue(result.sign) || typeof result.imgurl !== 'string') throw unavailable()
      const address = result.imgurl.replace(/^(?:https?:)?\/\//i, '')
      const url = webUrl('https://' + address)
      if (!url || url.origin !== passport || url.pathname !== '/v2/api/qrcode' || url.searchParams.get('sign') !== result.sign) throw unavailable()
      const response = await get(fetchPage, url, ticket.session)
      const image = await bytes(response, 256 * 1024)
      if (!image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw unavailable()
      check(ticket)
      ticket.sign = result.sign
      return { id: ticket.id, expiresAt: ticket.expiresAt, image: 'data:image/png;base64,' + image.toString('base64') }
    },
    async poll({ id }) {
      const ticket = current
      if (!ticket || ticket.id !== id || !ticket.sign) throw expired()
      check(ticket)
      ticket.pending ??= complete(ticket).finally(() => { delete ticket.pending })
      return ticket.pending
    },
    async cancelLogin({ id }) { if (current?.id === id) current = null; return {} },
    async logout() { current = null; await grant.clear(); return { connected: false } },
  }
}
