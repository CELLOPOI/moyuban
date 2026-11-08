import { readingPrefix } from '../shared/boards.js'
import { requireReplyReceipt } from '../shared/errors.js'
import { appearanceChoices, defaults, readingAppearance } from '../shared/settings.js'
const blank = () => ({ text: '', quote: null })

export function clearStoredReading(storage, sessionId, memoryKeys = []) {
  const prefix = readingPrefix(sessionId)
  // 旧版面的前缀也是其他版面的公共前缀，只移除它自己的阅读键。
  const readingKey = /^(?:nav|page|draft|scroll|expanded)\.(?:live|example)(?:\.|$)/
  try {
    const keys = new Set(Array.from(memoryKeys, key => prefix + key))
    for (let index = 0; index < storage.length; index++) keys.add(storage.key(index))
    for (const key of keys) {
      if (key?.startsWith(prefix) && readingKey.test(key.slice(prefix.length))) storage.removeItem(key)
    }
  } catch (error) {
    if (error.name !== 'SecurityError') throw error
  }
}

export function createReader(request, storage, board, site, settings = defaults) {
  if (!site || board.site !== site.id) throw new Error('Reader site does not match its board')
  const prefix = readingPrefix(board.sessionId)
  const entryOnly = !board.kind
  const { capabilities } = site
  const api = (action, fields, signal) => request(action, { ...fields, site: site.id, board: board.sessionId }, signal)
  const memory = new Map()
  let retired = false
  function read(key, fallback) {
    if (memory.has(key)) return memory.get(key)
    try { return JSON.parse(storage.getItem(prefix + key)) ?? fallback } catch { return fallback }
  }
  function write(key, value) {
    if (retired) return
    memory.set(key, value)
    try {
      if (value === null) storage.removeItem(prefix + key)
      else storage.setItem(prefix + key, JSON.stringify(value))
    } catch { /* 存储空间不足时，当前窗口仍保留草稿。 */ }
  }
  const listeners = new Set()
  const sending = new Set()
  let listVersion = 0
  let threadVersion = 0
  let accountVersion = 0
  let initialized = false
  // 原有真实阅读记录沿用 live 键。旧示例编号可能与真实帖子重合。
  const initialNav = read('nav.live', {})
  let state = {
    listPage: initialNav.listPage || 1, id: initialNav.id || 0, page: initialNav.page || 1,
    targetId: initialNav.targetId || 0,
    list: null, thread: null, listError: '', threadError: '', notice: '', noticeError: false, query: '',
    account: { connected: false }, loadingList: false, loadingThread: false, sending: false, draft: blank(),
    appearance: readingAppearance(read('appearance', null), settings),
  }
  const set = patch => { state = { ...state, ...patch }; for (const notify of listeners) notify() }
  const draftKey = id => 'draft.live.' + id
  const draftOf = id => read(draftKey(id), null) || blank()
  function clearSentDraft(key, submitted) {
    if (retired) return
    const sent = JSON.stringify(submitted)
    if (memory.has(key) && JSON.stringify(memory.get(key)) !== sent) return
    // 先释放本窗口的已发送副本，再核对其他标签页可能已改写的持久草稿。
    memory.delete(key)
    if (JSON.stringify(read(key, null)) === sent) write(key, null)
  }
  // 入口编号定位草稿和阅读位置，读写使用适配器给出的原帖编号。
  const saveNav = () => write('nav.live', { listPage: state.listPage, id: state.id, targetId: state.targetId, page: state.page })
  const current = id => !retired && state.id === id

  async function loadList(page = state.listPage) {
    const version = ++listVersion
    set({ listPage: page, list: null, listError: '', loadingList: true, ...(page !== state.listPage && { query: '' }) })
    saveNav()
    try {
      const list = await api('topics', { mode: 'live', page })
      if (version === listVersion) {
        set({ list, loadingList: false })
        // 索引可能比正文晚到，按新发现的原帖编号修正正在读取的目标。
        if (state.targetId === state.id && list.items?.some(item => item.entryId === state.id)) {
          void open(state.id, state.page, { keepNotice: true })
        }
      }
    } catch (error) {
      if (version === listVersion) set({ listError: error.message, loadingList: false })
    }
  }

  async function open(id, page, { keepNotice = false } = {}) {
    const version = ++threadVersion
    page ??= read('page.live.' + id, 1)
    const item = state.list?.items?.find(row => (row.entryId ?? row.id) === id)
    const targetId = item?.id ?? ((state.id === id && state.targetId) || id)
    set({ id, targetId, page, thread: null, threadError: '', loadingThread: true, draft: draftOf(id),
      sending: sending.has(draftKey(id)), ...(keepNotice ? {} : { notice: '' }) })
    saveNav()
    try {
      const thread = await api('thread', { mode: 'live', id: targetId, page })
      if (version === threadVersion) {
        set({ thread, targetId: thread.id, page: thread.page, loadingThread: false })
        write('page.live.' + id, thread.page)
        saveNav()
      }
    } catch (error) {
      if (version === threadVersion) set({ threadError: error.message, loadingThread: false })
    }
  }

  async function syncAccount() {
    if (!capabilities.login || capabilities.followed) return
    const version = ++accountVersion
    try {
      const account = await api('account')
      if (version === accountVersion) set({ account })
    } catch (error) {
      if (version === accountVersion) set({ notice: error.message, noticeError: true })
    }
  }

  function reload() {
    const { id, page, targetId } = state
    const listing = loadList()
    if (!id) return listing
    if (targetId) return open(id, page, { keepNotice: true })
    // 老导航只记入口编号。先从原列表找出原帖，避免在索引返回前向跨版入口读写。
    const version = ++threadVersion
    set({ loadingThread: true, draft: draftOf(id) })
    return listing.then(() => {
      if (version === threadVersion && current(id)) return open(id, page, { keepNotice: true })
    })
  }
  function showList() {
    ++threadVersion
    set({ id: 0, targetId: 0, page: 1, thread: null, loadingThread: false, threadError: '', draft: blank(), sending: false, notice: '' })
    saveNav()
  }
  function draft(patch) {
    if (!state.id) return
    const value = { ...state.draft, ...patch }
    write(draftKey(state.id), value.text || value.quote ? value : null)
    set({ draft: value })
  }
  async function submit() {
    const { id, draft: original, thread } = state
    const key = draftKey(id)
    if (!capabilities.reply || !thread || !original.text.trim() || sending.has(key)) return
    sending.add(key)
    set({ sending: true, notice: '', noticeError: false })
    try {
      const result = await api('reply', { mode: 'live', id: thread.id, text: original.text, quote: capabilities.quote ? original.quote : null, requestId: crypto.randomUUID() })
      requireReplyReceipt(result)
      clearSentDraft(key, original)
      if (!current(id)) return
      set({ draft: draftOf(id), notice: site.name + ' 已确认回帖。', noticeError: false })
      void loadList()
      let page = result.page
      if (!page) {
        try { page = (await api('thread', { mode: 'live', id: thread.id, page: 1 })).pages } catch { page = thread.pages }
      }
      if (current(id)) await open(id, page, { keepNotice: true })
    } catch (error) {
      if (current(id)) set({ notice: error.message, noticeError: true })
    } finally {
      sending.delete(key)
      if (current(id)) set({ sending: false })
    }
  }
  return {
    site, api,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    snapshot: () => state,
    clearReading(clearStorage = true) {
      retired = true
      ++listVersion; ++threadVersion; ++accountVersion
      try {
        if (clearStorage) clearStoredReading(storage, board.sessionId, memory.keys())
      } finally {
        memory.clear()
        set({ id: 0, targetId: 0, list: null, thread: null, draft: blank(), sending: false })
      }
    },
    activate() {
      void syncAccount()
      if (!initialized && !entryOnly) { initialized = true; return reload() }
    },
    invalidateAccount() {
      ++accountVersion; ++listVersion; ++threadVersion
      initialized = false
      set({ list: null, thread: null, listError: '', threadError: '', notice: '', account: { connected: false },
        loadingList: false, loadingThread: false })
    },
    reload, loadList, open, showList, draft, submit,
    setAppearance(key, value) {
      if (!Object.hasOwn(appearanceChoices, key) || !appearanceChoices[key].includes(value)) return
      const next = { ...state.appearance, [key]: value }
      write('appearance', next)
      set({ appearance: next })
    },
    filter: query => set({ query }),
    expanded(id, page, next) {
      const key = 'expanded.live.' + id + '.' + page
      if (next === undefined) return read(key, [])
      write(key, next)
    },
    async authChanged() {
      await syncAccount()
      if (entryOnly) return
      initialized = true
      reload()
    },
    scroll(id, page, top) {
      const key = 'scroll.live.' + id + '.' + page
      if (top === undefined) return read(key, 0)
      write(key, Math.round(top))
    },
  }
}
