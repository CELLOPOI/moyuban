import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { defaults, sections } from '../shared/settings.js'

function DirectoryChooser({ workspace, value, onPick, onClose }) {
  const [path, setPath] = useState(value || undefined), [listing, setListing] = useState(null), [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setListing(null); setError('')
    workspace.listDirectory(path, controller.signal).then(result => {
      if (!controller.signal.aborted) setListing(result)
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message) })
    return () => controller.abort()
  }, [workspace, path])
  return <div className="ngar-folder-picker" role="group" aria-label="选择宿主目录">
    {listing && <>
      <nav aria-label="目录路径">{listing.crumbs.map(crumb => <button type="button" key={crumb.path}
        disabled={crumb.path === listing.path} onClick={() => setPath(crumb.path)}>{crumb.name}</button>)}</nav>
      <div className="ngar-folder-list">{listing.entries.map(dir => <button type="button" key={dir.path}
        onClick={() => setPath(dir.path)}>{dir.name}</button>)}</div>
      <button type="button" className="ngar-setting-button" onClick={() => onPick(listing.path)}>选择此目录</button>
    </>}
    {error ? <p role="alert">{error}　也可以直接输入宿主上的路径。</p> : !listing && <p role="status">正在读取目录…</p>}
    {error && path && <button type="button" onClick={() => setPath(undefined)}>回到主目录</button>}
    {error && <button type="button" className="ngar-setting-button" onClick={async () => {
      try { const dir = await workspace.pickDirectory(); if (dir) onPick(dir) }
      catch (reason) { setError(reason.message) }
    }}>系统目录选择器</button>}
    <button type="button" className="ngar-setting-button" onClick={onClose}>取消</button>
  </div>
}

export function ReaderSettings({ library }) {
  const source = library.preferences
  const current = useSyncExternalStore(source.subscribe, source.snapshot)
  const [base, setBase] = useState(null), [draft, setDraft] = useState(null), [folder, setFolder] = useState('')
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { void source.load(true) }, [source])
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(base?.values)
  useEffect(() => {
    if (current.revision && !dirty) { setBase(current); setDraft(current.values) }
  }, [current, dirty])
  const change = (key, value) => { setDraft(previous => ({ ...previous, [key]: value })); setMessage('') }
  async function reload() {
    await source.load(true)
    const latest = source.snapshot()
    if (latest.revision) { setBase(latest); setDraft(latest.values) }
    setFolder(''); setMessage('')
  }
  async function browse(field) {
    const native = window.__DSH_DIRECTORY_PICKER__
    if (!native?.pick) { setFolder(field); return }
    try { const path = await native.pick(); if (path) change(field, path) }
    catch { setFolder(field) }
  }
  async function save(event) {
    event.preventDefault()
    setBusy(true); setMessage('')
    try {
      const result = await source.save(draft, base.revision)
      setBase(result); setDraft(result.values); setFolder('')
      setMessage('已保存。')
      try { await library.syncSettings() }
      catch (error) { setMessage('设置已保存，工作区暂未刷新。' + error.message) }
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  if (!draft) return <p className="ngar-hint" role="status">{current.warning || '正在读取设置…'}
    {current.warning && <button onClick={reload}>重新读取</button>}</p>
  return <form className="ngar ngar-settings" aria-label="阅读设置" onSubmit={save}>
    <label className="ngar-config-file">配置文件<input aria-label="配置文件路径" readOnly value={base.path} onFocus={event => event.target.select()} /></label>
    {current.warning && <p role="alert">{current.warning}</p>}
    {sections.map(([group, fields]) => <fieldset key={group} disabled={busy}><legend>{group}</legend>
      {fields.map(field => {
        const key = field.key, id = 'ngar-pref-' + key
        return <div key={key} className={'ngar-pref' + (field.path ? ' ngar-pref-path' : '')}>
          <label htmlFor={id}>{field.label}</label>
          {field.path ? <>
            <div><input id={id} type="text" value={draft[key]} placeholder="使用 DSH 默认目录" onChange={event => change(key, event.target.value)} />
              <button type="button" className="ngar-setting-button" onClick={() => void browse(key)}>浏览…</button></div>
            <small>当前使用 {key === 'cacheDirectory' ? base.cachePath : base.boardPath}</small>
            {folder === key && <DirectoryChooser workspace={library.workspace} value={draft[key]} onClose={() => setFolder('')}
              onPick={path => { change(key, path); setFolder('') }} />}
          </> : field.choices ? <select id={id} value={draft[key]} onChange={event => change(key, event.target.value)}>
            {field.choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}
          </select> : field.min !== undefined ? <input id={id} type="number" min={field.min} max={field.max} step="1" required
            value={draft[key]} onChange={event => change(key, event.target.value === '' ? '' : Number(event.target.value))} /> :
            <input id={id} type="checkbox" checked={draft[key]} onChange={event => change(key, event.target.checked)} />}
          {field.hint && <small>{field.hint}</small>}
        </div>
      })}
    </fieldset>)}
    <div className="ngar-settings-actions"><button type="submit" className="ngar-setting-button" disabled={busy || (!dirty && !current.warning)}>保存设置</button>
      <button type="button" className="ngar-setting-button" disabled={busy} onClick={() => void reload()}>重新读取</button>
      <button type="button" className="ngar-setting-button" disabled={busy} onClick={() => { setDraft({ ...defaults }); setMessage('保存后恢复默认设置。') }}>恢复默认</button>
      <span role="status">{message}</span></div>
  </form>
}

export function SettingsDialog({ library, onClose }) {
  const ref = useRef(null)
  useEffect(() => { ref.current.showModal() }, [])
  return <dialog ref={ref} className="ngar ngar-dialog ngar-settings-dialog" aria-label="阅读设置" onCancel={onClose}>
    <div className="ngar-dialog-head"><h2>阅读设置</h2><button type="button" aria-label="关闭阅读设置" onClick={onClose}>×</button></div>
    <ReaderSettings library={library} />
  </dialog>
}
