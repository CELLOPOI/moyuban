import { defaults } from '../shared/settings.js'

export function preferences(api) {
  const listeners = new Set()
  let state = { values: defaults, path: '', warning: '', revision: null }, pending, version = 0
  function set(next) {
    state = next
    for (const notify of listeners) notify()
  }
  function invalidateReads() {
    ++version
    pending = undefined
  }
  function load(force = false) {
    if (!pending && (force || state.revision === null)) {
      const ticket = version
      pending = api('getSettings').then(next => { if (ticket === version) set(next) })
        .catch(error => { if (ticket === version) set({ ...state, warning: error.message }) })
        .finally(() => { if (ticket === version) pending = undefined })
    }
    return pending ?? Promise.resolve()
  }
  return {
    snapshot: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }, load,
    async save(values, revision) {
      invalidateReads()
      const result = await api('saveSettings', { values, revision })
      // 窗口可能在保存期间重新获得焦点，届时发出的读取也可能带回旧配置。
      invalidateReads()
      set(result)
      return result
    },
  }
}
