import JSON5 from 'json5'
import { contentBlocks, plain, postAuthor } from './content.js'
import { parseForumXml } from './forum-xml.js'
import { parseThreadHtml } from './thread-html.js'
import { board, forum } from './boards.js'
import { ReaderError, unconfirmedReplyMessage } from '../../shared/errors.js'

const origin = 'https://bbs.nga.cn'
const readerAgent = 'NGA_WP_JW/(;WINDOWS)'

function messages(value) {
  if (typeof value === 'string') return [plain(value)]
  return value && typeof value === 'object' ? Object.values(value).flatMap(messages) : []
}

function parseBody(text) {
  const json = text.trim().replace(/^window\.script_muti_get_var_store\s*=\s*/, '').replace(/;\s*$/, '')
  try { return JSON.parse(json) } catch { /* 旧响应接受单引号和未加引号的键。 */ }
  // 部分长帖把换行、制表符直接写进 JSON 字符串。
  const repaired = json.replace(/"(?:\\[\s\S]|[^"\\])*"/g, quoted =>
    quoted.replace(/[\u0000-\u001f]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')))
  try { return JSON5.parse(repaired) } catch { return null }
}

function problem(payload) {
  return messages(payload?.error ?? payload?.data?.error ?? payload?.data?.__MESSAGE ?? payload?.__MESSAGE)
    .filter(Boolean).join(' ').slice(0, 180)
}

function checkResponse({ payload, text, status }, signedIn) {
  let error = problem(payload)
  // 网页版也会用 HTTP 200 报错；只取 NGA 错误页的消息区，不匹配楼层正文。
  if (!payload && /ERROR:\s*<!--msgcodestart-->/i.test(text) && !text.includes('<!--postliststart-->')) {
    const notice = /<!--msginfostart-->([\s\S]*?)<!--msginfoend-->/i.exec(text)
    if (notice) error = plain(notice[1]).slice(0, 180)
  }
  if (status === 429) throw new ReaderError('NGA_RATE_LIMIT', 'NGA 暂时限制了请求频率，请稍后重试。', 429)
  if (/访客不能直接访问|访客验证|请(?:先登录|登录后访问)|必须登录|尚未登录|未登录/.test(error) ||
      ((!payload || status === 403) && /guestJs/.test(text.slice(0, 2048)))) {
    throw new ReaderError('NGA_ACCESS', signedIn ? 'NGA 要求重新验证账号，请重新连接后重试。' : 'NGA 要求验证访问身份，请扫码连接账号后重试。', 403)
  }
  if (error) throw new ReaderError('NGA_REFUSED', error, status === 403 ? 403 : 422)
  if (status === 401 || status === 403) throw new ReaderError('NGA_ACCESS', 'NGA 拒绝了这次访问（HTTP ' + status + '）。', 403)
  if (status < 200 || status >= 300) throw new ReaderError('NGA_RESPONSE', 'NGA 暂时无法提供这个页面（HTTP ' + status + '）。', 502)
}

function requireData(result, signedIn = false) {
  checkResponse(result, signedIn)
  const { payload } = result
  if (!payload || typeof payload !== 'object') throw new ReaderError('NGA_FORMAT', 'NGA 返回的数据不完整，请稍后重试。', 502)
  return payload.data ?? payload
}

function decodeBody(buffer, contentType, legacy) {
  const declared = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType ?? '')?.[1] ??
    /^\s*<\?xml\s[^?]*?encoding\s*=\s*["']([\w-]+)/i.exec(buffer.toString('latin1', 0, 160))?.[1]
  // 紧凑 JSON 有时没有响应头；个别 GBK 汉字的字节恰好也是合法的 UTF-8。
  if (/^gb(?:k|2312|18030)$/i.test(declared) || (!declared && legacy && !buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])))) {
    return new TextDecoder('gb18030').decode(buffer)
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer) }
  catch { return new TextDecoder('gb18030').decode(buffer) }
}

async function request(path, query, form, passport = false) {
  const url = new URL(path, origin)
  url.search = new URLSearchParams(query).toString()
  const reading = path === '/thread.php' || path === '/read.php' || path === '/forum.php' || path === '/app_api.php' || query.__lib === 'forum_favor2'
  const headers = {
    'User-Agent': reading ? readerAgent : 'Mozilla/5.0 (compatible; DSH-NGA-Reader/0.1)',
    ...(reading && { 'X-User-Agent': readerAgent }),
    ...(reading && query.__output !== '11' && { 'Accept-Encoding': 'identity' }),
    Referer: passport ? origin + '/nuke/account_copy.html' : url.href,
    Origin: origin,
  }
  const signal = AbortSignal.timeout(12_000)
  let response
  try {
    response = await fetch(url, { method: 'POST', headers, body: new URLSearchParams(form), redirect: 'error', signal })
    const bytes = []
    let size = 0
    for await (const chunk of response.body ?? []) {
      size += chunk.length
      if (size > 8_000_000) throw new ReaderError('NGA_RESPONSE', '这页超过了可读取的大小。', 502)
      bytes.push(chunk)
    }
    const text = decodeBody(Buffer.concat(bytes), response.headers.get('content-type'), reading && query.__output !== '11')
    let payload = null
    if (reading && text.trimStart().startsWith('<')) {
      if (query.__output === '10') payload = parseForumXml(text)
    } else {
      payload = parseBody(text)
    }
    return { payload, text, status: response.status }
  } catch (error) {
    if (error instanceof ReaderError) throw error
    throw new ReaderError('NGA_NETWORK', '连接 NGA 失败，请检查网络后重试。', 502)
  }
}

function authFields(account) {
  return account ? { access_uid: account.uid, access_token: account.token } : {}
}

function forumRow(row) {
  if (!row || typeof row !== 'object') return null
  const name = plain(row.name)
  return forum('stid', row.stid, name) ?? forum('fid', row.fid, name)
}

function forumRows(rows) {
  if (!rows || typeof rows !== 'object') return null
  const found = new Map()
  const fields = Object.entries(rows)
  for (const [key, row] of fields) {
    if (key.startsWith('__')) continue
    const item = forumRow(row)
    if (!item) return null
    found.set(item.sessionId, item)
  }
  if (!found.size && fields.length && Number(rows.__ROWS ?? -1) !== 0) return null
  return [...found.values()]
}

function normalizeDirectory(data) {
  const categories = []
  for (const row of Object.values(data ?? {})) {
    if (!row?.name || !row.groups) continue
    const groups = []
    for (const group of Object.values(row.groups)) {
      if (!group?.forums) continue
      // 同一版面可列在不同分类下，只在 NGA 的同一个分组里去重。
      const boards = new Map()
      for (const item of Object.values(group.forums)) {
        const ref = forumRow(item)
        if (ref) boards.set(ref.sessionId, ref)
      }
      if (boards.size) groups.push({ name: plain(group.name) || plain(row.name), boards: [...boards.values()] })
    }
    if (groups.length) categories.push({ key: String(row._id ?? row.id ?? row.name), name: plain(row.name), groups })
  }
  if (!categories.length) throw new ReaderError('NGA_FORMAT', 'NGA 没有返回完整的版面分类目录。', 502)
  return categories
}

function validTid(value) {
  const id = Number(value)
  return /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(id) ? id : undefined
}

// 跨版引用在索引里有自己的 tid，NGA 的阅读链接和 quote_from 才指向有楼层的原帖。
function targetTid(topic) {
  if (topic?.tpcurl) {
    try {
      const url = new URL(topic.tpcurl, origin)
      const target = validTid(url.searchParams.get('tid'))
      if (url.origin === origin && url.pathname === '/read.php' && target) return target
    } catch { /* 旧记录可能只给出 quote_from。 */ }
  }
  return validTid(topic?.quote_from) ?? validTid(topic?.tid)
}

export function normalizeList(data, page) {
  if (!data.__T && Number(data.__T__ROWS ?? -1) !== 0) throw new ReaderError('NGA_RESPONSE', 'NGA 响应里没有帖子列表。', 502)
  const items = []
  for (const row of Object.values(data.__T ?? {})) {
    const entryId = validTid(row?.tid)
    if (!entryId || !row.subject) continue
    const id = targetTid(row)
    items.push({
      id, ...(entryId !== id && { entryId }), title: plain(row.subject), author: plain(row.author || '匿名用户'),
      replies: Math.max(0, Number(row.replies) || 0), time: Number(row.lastpost ?? row.postdate) || 0,
    })
  }
  const perPage = Number(data.__T__ROWS_PAGE) || 35
  const total = Number(data.__ROWS ?? data.__F?.total_topics)
  const hasNext = total > 0 ? page * perPage < total : items.length >= perPage
  return { items, page, hasNext }
}

export function normalizeThread(data, id, page) {
  if (!data.__R || !data.__T) throw new ReaderError('NGA_RESPONSE', '帖子不存在，或当前账号无法读取。', 404)
  const users = data.__U ?? {}
  const perPage = Number(data.__R__ROWS_PAGE) || 20
  const actualPage = Number(data.__PAGE) || page
  const posts = Object.values(data.__R).filter(Boolean).map((r, index) => {
    const floor = Number(r.lou ?? ((actualPage - 1) * perPage + index))
    const uid = r.authorid ?? (floor === 0 ? data.__T.authorid : undefined)
    const user = users[uid]
    const nick = typeof user === 'string' ? user : user?.username
    const byTopicAuthor = floor === 0 || (uid != null && String(uid) === String(data.__T.authorid))
    const author = r.author || nick || (byTopicAuthor ? data.__T.author : undefined)
    const pid = Number(r.pid) || 0
    return {
      id: pid, pid, floor, ...postAuthor(author, uid),
      time: Number(r.postdatetimestamp ?? r.postdate) || 0, blocks: contentBlocks(r.content, r.attachs),
    }
  })
  const rows = Math.max(Number(data.__ROWS) || 0, (Number(data.__T.replies) || 0) + 1)
  return { id, title: plain(data.__T.subject), posts, page: actualPage, pages: Math.max(actualPage, Math.ceil(rows / perPage)) }
}

export function verifyReply(result) {
  const { payload, status, text } = result
  // 只认发布回执字段或纯文本回执，避免把回显的用户正文当成成功提示。
  const resultMessage = payload?.error ?? payload?.data?.error ?? payload?.data?.__MESSAGE ?? payload?.__MESSAGE ?? payload?.data?.[0]
  const reported = payload ? messages(resultMessage) : /^\s*[:：]?[^<>{}\n]{1,120}\s*$/u.test(text) ? [text] : []
  if (status >= 200 && status < 300 && reported.some(msg => /^\s*[:：]?\s*(?:发[帖贴]|回[帖贴]|回复)(?:完毕|成功)(?:[，,！!。.\s]|$)/.test(msg))) return
  const error = problem(payload)
  if (error || status === 403) throw new ReaderError('REPLY_REFUSED', error || 'NGA 拒绝了这次回复，请检查账号与主题权限。', 422)
  throw new ReaderError('REPLY_UNKNOWN', unconfirmedReplyMessage, 502)
}

export function createNga(transport = request) {
  async function fetchDirectory() {
    // 首页目录是公开数据。不同安装和账号读取同一份分类，无需携带登录令牌。
    const result = await transport('/app_api.php', { __lib: 'home', __act: 'category', _v: '2', __output: '11', __inchst: 'UTF8' }, {})
    return normalizeDirectory(requireData(result))
  }
  const passport = fields => transport('/nuke.php', {}, { __lib: 'login', __output: '8', __inchst: 'UTF-8', ...fields }, true)
  // NGA 有时以 HTTP 200 返回半截 JSON。只在读请求的格式异常时换格式，保留当前账号的可见范围。
  async function readPage(path, query, account, accepts, label) {
    let status
    for (const output of ['11', '8', '10']) {
      const result = await transport(path, { ...query, __output: output, __inchst: 'UTF8', ...(output === '10' && { lite: 'xml' }) }, authFields(account))
      status = result.status
      try {
        const data = requireData(result, Boolean(account))
        if (accepts(data)) return data
      } catch (error) {
        if (error.code !== 'NGA_FORMAT') throw error
      }
    }
    throw new ReaderError('NGA_FORMAT', 'NGA 没有返回完整的' + label + '（HTTP ' + status + '），请稍后重试。', 502)
  }
  const topicsPage = (page, account, ref) => readPage('/thread.php', { [ref.kind]: ref.id, page }, account,
    d => (d.__T && typeof d.__T === 'object') || Number(d.__T__ROWS ?? -1) === 0, '帖子列表')
  return {
    directory: fetchDirectory,
    async beginLogin() {
      const result = await passport({ __act: 'qrlogin_gen' })
      const data = requireData(result)
      const pair = String(data[0] || '').split(',')
      if (pair.length !== 2 || pair.some(key => !/^[\w-]{12,128}$/.test(key))) throw new ReaderError('LOGIN_FAILED', '无法生成登录二维码。', 502)
      return { key: pair[0], secret: pair[1], url: origin + '/nuke.php?__lib=login&__act=qrlogin_ui&qrkey=' + encodeURIComponent(pair[0]) }
    },
    async pollLogin(ticket) {
      const result = await passport({ __act: 'login', app_id: '5004', device: '', v2: '1', qrkey: ticket.key, hiddenkey: ticket.secret })
      if (/未找到登录许可/.test(problem(result.payload))) return null
      const data = requireData(result)
      const entries = Object.values(data).map(value => typeof value === 'string' && value.trim().startsWith('{') ? parseBody(value) : value)
      const user = entries.find(value => value?.uid && value?.token) ?? {}
      const uid = String(user.uid ?? data[1] ?? '')
      const token = String(user.token ?? data[2] ?? '')
      if (!/^\d+$/.test(uid) || !/^[\w.+/=-]{8,512}$/.test(token)) throw new ReaderError('LOGIN_FAILED', 'NGA 没有返回有效的登录凭据。', 502)
      return { uid, token, name: plain(user.username || 'UID ' + uid) }
    },
    async favorites(account) {
      // 收藏版面与收藏帖子是两个接口。这里只使用查询操作，合集优先取 stid。
      for (const output of ['11', '8']) {
        const result = await transport('/nuke.php', { __lib: 'forum_favor2', __act: 'forum_favor', __output: output, __inchst: 'UTF8' },
          { action: 'get', ...authFields(account) })
        checkResponse(result, true)
        const data = result.payload?.data
        if (!data || typeof data !== 'object') continue
        if (data[0] === null && Object.keys(data).length === 1) return []
        const rows = data[0] != null && !forumRow(data[0]) ? data[0] : data
        const items = forumRows(rows)
        if (items) return items
      }
      throw new ReaderError('NGA_FORMAT', 'NGA 没有返回完整的收藏版面列表。', 502)
    },
    async searchBoards(keyword, account) {
      const data = await readPage('/forum.php', { key: keyword }, account, d => forumRows(d) !== null, '版面搜索结果')
      return forumRows(data)
    },
    async resolveBoard(ref, account) {
      const data = await topicsPage(1, account, ref)
      const f = data.__F
      const name = ref.kind === 'stid'
        ? (String(f?.set_topic_tid) === ref.id && f.set_topic_subject) || f?.sub_forums?.['t' + ref.id]?.[1]
        : f?.name
      return forum(ref.kind, ref.id, plain(name || '') || ref.name)
    },
    async list(page, account, ref = board) {
      return normalizeList(await topicsPage(page, account, ref), page)
    },
    async thread(id, page, account) {
      const visited = new Set()
      while (!visited.has(id) && visited.size < 4) {
        visited.add(id)
        const query = { tid: id, page }
        let data
        try {
          data = await readPage('/read.php', query, account, d => {
            if (!d.__T || typeof d.__T !== 'object') return false
            if (d.__R && typeof d.__R === 'object') return true
            const target = targetTid(d.__T)
            return target && target !== id
          }, '帖子正文')
        } catch (error) {
          if (error.code !== 'NGA_FORMAT') throw error
        }
        if (data) {
          const target = targetTid(data.__T)
          if (target && target !== id) { id = target; continue }
          return normalizeThread(data, id, page)
        }
        // 三种结构化格式都损坏时，网页版的原始 BBCode 仍可能完整。
        const result = await transport('/read.php', { ...query, noBBCode: '', __inchst: 'UTF8' }, authFields(account))
        checkResponse(result, Boolean(account))
        const thread = parseThreadHtml(result.text, id, page)
        if (thread) return thread
        throw new ReaderError('NGA_FORMAT', 'NGA 没有返回完整的帖子正文（第 ' + page + ' 页，HTTP ' + result.status + '），请稍后重试。', 502)
      }
      throw new ReaderError('NGA_RESPONSE', 'NGA 返回的原帖链接无效，请刷新讨论索引后重试。', 502)
    },
    async reply(id, text, quote, account) {
      if (!account) throw new ReaderError('LOGIN_REQUIRED', '回帖前请先连接 NGA 账号。', 401)
      let content = text
      if (quote) {
        const target = quote.pid ? '[pid=' + quote.pid + ',' + id + ',' + quote.page + ']#' + quote.floor + '[/pid]' : '[tid=' + id + ']主楼[/tid]'
        const excerpt = quote.excerpt.replace(/[[\]<>]/g, '').slice(0, 160)
        content = '[quote]' + target + (excerpt ? '\n' + excerpt : '') + '[/quote]\n' + text
      }
      let result
      try {
        result = await transport('/post.php', { __inchst: 'UTF8', __output: '8' }, {
          ...authFields(account), action: 'reply', step: '2', tid: id, pid: quote?.pid || '0', post_content: content,
        })
      } catch {
        throw new ReaderError('REPLY_UNKNOWN', '连接中断，发送结果未确认。请刷新帖子核对后再决定是否重发。', 502)
      }
      verifyReply(result)
      return { sent: true }
    },
  }
}
