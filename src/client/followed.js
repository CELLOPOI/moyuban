// 关注列表只在当前右栏的内存中使用。每一次账号变更都会使在途结果失效。
export function followedDirectory(api) {
  const listeners = new Set()
  let state = { phase: 'idle', boards: [] }, version = 0, checking = false
  const set = next => { state = next; for (const fn of listeners) fn() }
  function clear(phase = 'idle') { ++version; set({ phase, boards: [] }) }
  async function open(prompt = true) {
    clear('loading')
    const id = version
    try {
      const account = await api('account')
      if (id !== version) return
      if (!account.connected) { set({ phase: prompt ? 'login' : 'signedOut', boards: [] }); return }
      set({ phase: 'loading', account, boards: [] })
      const result = await api('followedBoards', { generation: account.generation })
      if (id === version && result.generation === account.generation) set({ phase: 'ready', account, boards: result.boards })
    } catch (error) {
      if (id !== version) return
      if (error.code === 'LOGIN_REQUIRED') {
        if (state.account) set({ phase: 'reauth', account: state.account, boards: [] })
        else set({ phase: prompt ? 'login' : 'signedOut', boards: [] })
        return
      }
      set({ phase: 'error', account: error.code === 'ACCOUNT_CHANGED' ? null : state.account, boards: [], error: error.message })
    }
  }
  async function check() {
    if (checking || !['ready', 'error', 'signedOut', 'reauth'].includes(state.phase)) return
    const id = version
    checking = true
    try {
      const current = await api('account')
      if (id === version && (current.generation || '') !== (state.account?.generation || '')) await open(false)
    } catch (error) {
      if (id === version) { clear('error'); set({ ...state, error: error.message }) }
    } finally { checking = false }
  }
  async function logout(switching, changed) {
    clear('loading')
    const id = version
    try {
      await api('logout')
      changed()
      if (id === version) { if (switching) await open(true); else clear('signedOut') }
    } catch (error) { if (id === version) set({ phase: 'error', boards: [], error: error.message }) }
  }
  return { api, open, check, clear, logout, snapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) } }
}
