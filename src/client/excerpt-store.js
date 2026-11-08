const empty = () => ({ rows: [], batch: -1, run: '', generation: null, more: true, loading: false, refreshing: false, refreshError: '', refreshErrorCode: '', error: '', errorCode: '',
  query: '', selected: '', note: null, noteError: '', noteErrorCode: '', media: false, index: 0, large: false,
  discussion: null, commentLoading: false, commentError: '', login: '', loginBusy: false, accountError: '' })

// 推荐、正文和阅读位置只在当前阅读端的内存里。标签地址不包含标题、上游链接或账号。
export function excerptStore(api, broadcast = () => {}) {
  let state = empty(), epoch = 0, selection = 0, anchor, restore, poll, loginSeq = 0
  const listeners = new Set()
  function set(patch) {
    state = { ...state, ...patch }
    for (const fn of listeners) fn()
  }
  function reset(generation) {
    ++epoch; ++selection; ++loginSeq
    clearTimeout(poll)
    anchor = null
    set({ ...empty(), generation })
  }
  function acceptError(error, field) {
    if (error.code === 'ACCOUNT_CHANGED') { reset(null); activate(); return }
    set({ [field]: error.message, ...(['error', 'noteError', 'refreshError'].includes(field) ? { [field + 'Code']: error.code } : {}) })
  }
  async function check() {
    const n = epoch, previous = state.generation
    try {
      const { generation } = await api('feedStatus')
      if (n !== epoch) return
      if (previous !== null && state.generation !== generation) { reset(generation); await load() }
      else if (state.generation === null) set({ generation })
    } catch { /* 数据请求会给出可重试的状态。 */ }
  }
  async function load() {
    if (state.loading || !state.more || state.loginBusy || state.login) return
    const n = epoch, batch = state.batch + 1, run = state.run
    set({ loading: true, error: '', errorCode: '', refreshError: '', refreshErrorCode: '' })
    try {
      const data = await api('homeFeed', { run, batch })
      if (n !== epoch) return
      if ((run && run !== data.run) || (state.generation !== null && state.generation !== data.generation)) { reset(data.generation); return load() }
      const known = new Set(state.rows.map(x => x.id))
      set({ run: data.run, generation: data.generation, rows: [...state.rows, ...data.items.filter(row => !known.has(row.id))], batch, more: data.more })
    } catch (e) { if (n === epoch) acceptError(e, 'error') }
    finally { if (n === epoch) set({ loading: false }) }
  }
  function activate() { void check(); if (state.batch < 0 && !state.error) void load() }
  function close(focus = true) {
    ++selection
    set({ selected: '', note: null, noteError: '', noteErrorCode: '', media: false, large: false, index: 0, discussion: null, commentError: '', commentLoading: false })
    if (focus && anchor) restore?.(anchor, true)
  }
  async function select(id) {
    const n = ++selection
    set({ selected: id, note: null, noteError: '', noteErrorCode: '', media: false, large: false, index: 0, discussion: null, commentLoading: false, commentError: '' })
    try {
      const note = await api('feedNote', { run: state.run, id })
      if (n === selection && note.id === id) set({ note })
    } catch (error) { if (n === selection) acceptError(error, 'noteError') }
  }
  async function comments() {
    if (state.commentLoading || state.discussion?.more === false) return
    const n = selection, prior = state.discussion, batch = prior ? prior.batch + 1 : 0
    set({ commentLoading: true, commentError: '' })
    try {
      const result = await api('feedComments', { run: state.run, id: state.selected, batch })
      const seen = new Set(prior?.items.map(x => x.id))
      if (n === selection) set({ discussion: { ...result, items: [...(prior?.items ?? []), ...result.items.filter(c => !seen.has(c.id))] } })
    } catch (e) { if (n === selection) acceptError(e, 'commentError') }
    finally { if (n === selection) set({ commentLoading: false }) }
  }
  function conceal() { if (state.media) set({ media: false, large: false }) }
  async function connect() {
    if (state.loginBusy || state.login || state.refreshing) return
    const seq = ++loginSeq
    conceal()
    set({ loginBusy: true, accountError: '' })
    let ticket
    try {
      ;({ ticket } = await api('feedLogin'))
      if (seq !== loginSeq) { await api('feedCancel', { ticket }).catch(() => {}); return }
      set({ login: ticket, loginBusy: false })
      async function tick() {
        try {
          const result = await api('feedPoll', { ticket })
          if (seq !== loginSeq) return
          if (result.pending) poll = setTimeout(tick, 1250)
          else { reset(result.generation); broadcast(); void load() }
        } catch (e) { if (seq === loginSeq) set({ login: '', accountError: e.message }) }
      }
      void tick()
    } catch (e) { if (seq === loginSeq) set({ login: '', loginBusy: false, accountError: e.message }) }
  }
  async function cancelLogin() {
    const ticket = state.login
    ++loginSeq; clearTimeout(poll)
    set({ login: '', loginBusy: false })
    if (ticket) await api('feedCancel', { ticket }).catch(() => {})
  }
  async function logout() {
    const generation = state.generation
    reset(null)
    try { await api('feedLogout', { generation }); reset(''); broadcast(); void load() }
    catch (e) { set({ accountError: e.message }); void check() }
  }
  async function refresh() {
    if (state.loading || state.loginBusy || state.login) return false
    const n = epoch
    set({ loading: true, refreshing: true, refreshError: '', refreshErrorCode: '' })
    try {
      const data = await api('feedRefresh', { run: state.run, generation: state.generation })
      if (n !== epoch) return false
      ++epoch; ++selection; anchor = null
      set({ ...empty(), run: data.run, generation: data.generation, batch: data.batch, more: data.more, rows: data.items, query: state.query })
      return true
    } catch (e) { if (n === epoch) acceptError(e, 'refreshError'); return false }
    finally { if (n === epoch) set({ loading: false, refreshing: false }) }
  }
  return {
    snapshot: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    activate, load, check, select, comments, close, conceal, connect, cancelLogin, logout, refresh,
    filter: query => set({ query }), remember: (id, offset) => { anchor = { id, offset } },
    onRestore(fn) { restore = fn; return () => { if (restore === fn) restore = null } },
    reveal() { if (state.note) set({ media: true, large: false }) },
    zoom() { if (state.media) set({ large: !state.large }) },
    step(delta) {
      if (state.media && state.note?.type === 'normal') set({ index: Math.max(0, Math.min(state.note.images.length - 1, state.index + delta)) })
    },
    dispose() { void cancelLogin(); reset(null); listeners.clear() },
  }
}
