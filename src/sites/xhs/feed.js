import { randomUUID } from 'node:crypto'
import { ReaderError } from '../../shared/errors.js'
import { openLogin, openSource } from './browser.js'
import { noteId } from './content.js'

const changed = () => new ReaderError('ACCOUNT_CHANGED', '来源账号已变更，请重新读取索引。', 409)
const expired = () => new ReaderError('FEED_EXPIRED', '这批索引已结束，请重新打开索引。', 409)
const invalid = () => new ReaderError('INVALID_INPUT', '条目或批次编号无效。')
const publicCard = ({ id, title, author, type }) => ({ id, title, author, type })

// 一个宿主只驱动一个首页。批次按序保留在内存，两个阅读端重试同一批不会额外滚动官网。
export function createFeed(grant, { source = openSource, login = openLogin } = {}) {
  let run, ticket, queue = Promise.resolve(), idle, loginTimer, disposed = false
  const stop = obj => obj?.close().catch(() => {})
  async function reset() {
    const previous = run
    run = null
    clearTimeout(idle)
    await stop(previous?.source)
  }
  async function cancel() {
    const old = ticket
    ticket = null
    clearTimeout(loginTimer)
    await stop(old?.window)
  }
  function serial(fn) {
    const result = queue.then(async () => {
      if (disposed) throw expired()
      try { return await fn() } catch (e) {
        if (e instanceof ReaderError) throw e
        throw new ReaderError('SOURCE_UNAVAILABLE', '来源没有响应，请稍后重新读取。', 502)
      }
    })
    queue = result.catch(() => {})
    return result
  }
  async function readGrant() {
    try { return await grant.read() }
    catch { throw new ReaderError('ACCOUNT_UNAVAILABLE', 'DSH 未能读取来源登录状态，请重新打开 DSH 后再试。', 503) }
  }
  const generation = async () => (await readGrant())?.generation ?? ''
  async function assertOwner(r) {
    if (disposed || run !== r) throw expired()
    if (r.generation !== await generation()) { await reset(); throw changed() }
  }
  function touch() {
    clearTimeout(idle)
    idle = setTimeout(() => { void serial(reset).catch(() => {}) }, 25 * 60_000)
    idle.unref?.()
  }
  async function openRun(user) {
    return { id: randomUUID(), generation: user?.generation ?? '', source: await source(user),
      cards: new Map(), batches: [], notes: new Map(), comments: new Map() }
  }
  async function getRun(body, create = false) {
    const user = await readGrant()
    if (run && run.generation !== (user?.generation ?? '')) {
      await reset()
      if (!create) throw changed()
    }
    if (create && !run) run = await openRun(user)
    if (!run || (!create && body.run !== run.id)) throw expired()
    touch()
    return run
  }
  function cardFor(r, id) {
    if (!noteId(id) || !r.cards.has(id)) throw invalid()
    return r.cards.get(id)
  }
  async function readBatch(r, i, verify) {
    if (!Number.isSafeInteger(i) || i < 0 || i > r.batches.length || (i && !r.batches[i - 1].more)) throw invalid()
    if (!r.batches[i]) {
      const items = []
      let more = true
      // 首页 HTML 和接口有时返回同一批卡片，只有新增标题才算续读成功。
      for (let attempt = 0; !items.length && more && attempt < 3; attempt++) {
        const page = i === 0 && attempt === 0 ? await r.source.home() : await r.source.next()
        await verify(r)
        for (const card of page.items) if (!r.cards.has(card.id)) { r.cards.set(card.id, card); items.push(publicCard(card)) }
        more = page.more
      }
      if (!items.length && more) throw new ReaderError('NO_NEW_ITEMS', '来源暂时没有新增条目。', 503)
      if (!i && !items.length) throw new ReaderError('HOME_EMPTY', '小红书首页没有返回可读的推荐，请稍后刷新。', 503)
      r.batches.push({ items, more: more && r.cards.size < 3000 })
    }
    await verify(r)
    return { run: r.id, generation: r.generation, batch: i, ...r.batches[i] }
  }
  async function freshBatch({ generation: expectedOwner, run: previousId }) {
    const user = await readGrant(), owner = user?.generation ?? ''
    if (run && run.generation !== owner) await reset()
    if (expectedOwner != null && expectedOwner !== owner) throw changed()
    // 另一阅读端刚刷新过时，两边复用新索引，避免互相废弃对方的游标。
    if (previousId && run && previousId !== run.id) { touch(); return readBatch(run, 0, assertOwner) }
    async function verify() {
      if (disposed) throw expired()
      if (owner !== await generation()) { await reset(); throw changed() }
    }
    let next
    try {
      next = await openRun(user)
      const page = await readBatch(next, 0, verify)
      const previous = run
      run = next; touch()
      await stop(previous?.source)
      return page
    } catch (error) {
      await stop(next?.source)
      await verify()
      throw error
    }
  }
  async function act(action, body) {
    if (action === 'feedStatus') return { generation: await generation() }
    if (action === 'feedLogin') {
      await cancel()
      const before = await generation()
      ticket = { id: randomUUID(), before, window: await login() }
      loginTimer = setTimeout(() => { void serial(cancel).catch(() => {}) }, 180000)
      loginTimer.unref?.()
      return { ticket: ticket.id }
    }
    if (action === 'feedPoll' || action === 'feedCancel') {
      if (!ticket || body.ticket !== ticket.id) throw new ReaderError('LOGIN_CLOSED', '扫码已结束。', 409)
      if (action === 'feedCancel') { await cancel(); return {} }
      try {
        const result = await ticket.window.check()
        if (!result) return { pending: true }
        const before = ticket.before, next = randomUUID()
        await grant.save(current => {
          if ((current?.generation ?? '') !== before) throw changed()
          return { cookies: result.cookies, generation: next }
        })
        await cancel(); await reset()
        return { generation: next }
      } catch (error) { await cancel(); throw error }
    }
    if (action === 'feedLogout') {
      if (body.generation !== await generation()) throw changed()
      await cancel(); await grant.clear(); await reset()
      return { generation: '' }
    }
    if (action === 'feedRefresh') return freshBatch(body)
    const first = action === 'homeFeed' && body.batch === 0 && !body.run
    const r = await getRun(body, first)
    if (action === 'feedRestart') { await reset(); return {} }
    if (action === 'homeFeed') {
      try { return await readBatch(r, body.batch, assertOwner) }
      catch (error) {
        // 首批还未交付时不保留故障页面，下一次重试用新会话；续批失败则保留原索引。
        if (first && run === r && !r.batches.length) await reset()
        throw error
      }
    }
    const card = cardFor(r, body.id)
    if (action === 'feedNote') {
      const note = r.notes.get(card.id) ?? await r.source.detail(card)
      await assertOwner(r)
      if (note?.id !== card.id) throw invalid()
      r.notes.set(card.id, note)
      return { id: note.id, title: note.title || card.title, author: note.author || card.author, body: note.body, type: note.type,
        images: note.images.map(i => ({ width: i.width, height: i.height, available: Boolean(i.url) })),
        video: Boolean(note.video), commentCount: note.commentCount }
    }
    if (action === 'feedComments') {
      if (!r.notes.has(card.id)) throw invalid()
      const pages = r.comments.get(card.id) ?? []
      const i = body.batch
      if (!Number.isSafeInteger(i) || i < 0 || i > pages.length || (i && !pages[i - 1].more)) throw invalid()
      if (!pages[i]) {
        const cursor = pages.at(-1)?.cursor || ''
        const res = await r.source.comments(card, cursor)
        await assertOwner(r)
        pages.push({ ...res, more: Boolean(res.more && res.cursor && res.cursor !== cursor) })
        r.comments.set(card.id, pages)
      }
      await assertOwner(r)
      return { items: pages[i].items, more: pages[i].more, batch: i }
    }
    throw invalid()
  }
  return {
    action: (action, body) => serial(() => act(action, body)),
    attachment: (body, kind, index) => serial(async () => {
      const r = await getRun(body), note = r.notes.get(body.id)
      const url = note && (kind === 'video' && index === '0' ? note.video :
        kind === 'image' && /^(0|[1-9]\d?)$/.test(index) ? note.images[Number(index)]?.url : null)
      if (!url) throw invalid()
      await assertOwner(r)
      return url
    }),
    async dispose() {
      disposed = true
      await queue
      await Promise.all([reset(), cancel()])
    },
  }
}

export const xhsSite = () => ({ id: 'xhs', name: '小红书', workspaceName: '资料摘录', createFeed })
