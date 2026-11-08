import React, { createContext, useEffect, useSyncExternalStore } from 'react'
import { defaults } from '../shared/settings.js'

export const ReadingOptions = createContext(defaults)

export function WithSettings({ source, children }) {
  const state = useSyncExternalStore(source.subscribe, source.snapshot)
  useEffect(() => { void source.load() }, [source])
  if (!state.revision) return <p className="ngar ngar-hint" role="status">{state.warning || '正在读取阅读设置…'}
    {state.warning && <button onClick={() => void source.load(true)}>重新读取</button>}</p>
  return <ReadingOptions.Provider value={state.values}>{children(state.values)}</ReadingOptions.Provider>
}
