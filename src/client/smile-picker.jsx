import React, { useLayoutEffect, useRef, useState } from 'react'
import { IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { Smile } from './smile.jsx'

const pageSize = 20

export function SmilePicker({ editor, site, insert, position }) {
  const { smileGroups, smileUrl } = editor
  const [pack, setPack] = useState(() => smileGroups.find(group => group.id === position.current.pack) ?? smileGroups[0])
  const [page, setPage] = useState(position.current.page)
  const box = useRef(null)
  const pages = Math.ceil(pack.faces.length / pageSize)
  useLayoutEffect(() => {
    const el = box.current
    el.scrollTop = position.current.page * el.clientHeight
  }, [pack, position])
  function go(next) {
    const el = box.current
    if (!el) return
    el.scrollTop = Math.max(0, Math.min(pages - 1, next)) * el.clientHeight
    const index = Math.round(el.scrollTop / el.clientHeight)
    position.current = { pack: pack.id, page: index }
    setPage(index)
  }
  function switchPack(id) {
    position.current = { pack: id, page: 0 }
    setPack(smileGroups.find(group => group.id === id))
    if (box.current) box.current.scrollTop = 0
    setPage(0)
  }
  function keys(event) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5, PageUp: -pageSize, PageDown: pageSize }[event.key]
    if (!step) return
    const faces = [...box.current.querySelectorAll('button')]
    const index = faces.indexOf(event.target)
    if (index < 0) return
    event.preventDefault()
    faces[Math.max(0, Math.min(faces.length - 1, index + step))].focus()
  }
  return <div className="ngar-face-picker">
    <select aria-label="表情分组" value={pack.id} onChange={event => switchPack(event.target.value)}>
      {smileGroups.map(group => <option key={group.id} value={group.id}>{group.label} · {group.faces.length}</option>)}
    </select>
    <div className="ngar-face-scroll" ref={box} onKeyDown={keys} aria-label={pack.label + '表情'}
      onScroll={event => {
        const el = event.currentTarget
        if (!el.clientHeight) return
        const next = Math.min(pages - 1, Math.round(el.scrollTop / el.clientHeight))
        position.current = { pack: pack.id, page: next }
        setPage(next)
      }}>
      {Array.from({ length: pages }, (_, index) => <div className="ngar-face-page" key={pack.id + index}>
        {pack.faces.slice(index * pageSize, (index + 1) * pageSize).map(face => <button key={face.code} type="button"
          title={face.name} aria-label={face.name} onClick={() => insert(face.code)}>
          <Smile site={site} url={smileUrl(face.code)} label="" /><span>{face.name}</span>
        </button>)}
      </div>)}
    </div>
    <nav className="ngar-face-pager" aria-label="表情翻页"><button type="button" aria-label="上一页表情" disabled={!page} onClick={() => go(page - 1)}><IconChevronLeftOutlineRegular size={15} /></button>
      <span aria-live="polite">{page + 1} / {pages}</span>
      <button type="button" aria-label="下一页表情" disabled={page >= pages - 1} onClick={() => go(page + 1)}><IconChevronRightOutlineRegular size={15} /></button></nav>
  </div>
}
