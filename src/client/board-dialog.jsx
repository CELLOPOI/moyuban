import React, { useContext, useEffect, useRef, useState } from 'react'
import { ReadingOptions } from './preferences.jsx'

export function BoardDialog({ library, site, onClose }) {
  const dialog = useRef(null), pending = useRef(null)
  const [value, setValue] = useState(''), [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const { openOnPick } = useContext(ReadingOptions)
  useEffect(() => {
    dialog.current.showModal()
    return () => pending.current?.abort()
  }, [])
  function close() { pending.current?.abort(); onClose() }
  async function findOrOpen(selected) {
    const input = value.trim()
    if (!input || busy) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true); setError(''); setNotice('')
    try {
      const data = selected ? { board: selected } : await library.findBoards(site.id, input, controller.signal)
      if (controller.signal.aborted) return
      const ref = data.board
      if (ref) {
        const result = await library.open(ref, controller.signal)
        if (controller.signal.aborted) return
        if (result.settings.openOnPick) close()
        else setNotice('已加入工作区，可以继续查找。')
      } else {
        setResults(data.boards)
      }
    } catch (err) { if (!controller.signal.aborted) setError(err.message) }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <dialog ref={dialog} className="ngar-dialog ngar-board-dialog" aria-label="打开其他版面" onCancel={close}>
    <div className="ngar-dialog-head"><h2>打开其他版面</h2><button type="button" onClick={close} aria-label="关闭版面窗口">×</button></div>
    <form onSubmit={event => { event.preventDefault(); void findOrOpen() }}>
      <label>{site.inputLabel || '版面名称、链接或编号'}<input autoFocus value={value} maxLength={2048} disabled={busy} placeholder={site.inputHint}
        onChange={event => { setValue(event.target.value); setResults(null); setError('') }} /></label>
      <button type="submit" className="ngar-btn" disabled={!value.trim() || busy}>{busy ? '正在读取…' : openOnPick ? '查找并打开' : '查找版面'}</button>
    </form>
    {results && (results.length ? <ul aria-label="版面搜索结果">{results.map(item => <li key={item.sessionId}>
      <button type="button" disabled={busy} onClick={() => void findOrOpen(item)}>{item.name}<small>{item.kind}={item.id}</small></button>
    </li>)}</ul> : <p role="status">没有找到匹配的版面，可以粘贴版面链接打开。</p>)}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </dialog>
}
