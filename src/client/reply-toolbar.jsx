import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  IconPlusOutlineRegular, IconChevronLeftOutlineRegular, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular,
  IconCheckOutlineRegular, IconLinkOutlineRegular, IconLoadingOutlineRegular, IconAgentPresetOutlineRegular,
  IconFlatListOutlineRegular, IconRefreshOutlineRegular, MenuSurface, PermissionIconFullAccessRegular,
  PermissionIconReadOnlyRegular, PermissionIconWorkspaceWriteRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { appearanceChoices } from '../shared/settings.js'
import { SmilePicker } from './smile-picker.jsx'
import { ngaEditor } from '../sites/nga/editor.js'

const editors = new Map([['nga-bbcode', ngaEditor]])

const labels = { options: '会话选项', permission: '权限模式', face: '表情', link: '插入链接', image: '插入图片链接', picker: '模型与思考强度', model: '模型', effort: '思考强度' }
const isUrl = pane => pane === 'link' || pane === 'image'
const isModel = pane => ['picker', 'model', 'effort'].includes(pane)
const permissionIcons = { '完全权限': PermissionIconFullAccessRegular, '仅可查看': PermissionIconReadOnlyRegular, '工作区内修改': PermissionIconWorkspaceWriteRegular }
const firstMenuButton = el => el.querySelector('[aria-checked="true"]:not(:disabled)') ?? el.querySelector('select:not(:disabled),input:not(:disabled),button:not(:disabled)')

function Tool({ label, children, ...props }) {
  return <button type="button" className="ngar-tool" aria-label={label} title={label} {...props}>{children}</button>
}

function LineIcon({ face }) {
  return <svg className="ngar-line-icon" width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
    {face ? <><circle cx="9" cy="9" r="6.6" /><path d="M6 10.5q3 3.8 6 0M6.5 6.5h.4m4.2 0h.4" /></> :
      <><rect x="2.5" y="3" width="13" height="12" rx="2" /><circle cx="6.5" cy="7" r="1" /><path d="m4 13 3.5-3 2 1.5 2.5-3 3 3" /></>}
  </svg>
}

export function ReplyToolbar({ state, reader, input, back, connect, browseBoards, openBoards, openSettings, editDirectory, syncBoards, removeBoard, entryOnly, warning }) {
  const { id, account } = state
  const { site } = reader
  const caps = site.capabilities
  const primary = entryOnly ? openBoards && { label: '打开其他版面', icon: IconFlatListOutlineRegular, onClick: openBoards } :
    id ? { label: '讨论索引', icon: IconFlatListOutlineRegular, onClick: reader.showList } :
      { label: '刷新内容', icon: IconRefreshOutlineRegular, onClick: reader.reload }
  return <ReadingToolbar input={input} back={back} appearance={state.appearance} setAppearance={reader.setAppearance}
    primary={primary} reply={id && caps.reply ? { state, reader, connect } : null} options={item => <>
      {Boolean(id) && item('讨论索引', reader.showList)}
      {!entryOnly && item('刷新内容', reader.reload)}
      {!entryOnly && item('浏览版面目录', browseBoards)}
      {openBoards && item(site.inputLabel ? '按' + site.inputLabel + '查找…' : '按名称、链接或编号查找…', openBoards)}
      {item('阅读设置…', openSettings)}
      {editDirectory && item('编辑选吧目录…', editDirectory)}
      {caps.favorites && account.connected && item('同步收藏版面', syncBoards)}
      {removeBoard && item('删除手动版面及本地阅读记录', removeBoard)}
      {warning && <p className="ngar-menu-note" role="status">{warning}</p>}
      <hr />{caps.login && !caps.followed && item(account.connected ? '账号 · ' + account.name : '连接 ' + site.name + ' 账号', connect)}
      {item('返回工作对话', back)}
    </>} />
}

export function ReadingToolbar({ input, back, appearance, setAppearance, primary, options, reply }) {
  const { state, reader, connect } = reply ?? {}
  const { draft, sending, account } = state ?? {}
  const site = reader?.site, editor = editors.get(site?.editor)
  const PrimaryIcon = primary?.icon
  const [pane, setPane] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const bar = useRef(null), popup = useRef(null), trigger = useRef(null)
  const range = useRef([0, 0]), restore = useRef(null)
  const facePosition = useRef({ pack: editor?.smileGroups[0]?.id, page: 0 })
  const disabled = sending || !state?.thread
  const needLogin = site?.capabilities.replyRequiresLogin && !account.connected
  const sendLabel = reply && '回帖到 ' + site.name
  const PermissionIcon = permissionIcons[appearance.permission]

  function close(focus = false) {
    setPane(''); setError('')
    if (focus) trigger.current?.focus({ preventScroll: true })
  }
  function open(next, event) {
    if (pane === next || (isModel(pane) && next === 'picker')) { close(true); return }
    trigger.current = event.currentTarget
    const field = input.current
    if (field) range.current = [field.selectionStart, field.selectionEnd]
    const selected = field?.value.slice(...range.current).trim() ?? ''
    setUrl((next === 'image' && editor?.imageUrl(selected)) || (next === 'link' && editor?.linkUrl(selected)) ? selected : '')
    setError(''); setPane(next)
  }
  function edit(kind, value, selection = range.current) {
    if (disabled || !input.current) return
    const next = editor.editReply(draft.text, selection, kind, value)
    if (next.error) { setError(next.error); return }
    restore.current = next.selection
    close()
    reader.draft({ text: next.text })
  }
  function wrap(kind) {
    const field = input.current
    if (field) edit(kind, '', [field.selectionStart, field.selectionEnd])
  }
  useLayoutEffect(() => {
    if (!restore.current || !input.current) return
    input.current.focus({ preventScroll: true })
    input.current.setSelectionRange(...restore.current)
    restore.current = null
  })
  useLayoutEffect(() => { if (pane && popup.current) firstMenuButton(popup.current)?.focus({ preventScroll: true }) }, [pane])
  useEffect(() => {
    if (!pane) return
    function outside(event) { if (!bar.current?.contains(event.target)) close() }
    function escape(event) {
      if (event.key !== 'Escape' || event.isComposing) return
      event.preventDefault(); event.stopPropagation()
      if (pane === 'model' || pane === 'effort') setPane('picker')
      else close(true)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true) }
  }, [pane])
  function arrows(event) {
    if (isUrl(pane) || pane === 'face' || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const buttons = [...popup.current.querySelectorAll('button:not(:disabled)')]
    if (!buttons.length) return
    event.preventDefault()
    const n = buttons.indexOf(document.activeElement)
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (n + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[index].focus()
  }
  const triggerProps = key => ({ 'aria-haspopup': isUrl(key) || key === 'face' ? 'dialog' : 'menu', 'aria-expanded': key === 'picker' ? isModel(pane) : pane === key, onClick: e => open(key, e) })
  const action = fn => () => { close(true); fn() }
  const item = (name, fn, selected, unavailable = false) => <button key={name} type="button" role={selected === undefined ? 'menuitem' : 'menuitemradio'}
    aria-checked={selected} disabled={unavailable} onClick={action(fn)}>{name}{selected && <IconCheckOutlineRegular size={14} />}</button>
  return <div className="ngar-tools" ref={bar}>
    <div className="ngar-tool-left">
      <Tool label="会话选项" className="ngar-add" {...triggerProps('options')}><IconPlusOutlineRegular size={16} /></Tool>
      <Tool label={'权限模式：' + appearance.permission} className="ngar-chip ngar-permission" {...triggerProps('permission')}>
        <PermissionIcon size={14} /><span>{appearance.permission}</span><IconChevronDownOutlineRegular size={12} />
      </Tool>
      {reply && editor && <div className="ngar-formats" role="group" aria-label="回帖工具">
        <Tool label="表情" disabled={disabled} {...triggerProps('face')}><LineIcon face /></Tool>
        <Tool label="加粗" disabled={disabled} onClick={() => wrap('bold')}><b aria-hidden="true">B</b></Tool>
        <Tool label="删除线" disabled={disabled} onClick={() => wrap('strike')}><s aria-hidden="true">S</s></Tool>
        <Tool label="引用文字" disabled={disabled} onClick={() => wrap('quote')}><span className="ngar-quote-glyph" aria-hidden="true">❝</span></Tool>
        <Tool label="插入链接" disabled={disabled} {...triggerProps('link')}><IconLinkOutlineRegular size={16} /></Tool>
        <Tool label="插入图片链接" disabled={disabled} {...triggerProps('image')}><LineIcon /></Tool>
      </div>}
      {primary && <Tool label={primary.label} disabled={primary.disabled} onClick={primary.onClick}><PrimaryIcon size={15} /></Tool>}
    </div>
    <div className="ngar-send">
      {reply && draft.text.trim() && <span className="ngar-send-note">{needLogin ? '连接账号后回帖' : sendLabel}</span>}
      <Tool label={'选择模型：' + appearance.model + '，思考强度 ' + appearance.effort} className="ngar-chip ngar-model" {...triggerProps('picker')}>
        <IconAgentPresetOutlineRegular className="ngar-model-icon" size={16} /><span>{appearance.model}</span><span className="ngar-effort">{appearance.effort}</span><IconChevronDownOutlineRegular size={12} />
      </Tool>
      {reply ? <Tool label={sendLabel} className="ngar-send-btn" aria-busy={sending} disabled={disabled || !draft.text.trim()}
        onClick={() => { close(); if (needLogin) connect(); else void reader.submit() }}>
        {sending ? <IconLoadingOutlineRegular size={16} /> : <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M8 15V2M2 8l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>}
      </Tool> :
        <Tool label="返回工作对话" className="ngar-round" onClick={back}><IconChevronLeftOutlineRegular size={15} /></Tool>}
    </div>
    {pane && <MenuSurface ref={popup} compact className={'ngar-menu' + (isModel(pane) ? ' ngar-menu-right' : '')}
      role={isUrl(pane) || pane === 'face' ? 'dialog' : 'menu'} aria-label={labels[pane]} onKeyDown={arrows}>
      {pane === 'options' && options(item)}
      {pane === 'face' && <SmilePicker editor={editor} site={site} position={facePosition} insert={code => edit('face', code)} />}
      {isUrl(pane) && <form className="ngar-url" onSubmit={e => { e.preventDefault(); edit(pane, url) }}>
        <label>{pane === 'image' ? site.name + ' 图片地址' : '链接地址'}<input value={url} onChange={e => { setUrl(e.target.value); setError('') }} placeholder="https://…" /></label>
        {error && <p role="alert">{error}</p>}<button type="submit" disabled={!url.trim()}>插入</button>
      </form>}
      {pane === 'picker' && ['model', 'effort'].map(key => <button key={key} role="menuitem" type="button" onClick={() => setPane(key)}>
        {labels[key]}<span>{appearance[key]}</span><IconChevronRightOutlineRegular size={12} />
      </button>)}
      {Object.hasOwn(appearanceChoices, pane) && <>
        {isModel(pane) && <button className="ngar-menu-back" type="button" role="menuitem" onClick={() => setPane('picker')}><IconChevronLeftOutlineRegular size={12} />{labels[pane]}</button>}
        {appearanceChoices[pane].map(choice => item(choice, () => setAppearance(pane, choice), appearance[pane] === choice))}
      </>}
    </MenuSurface>}
    {error && !isUrl(pane) && <span role="alert" className="ngar-tool-error">{error}</span>}
  </div>
}
