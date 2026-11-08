import { boardForSession, legacyBoard, legacySite } from '../shared/boards.js'
import { positive, ReaderError, requireReplyReceipt } from '../shared/errors.js'
import { boardIn, readBoardAccount, unsupported } from './sites.js'

function topicId(value) {
  if ((typeof value === 'string' && value.length > 0 && value.length <= 256) ||
      (Number.isSafeInteger(value) && value > 0)) return value
  throw new ReaderError('INVALID_INPUT', '帖子编号无效。')
}

export function readingActions(sites) {
  const submissions = new Map()
  return async function run(action, body = {}) {
    const site = sites.forRequest(body)
    if (['homeFeed', 'feedNote', 'feedComments', 'feedStatus', 'feedLogin', 'feedPoll', 'feedCancel', 'feedLogout', 'feedRefresh', 'feedRestart'].includes(action)) {
      if (!site.feed) throw unsupported()
      return site.feed.action(action, body)
    }
    if (site.feed) throw unsupported()
    if (action === 'boardDirectory') {
      if (!site.directory) throw unsupported()
      if (site.directory.snapshot) return site.directory.snapshot()
      return { categories: await site.directory.read() }
    }
    if (action === 'saveBoardDirectory') {
      if (!site.directory?.save) throw unsupported()
      return site.directory.save(body.categories, body.revision)
    }
    if (action === 'account') {
      const user = await site.account?.read()
      return { connected: Boolean(user), name: user?.name ?? '', ...(site.info.capabilities.followed && { generation: user?.generation ?? '' }) }
    }
    if (action === 'followedBoards') {
      if (!site.info.capabilities.followed) throw unsupported()
      const user = await site.account.read()
      if (!user) throw new ReaderError('LOGIN_REQUIRED', '请扫码查看我关注的吧。', 401)
      const changed = () => new ReaderError('ACCOUNT_CHANGED', '百度账号已变更，请重新读取。', 409)
      if (body.generation !== user.generation) throw changed()
      const boards = await site.followedBoards(user, site.account)
      const current = await site.account.read()
      if (current?.generation !== user.generation || current?.uid !== user.uid) throw changed()
      return { boards, generation: current.generation }
    }
    if (['login', 'poll', 'cancelLogin', 'logout'].includes(action)) {
      if (!site.account?.[action]) throw unsupported()
      return site.account[action](body)
    }
    if (action === 'findBoards' || action === 'searchBoards') {
      const q = typeof body.query === 'string' ? body.query.trim() : ''
      if (!q || q.length > 2048) throw new ReaderError('INVALID_INPUT', '请输入有效的版面名称、链接或编号。')
      if (action === 'findBoards') {
        const board = await site.parseBoard?.(q)
        if (board) return { board: boardIn(site, board) }
      }
      if (!site.searchBoards) throw new ReaderError('INVALID_INPUT', '无法识别这个站点的版面入口。')
      if (q.length > 80) throw new ReaderError('INVALID_INPUT', '请输入不超过 80 个字的版面名称。')
      const results = await site.searchBoards(q, await site.account?.read())
      return { boards: results.map(row => boardIn(site, row)) }
    }
    if (!['topics', 'thread', 'replies', 'reply'].includes(action)) throw new ReaderError('NOT_FOUND', '操作不存在。', 404)
    if (body.mode !== 'live') throw new ReaderError('INVALID_INPUT', '请求缺少有效的站点来源，请重新打开版面。')
    const board = body.board === undefined && site.id === legacySite ? legacyBoard : boardForSession(body.board)
    if (!board?.kind) throw new ReaderError('INVALID_INPUT', '请选择要阅读的版面。')
    if (action === 'reply' && !site.reply) throw unsupported()
    const account = await readBoardAccount(site)
    const context = { board, account }
    if (action === 'topics') return site.list({ ...context, page: positive(body.page, '页码') })
    const id = (site.topicId ?? topicId)(body.id)
    if (action === 'thread') return site.thread({ ...context, id, page: positive(body.page, '页码') })
    if (action === 'replies') {
      if (!site.replies) throw unsupported()
      return site.replies({ ...context, id, postId: topicId(body.postId), page: positive(body.page, '页码') })
    }
    if (site.replyRequiresLogin && !account) {
      throw new ReaderError('LOGIN_REQUIRED', '回帖前请先连接 ' + site.name + ' 账号。', 401)
    }
    if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 8000) throw new ReaderError('INVALID_INPUT', '回复需包含 1 至 8000 个字符。')
    if (typeof body.requestId !== 'string' || !/^[\da-f-]{36}$/i.test(body.requestId)) throw new ReaderError('INVALID_INPUT', '发送编号无效。')
    if (body.quote != null && !site.quoteTarget) throw unsupported()
    const text = body.text.trim()
    const quote = body.quote == null ? null : site.quoteTarget(body.quote)
    const key = JSON.stringify([site.id, board.sessionId, account && site.account.id(account), id, body.requestId])
    const stamp = JSON.stringify([text, quote])
    const now = Date.now()
    for (const [key, item] of submissions) if (now - item.time > 600_000) submissions.delete(key)
    const previous = submissions.get(key)
    if (previous) {
      if (previous.stamp !== stamp) throw new ReaderError('REPLY_CONFLICT', '草稿已变更，请重新发送。', 409)
      return previous.result
    }
    const item = { stamp, time: Infinity }
    item.result = Promise.resolve().then(() => site.reply({ ...context, id, text, quote }))
      .then(requireReplyReceipt).finally(() => { item.time = Date.now() })
    submissions.set(key, item)
    return item.result
  }
}
