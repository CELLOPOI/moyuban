import React, { useEffect, useRef, useState } from 'react'

let nextId = 0
const row = (name = '', fields = {}) => ({ id: ++nextId, name, ...fields })
function draftOf(categories) {
  return categories.filter(c => !c.kind).map(c => row(c.name, { key: c.key, error: c.error,
    groups: c.groups.map(g => row(g.name, { boards: g.boards.map(b => row(b.name)) })) }))
}
const update = (rows, id, fields) => rows.map(r => r.id === id ? { ...r, ...fields } : r)
function move(rows, index, offset) {
  const next = [...rows]
  next.splice(index + offset, 0, ...next.splice(index, 1))
  return next
}

function RowActions({ what, rows, index, change }) {
  return <span className="ngar-row-actions">
    <button type="button" aria-label={'上移' + what} title={'上移' + what} disabled={index === 0} onClick={() => change(move(rows, index, -1))}>↑</button>
    <button type="button" aria-label={'下移' + what} title={'下移' + what} disabled={index === rows.length - 1} onClick={() => change(move(rows, index, 1))}>↓</button>
    <button type="button" aria-label={'删除' + what} onClick={() => change(rows.filter((_, i) => i !== index))}>删除</button>
  </span>
}

export function DirectoryEditor({ library, onClose }) {
  const dialog = useRef(null), source = library.directory('tieba')
  const [base, setBase] = useState(null), [rows, setRows] = useState([]), [selected, select] = useState(null)
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const active = rows.find(r => r.id === selected) ?? rows[0]
  function changeCategory(fields) { setRows(update(rows, active.id, fields)) }
  function changeGroup(group, fields) { changeCategory({ groups: update(active.groups, group.id, fields) }) }
  async function reload() {
    setBusy(true)
    try {
      await source.load()
      const state = source.snapshot()
      if (state.error) throw new Error(state.error)
      setBase(state); setRows(draftOf(state.categories)); select(null); setMessage('')
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  useEffect(() => { dialog.current.showModal(); void reload() }, [])
  async function save(event) {
    event.preventDefault()
    setBusy(true); setMessage('')
    try {
      const categories = rows.map(c => ({ key: c.key, name: c.name, groups: c.error ? null :
        c.groups.map(g => ({ name: g.name, boards: g.boards.map(b => b.name) })) }))
      await library.saveDirectory(categories, base.revision)
      onClose()
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  function newCategory() {
    const next = row('', { groups: [] })
    setRows([...rows, next]); select(next.id)
  }
  return <dialog ref={dialog} className="ngar ngar-dialog ngar-directory-editor" aria-label="编辑选吧目录"
    onCancel={event => { if (busy) event.preventDefault(); else onClose() }}>
    <div className="ngar-dialog-head"><h2>编辑选吧目录</h2><button type="button" aria-label="关闭目录编辑器" disabled={busy} onClick={onClose}>×</button></div>
    {base && <p className="ngar-directory-path">分类文件保存在 <code>{base.path}</code></p>}
    <form onSubmit={save}><fieldset disabled={!base || busy}>
      <div className="ngar-editor-row">
        <select aria-label="选择普通分类" value={active?.id ?? ''} onChange={e => select(Number(e.target.value))}>
          {!rows.length && <option value="">暂无普通分类</option>}
          {rows.map(c => <option value={c.id} key={c.id}>{c.name ? c.name + '.ts' : '未命名分类'}</option>)}
        </select>
        <button type="button" onClick={newCategory}>新建分类</button>
      </div>
      {active && <div key={active.id}>
        <div className="ngar-editor-row"><label>分类文件名<input value={active.name} required onChange={e => changeCategory({ name: e.target.value })} /></label><span>.ts</span>
          <RowActions what="分类" rows={rows} index={rows.indexOf(active)} change={setRows} /></div>
        {active.error ? <p role="alert">{active.error} 请在文件中修正后重新读取。</p> : <>
          {active.groups.map((group, index) => <div key={group.id} className="ngar-editor-group">
            <div className="ngar-editor-row"><label>分组名称<input required value={group.name}
              onChange={e => changeGroup(group, { name: e.target.value })} /></label>
              <RowActions what="分组" rows={active.groups} index={index} change={groups => changeCategory({ groups })} /></div>
            {group.boards.map((board, i) => <div className="ngar-editor-row" key={board.id}>
              <input aria-label={'吧名 ' + (i + 1)} placeholder="吧名" required value={board.name}
                onChange={e => changeGroup(group, { boards: update(group.boards, board.id, { name: e.target.value }) })} />
              <RowActions what="吧条目" rows={group.boards} index={i} change={boards => changeGroup(group, { boards })} />
            </div>)}
            <button type="button" onClick={() => changeGroup(group, { boards: [...group.boards, row()] })}>添加吧</button>
          </div>)}
          <button type="button" onClick={() => changeCategory({ groups: [...active.groups, row('', { boards: [] })] })}>新建分组</button>
        </>}
      </div>}
    </fieldset>
    {message && <p role="alert">{message}</p>}
    <div className="ngar-editor-footer"><button type="button" disabled={busy} onClick={reload}>重新读取文件</button>
      <button type="button" disabled={busy} onClick={onClose}>取消</button>
      <button type="submit" disabled={busy || !base}>保存目录</button></div></form>
  </dialog>
}
