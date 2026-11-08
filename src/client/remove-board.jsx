import React, { useState, useSyncExternalStore } from 'react'
import { IconArchiveOutlineRegular, IconTrashOutlineRegular, MenuItemButton } from '@deepseek-ai/dsh-client-ui-primitives'
import { boardForSession } from '../shared/boards.js'

export function BoardRemoveAction({ sessionId, library, close }) {
  const catalog = useSyncExternalStore(library.subscribe, library.snapshot)
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const label = '删除手动版面及本地阅读记录'
  async function remove() {
    if (pending) return
    setPending(true); setError('')
    try { await library.remove(boardForSession(sessionId)); close?.() }
    catch (reason) { setError(reason.message) }
    finally { setPending(false) }
  }
  const Wrapper = close ? 'div' : 'span'
  return <Wrapper className="ngar-managed-action">
    {catalog.manual.includes(sessionId) && (close ?
      <MenuItemButton danger disabled={pending} icon={<IconTrashOutlineRegular size={14} />} onSelect={() => void remove()}>{label}</MenuItemButton> :
      <button type="button" className="ngar-remove" title={label} aria-label={label} disabled={pending} onClick={() => void remove()}>
        <IconArchiveOutlineRegular size={14} />
      </button>)}
    {error && <span role="alert" className="ngar-remove-error">{error}</span>}
  </Wrapper>
}

export function BoardRemoveMenu({ useMenuOpenState, ...props }) {
  const [, setOpen] = useMenuOpenState()
  return <BoardRemoveAction {...props} close={() => setOpen(false)} />
}
