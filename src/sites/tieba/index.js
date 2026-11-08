import { createHash } from 'node:crypto'
import { positive, ReaderError } from '../../shared/errors.js'
import { floorReplies, imageUrl, plainText, postOf, webUrl } from './content.js'
import { forum } from './forum.js'
import { tiebaDirectory } from './directory.js'
import { tiebaAccount } from './account.js'
import { followedBoards } from './follows.js'

const origin = 'https://tieba.baidu.com'
const shapeError = () => new ReaderError('TIEBA_RESPONSE', '贴吧没有返回可阅读的内容，请稍后重新读取。', 502)
const wrongInput = () => new ReaderError('INVALID_INPUT', '请输入吧名，或粘贴含 kw 的贴吧主页链接。')
function boardKey(board) {
  if (board?.kind !== 'bar' || board.sessionId !== forum(board.id)?.sessionId) throw wrongInput()
  return board.id
}
function parseInput(value) {
  if (typeof value !== 'string' || !value.trim()) throw wrongInput()
  const input = value.trim()
  if (/^(?:[a-z][a-z0-9+.-]*:|(?:www\.|tieba\.baidu\.com(?:\/|$))|\/\/)/i.test(input)) {
    const url = webUrl(/^tieba\.baidu\.com\//i.test(input) ? 'https://' + input : input)
    const kw = url?.searchParams.get('kw')
    if (!url || url.hostname !== 'tieba.baidu.com' || url.port || !/^\/f\/?$/.test(url.pathname) || !forum(kw)) throw wrongInput()
    return { name: kw.trim(), exact: true }
  }
  if (!forum(input) || /[/\\?#]/.test(input)) throw wrongInput()
  return { name: input, exact: false }
}

// 请求贴吧网页自身的只读入口；站点校验或访问受限时不改用带账号的请求。
async function publicJson(fetchPage, url, options) {
  try {
    const response = await fetchPage(url, { ...options, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15_000) })
    if (!response.ok) {
      await response.body?.cancel()
      if ([401, 403, 429].includes(response.status)) throw new ReaderError('TIEBA_ACCESS', '贴吧暂时限制了这次访问，请稍后重新读取。', 502)
      throw shapeError()
    }
    const chunks = []
    let size = 0
    for await (const chunk of response.body) {
      if ((size += chunk.length) > 8 * 1024 * 1024) throw shapeError()
      chunks.push(chunk)
    }
    const raw = Buffer.concat(chunks).toString('utf8')
    // 百度也会以 HTTP 200 返回验证页，只识别 HTML 标题，以免把帖子正文当成验证提示。
    if (/^\s*</.test(raw) && /<title\b[^>]*>\s*百度安全验证\s*<\/title>/i.test(raw.slice(0, 8192))) {
      throw new ReaderError('TIEBA_RESTRICTED', '百度要求安全验证，暂时无法读取贴吧内容。', 403)
    }
    return JSON.parse(raw)
  } catch (error) {
    if (error instanceof ReaderError) throw error
    throw shapeError()
  }
}

async function request(fetchPage, path, query) {
  const url = new URL(path, origin)
  url.search = new URLSearchParams(query)
  const result = await publicJson(fetchPage, url)
  const code = result?.errno ?? result?.no
  if (path === '/mg/p/getPbData' && Number(code) === 320036) {
    throw new ReaderError('TIEBA_THREAD_FORMAT', '贴吧网页接口不支持读取这篇帖子。', 502)
  }
  if (Number(code) === 340000) throw new ReaderError('BOARD_NOT_FOUND', '没找到这个吧，请检查吧名。', 404)
  if (code == null || Number(code) !== 0 || !result?.data) {
    if (typeof result?.errmsg === 'string' && result.errmsg.trim()) throw new ReaderError('TIEBA_ACCESS', '贴吧：' + result.errmsg.slice(0, 120), 502)
    throw shapeError()
  }
  return result.data
}

async function threadPage(fetchPage, id, page) {
  try {
    return await request(fetchPage, '/mg/p/getPbData', { kz: id, pn: page })
  } catch (error) {
    if (error.code !== 'TIEBA_THREAD_FORMAT') throw error
  }
  // 网页端的 320036 也会出现在读帖请求。客户端的楼层查询接受签名表单，可匿名读取同一页。
  const form = new URLSearchParams({ kz: id, pn: page, rn: 30 })
  form.sort()
  const signed = [...form].map(([key, value]) => key + '=' + value).join('') + 'tiebaclient!!!'
  form.set('sign', createHash('md5').update(signed).digest('hex').toUpperCase())
  const data = await publicJson(fetchPage, new URL('/c/f/pb/page', origin), { method: 'POST', body: form })
  if (String(data?.error_code) !== '0') throw new ReaderError('TIEBA_RESPONSE', '贴吧未能提供这篇帖子的内容。', 502)
  const users = new Map()
  for (const user of Array.isArray(data.user_list) ? data.user_list : []) if (user?.id != null) users.set(String(user.id), user)
  if (Array.isArray(data.post_list)) {
    for (const post of data.post_list) if (post && !post.author) post.author = users.get(String(post.author_id))
  }
  return data
}

function pageOf(data, asked) {
  const page = Number(data.page?.current_page), total = Number(data.page?.total_page)
  if (page !== asked || !Number.isSafeInteger(total) || total < 0 || page > Math.max(total, 1)) throw shapeError()
  return { page, pages: Math.max(1, total) }
}
const validId = id => /^[1-9]\d*$/.test(String(id)) && Number.isSafeInteger(Number(id))

export function tiebaSite(fetchPage = fetch) {
  const get = (path, query) => request(fetchPage, path, query)
  const bar = (kw, pn) => get('/mg/f/getFrsData', { kw, pn })
  const nameOf = async name => {
    const data = await bar(name, 1)
    const ref = forum(data.forum?.name)
    if (!ref) throw shapeError()
    return ref
  }
  return {
    id: 'tieba', name: '百度贴吧', workspaceName: '百度贴吧', inputLabel: '吧名或贴吧主页链接',
    inputHint: '例如：linux、手办吧 或 https://tieba.baidu.com/f?kw=linux',
    topicId: id => positive(id, '帖子编号'), imageUrl,
    editableDirectory: tiebaDirectory,
    createAccount: grant => tiebaAccount(grant, fetchPage),
    followedBoards: (user, account) => followedBoards(user, fetchPage, account),
    async parseBoard(value) {
      const { name, exact } = parseInput(value)
      try { return await nameOf(name) } catch (error) {
        if (!exact && error.code === 'BOARD_NOT_FOUND' && name.length > 1 && name.endsWith('吧')) return nameOf(name.slice(0, -1))
        throw error
      }
    },
    resolveBoard: board => nameOf(boardKey(board)),
    async list({ board, page }) {
      const data = await bar(boardKey(board), page)
      if (forum(data.forum?.name)?.id !== board.id || (!Array.isArray(data.thread_list) && data.page?.total_num !== 0)) throw shapeError()
      const pagination = pageOf(data, page), seen = new Set(), items = []
      for (const row of data.thread_list ?? []) {
        const id = Number(row.tid || row.id)
        if (!validId(id) || seen.has(id)) continue
        seen.add(id)
        const title = plainText(row.title) || plainText(row.abstract?.[0]?.text).slice(0, 120) || '帖子 ' + id
        items.push({ id, title, author: plainText(row.author?.name_show || row.author?.name) })
      }
      return { page, hasNext: page < pagination.pages && Number(data.page.has_more ?? 1) !== 0, items }
    },
    async thread({ board, id, page }) {
      const data = await threadPage(fetchPage, id, page)
      if (Number(data.thread?.id) !== id || forum(data.forum?.name)?.id !== boardKey(board) || !Array.isArray(data.post_list)) throw shapeError()
      const pagination = pageOf(data, page)
      const posts = data.post_list.filter(post => validId(post?.id) && validId(post?.floor))
      const head = posts.find(post => post.floor === 1)
      const title = plainText(data.thread.title || head?.title || posts.find(post => post.title)?.title?.replace(/^回复[：:]\s*/, ''))
      return { id, title, ...pagination, posts: posts.map(postOf) }
    },
    async replies({ id, postId, page }) {
      const data = await get('/mo/q/flr', { kz: id, pid: positive(postId, '楼层编号'), pnum: page })
      if (typeof data.floor_html !== 'string') throw shapeError()
      return { ...pageOf(data, page), items: floorReplies(data.floor_html) }
    },
  }
}
