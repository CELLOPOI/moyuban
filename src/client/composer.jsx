import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AccountDialog } from './account.jsx'
import { ReplyToolbar } from './reply-toolbar.jsx'
import { BoardDialog } from './board-dialog.jsx'
import { CategoryCards } from './directory.jsx'
import { SettingsDialog } from './settings.jsx'
import { DirectoryEditor } from './directory-editor.jsx'

export function BoardComposer({ reader, board, directoryBlank, library, back }) {
  const state = useSyncExternalStore(reader.subscribe, reader.snapshot)
  const catalog = useSyncExternalStore(library.subscribe, library.snapshot)
  const [accountOpen, setAccountOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false), [status, setStatus] = useState('')
  const input = useRef(null)
  const { id, draft, sending } = state
  const { site } = reader
  const { reply, quote, login } = site.capabilities
  const lookup = site.capabilities.lookup
  async function sync() {
    setStatus('正在同步收藏版面…')
    try {
      const result = await library.sync(site.id)
      setStatus(result.warning || '已同步 ' + result.favoriteCount + ' 个收藏版面。')
    } catch (error) { setStatus(error.message) }
  }
  async function remove() {
    try { await library.remove(board); setStatus('已移除手动入口。') }
    catch (error) { setStatus(error.message) }
  }
  useEffect(() => { if (draft.quote) input.current?.focus({ preventScroll: true }) }, [draft.quote])
  useEffect(() => { if (directoryBlank) reader.activate() }, [directoryBlank, reader])
  return <div className="ngar ngar-composer-seat">
    {directoryBlank && <CategoryCards site={site} library={library} />}
    <div className="ngar-composer">
      {Boolean(id) && quote && draft.quote && <div className="ngar-target"><span>引用 {draft.quote.floor ? draft.quote.floor + ' 楼' : '主楼'} · {draft.quote.excerpt}</span>
        <button type="button" disabled={sending} aria-label="取消引用" onClick={() => reader.draft({ quote: null })}>×</button></div>}
      {!board.kind ? lookup && <button type="button" className="ngar-entry-input" onClick={() => setBoardOpen(true)}>查找版面…</button> : id ? <textarea ref={input}
        aria-label={reply ? '回帖草稿' : '本地草稿'} placeholder={reply ? '写一条回复…' : '写下本地草稿…'} maxLength={8000} value={draft.text}
        disabled={sending || !state.thread} onChange={event => reader.draft({ text: event.target.value })} /> :
        <input aria-label="筛选本页讨论" placeholder="查找本页讨论…" value={state.query} onChange={event => reader.filter(event.target.value)} />}
      <ReplyToolbar key={id} state={state} reader={reader} input={input} back={back} connect={() => setAccountOpen(true)}
        browseBoards={library.browse} openBoards={lookup ? () => setBoardOpen(true) : null} openSettings={() => setSettingsOpen(true)}
        editDirectory={site.id === 'tieba' && site.capabilities.editDirectory ? () => setDirectoryOpen(true) : null}
        syncBoards={sync} removeBoard={catalog.manual.includes(board.sessionId) ? remove : null}
        entryOnly={!board.kind} warning={catalog.warnings?.[site.id]} />
    </div>
    {status && <p className="ngar-library-status" role="status">{status}</p>}
    {accountOpen && login && <AccountDialog reader={reader} account={state.account} onClose={() => setAccountOpen(false)} onChange={async () => {
      setAccountOpen(false)
      try { await library.accountChanged(site) } catch (error) { setStatus(error.message) }
    }} />}
    {boardOpen && lookup && <BoardDialog library={library} site={site} onClose={() => setBoardOpen(false)} />}
    {settingsOpen && <SettingsDialog library={library} onClose={() => setSettingsOpen(false)} />}
    {directoryOpen && <DirectoryEditor library={library} onClose={() => setDirectoryOpen(false)} />}
  </div>
}
