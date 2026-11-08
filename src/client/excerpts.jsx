import React, { useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, IconRefreshOutlineRegular, IconThinkOutlineRegular, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import { entryForSite, readingPrefix } from '../shared/boards.js'
import { readingAppearance } from '../shared/settings.js'
import { activityFor } from './activity.jsx'
import { ReadingOptions } from './preferences.jsx'
import { ReadingToolbar } from './reply-toolbar.jsx'
import { SettingsDialog } from './settings.jsx'

export const excerptAddress = 'dsh-resource://dsh-nga-reader/excerpts/preview.md'
export const excerptTab = { id: 'dsh-nga-reader-excerpt', kind: 'dsh-nga-reader-excerpt', patterns: [excerptAddress], title: () => '摘录.md' }
const useReader = source => useSyncExternalStore(source.subscribe, source.snapshot)
const appearanceKey = readingPrefix(entryForSite('xhs').sessionId) + 'appearance'

function ReadingStatus({ label }) {
  // RunningStatus 由聊天轮次内部使用；这里复用同一宿主版本的鲸尾素材和公开的文字动画。
  const whale = require.asset('plugins/@deepseek-ai/dsh-client-ui-chat/assets/running-whale%402x-06738fa29b2f.png')
  return <div className="ngar-reading-status" role="status" aria-label={label} style={{ '--ngar-whale': 'url("' + whale + '")' }}>
    <span className="ngar-reading-icon" aria-hidden="true"><IconThinkOutlineRegular size={14} /></span>
    <TextShimmer active>深度求索中</TextShimmer>
  </div>
}

export function ExcerptIndex({ source, open, refresh, mounted, sessionId }) {
  const state = useReader(source)
  const active = useSyncExternalStore(mounted.subscribe, mounted.getSnapshot) === sessionId
  const [expanded, setExpanded] = useState(true)
  const box = useRef(null), end = useRef(null), settle = useRef(null)
  useEffect(() => {
    if (!active) return
    source.activate()
    const check = () => { if (!document.hidden) void source.check() }
    const timer = setInterval(check, 6000)
    window.addEventListener('focus', check)
    return () => { clearInterval(timer); window.removeEventListener('focus', check); source.conceal() }
  }, [source, active])
  useLayoutEffect(() => {
    if (!active) return
    function adjust(anchor, focus) {
      settle.current?.()
      const el = box.current
      const row = Array.from(el.querySelectorAll('[data-note-id]')).find(node => node.dataset.noteId === anchor.id)
      if (!row) return
      const align = () => {
        if (!row.isConnected) return
        el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor.offset
      }
      align()
      const frame = requestAnimationFrame(() => { align(); if (focus) row.focus({ preventScroll: true }) })
      const observer = new ResizeObserver(align)
      observer.observe(el)
      const gestures = ['wheel', 'touchstart', 'pointerdown', 'keydown']
      const end = () => { cancelAnimationFrame(frame); observer.disconnect(); clearTimeout(timer); for (const name of gestures) el.removeEventListener(name, end) }
      const timer = setTimeout(end, 350)
      for (const name of gestures) el.addEventListener(name, end, { passive: true })
      settle.current = end
    }
    const off = source.onRestore(adjust)
    return () => { off(); settle.current?.() }
  }, [source, active])
  useLayoutEffect(() => {
    settle.current?.()
    if (box.current) box.current.scrollTop = 0
  }, [state.run])
  const query = state.query.trim().toLocaleLowerCase()
  useEffect(() => {
    if (!active || !expanded || query || state.error || state.loading || state.login || state.loginBusy ||
        !state.more || state.batch < 0 || !end.current) return
    let observing = true
    const observer = new IntersectionObserver(entries => {
      if (observing && entries.some(e => e.isIntersecting)) void source.load()
    }, { root: box.current, rootMargin: '0px 0px 40px' })
    observer.observe(end.current)
    return () => { observing = false; observer.disconnect() }
  }, [active, expanded, query, state.error, state.loading, state.login, state.loginBusy, state.more, state.batch, source])
  const rows = query ? state.rows.filter(x => (x.title + ' ' + x.author).toLocaleLowerCase().includes(query)) : state.rows
  const issue = state.refreshError || state.error, code = state.refreshError ? state.refreshErrorCode : state.errorCode
  const reconnect = code === 'LOGIN_REQUIRED' || (code === 'SOURCE_RESTRICTED' && state.generation === '')
  function pick(event, id) {
    source.remember(id, event.currentTarget.getBoundingClientRect().top - box.current.getBoundingClientRect().top)
    void source.select(id)
    open()
  }
  return <section className="ngar ngar-transcript" aria-label="阅读索引">
    <div className="ngar-prompt"><div className="ngar-bubble">整理一下最近的资料。</div></div>
    <button className="ngar-group" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      {expanded ? <IconChevronUpOutlineRegular size={14} /> : <IconChevronDownOutlineRegular size={14} />}
      <span>阅读索引</span><i /><span>{state.rows.length} 条记录</span></button>
    <div className="ngar-records ngar-excerpts" ref={box} aria-label="资料条目" hidden={!expanded}>
      {rows.map(row => {
        const { title, icon: Icon } = activityFor(row.id)
        return <button key={row.id} type="button" data-note-id={row.id} className="ngar-topic" aria-label={'预览：' + row.title}
          aria-current={state.selected === row.id || undefined} title={row.title} onClick={e => pick(e, row.id)}>
          <Icon size={14} /><span>{title}</span><i aria-hidden="true" /><span className="ngar-preview">{row.title}</span>
        </button>
      })}
      {!rows.length && !state.loading && !issue && <p className="ngar-hint">{query ? '没有匹配的条目。' : '暂无条目。'}</p>}
      <div ref={end} className="ngar-excerpt-end" aria-hidden="true" />
    </div>
    {issue && <p className="ngar-hint" role="alert">{state.refreshError && '刷新失败：'}{issue}{' '}
      {reconnect && <button disabled={Boolean(state.login || state.loginBusy || state.refreshing)} onClick={source.connect}>
        {state.generation ? '重新扫码（打开官网窗口）' : '连接来源（打开官网扫码窗口）'}</button>}
      {state.refreshError ? <button onClick={refresh}>重试刷新</button> : <>
        {code !== 'FEED_EXPIRED' && <button onClick={source.load}>{state.rows.length ? '重试续读' : '重试'}</button>}
        {(state.rows.length > 0 || code === 'FEED_EXPIRED') && <button onClick={refresh}>刷新推荐</button>}
      </>}</p>}
    {state.loading ? <ReadingStatus label={state.refreshing ? '正在刷新推荐' : '正在读取推荐'} /> :
      expanded && !state.error && !query && state.batch >= 0 && !state.more && <p className="ngar-hint">已到索引末尾。</p>}
  </section>
}

export function ExcerptComposer({ source, back, refresh, library }) {
  const state = useReader(source)
  const defaults = useContext(ReadingOptions), input = useRef(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [appearance, changeAppearance] = useState(() => {
    let saved
    try { saved = JSON.parse(window.localStorage.getItem(appearanceKey)) } catch {}
    return readingAppearance(saved, defaults)
  })
  function setAppearance(key, value) {
    const next = readingAppearance({ ...appearance, [key]: value }, defaults)
    changeAppearance(next)
    try { window.localStorage.setItem(appearanceKey, JSON.stringify(next)) } catch {}
  }
  const signing = state.login || state.loginBusy, busy = state.loading || Boolean(signing)
  return <div className="ngar ngar-composer-seat"><div className="ngar-composer">
    <input ref={input} aria-label="筛选已读条目" placeholder="查找索引中的条目…" value={state.query} onChange={e => source.filter(e.target.value)} />
    <ReadingToolbar input={input} back={back} appearance={appearance} setAppearance={setAppearance}
      primary={{ label: '刷新推荐', icon: IconRefreshOutlineRegular, onClick: refresh, disabled: busy }}
      options={item => <>
        {item('刷新推荐', refresh, undefined, busy)}
        {item('读取下一批', source.load, undefined, busy || !state.more || state.batch < 0 || state.errorCode === 'FEED_EXPIRED')}
        {item('阅读设置…', () => setSettingsOpen(true))}<hr />
        <p className="ngar-menu-note">小红书 · {state.generation === null ? '登录状态未确认' : state.generation ? '已连接' : '游客'}</p>
        {signing ? item('取消扫码', source.cancelLogin) :
          item(state.generation ? '换号扫码（打开官网窗口）' : '连接来源（打开官网扫码窗口）', source.connect, undefined, state.refreshing)}
        {!signing && state.generation && item('退出登录', source.logout)}
        {item('返回工作对话', back)}
      </>} />
    {(signing || state.accountError) && <div className="ngar-excerpt-options">
      {signing && <>请在官网窗口扫码。 <button onClick={source.cancelLogin}>取消扫码</button></>}
      {state.accountError && <span role="alert">{state.accountError}</span>}
    </div>}
  </div>{settingsOpen && <SettingsDialog library={library} onClose={() => setSettingsOpen(false)} />}</div>
}

export function OpenExcerptIndex({ open, sessionId }) {
  useEffect(() => { open(sessionId) }, [open, sessionId])
  return null
}

function Attachment({ source, state }) {
  const { note, run, index, large } = state, video = note.type === 'video'
  const [failed, setFailed] = useState(''), [retry, setRetry] = useState(0)
  const zone = useRef(null), start = useRef(null)
  const url = '/api/dsh-nga-reader.attachment?' + new URLSearchParams({ run, id: note.id, kind: video ? 'video' : 'image', index: String(index) })
  useEffect(() => { zone.current?.focus({ preventScroll: true }) }, [])
  function arrow(e) {
    if (video || e.altKey || e.ctrlKey || e.metaKey || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return
    e.preventDefault(); e.stopPropagation(); source.step(e.key === 'ArrowLeft' ? -1 : 1)
  }
  return <div className={'ngar-attachment' + (large ? ' is-large' : '')} ref={zone} tabIndex={-1} aria-label={video ? '视频附件' : '图片附件'} onKeyDown={arrow}>
    <div className="ngar-attachment-frame" onTouchStart={e => { start.current = [e.touches[0].clientX, e.touches[0].clientY] }}
      onTouchEnd={e => { if (!start.current || video) return; const dx = e.changedTouches[0].clientX - start.current[0]
        if (Math.abs(dx) > 45 && Math.abs(dx) > 1.5 * Math.abs(e.changedTouches[0].clientY - start.current[1])) source.step(dx < 0 ? 1 : -1)
        start.current = null }}>
      {failed === url || (!video && !note.images[index]?.available) ? <p role="status">附件暂时不可用。 <button onClick={() => { setFailed(''); setRetry(n => n + 1) }}>重试</button></p> :
        video ? <video key={url + retry} src={url} controls muted preload="none" playsInline disablePictureInPicture controlsList="nofullscreen noremoteplayback"
          onError={() => setFailed(url)} aria-label="播放视频附件" /> :
          <img key={url + retry} src={url} alt={'附件，第 ' + (index + 1) + ' 张'} onError={() => setFailed(url)} />}
    </div>
    <div className="ngar-excerpt-tools">
      {!video && <><button disabled={index === 0} onClick={() => source.step(-1)}>上一张</button>
        <span aria-live="polite">{index + 1} / {note.images.length}</span>
        <button disabled={index + 1 >= note.images.length} onClick={() => source.step(1)}>下一张</button></>}
      <button onClick={source.zoom}>{large ? '缩小' : '放大'}</button><button onClick={source.conceal}>收起附件</button>
    </div>
  </div>
}

function NoteBody({ source, state }) {
  const { note } = state
  const [discuss, setDiscuss] = useState(false)
  const isVideo = note.type === 'video', count = note.images.length
  return <>
    <div className="ngar-byline">{note.author}</div>
    {note.body && <p className="ngar-excerpt-body">{note.body}</p>}
    <div className="ngar-excerpt-section">
      {state.media ? <Attachment source={source} state={state} /> : (isVideo ? note.video : count > 0) ?
        <button aria-expanded={false} onClick={source.reveal}>›&ensp;{isVideo ? '查看附件（视频）' : '查看附件（' + count + ' 张）'}</button> :
        <span className="ngar-hint">{isVideo ? '来源没有提供可播放的视频。' : '没有可读取的附件。'}</span>}
    </div>
    <div className="ngar-excerpt-section"><button aria-expanded={discuss} onClick={() => {
      setDiscuss(!discuss); if (!discuss && !state.discussion) void source.comments()
    }}>{discuss ? '⌄' : '›'}&ensp;评论{note.commentCount !== '' && '（' + note.commentCount + '）'}</button>
      {discuss && <div className="ngar-thought">
        {state.discussion?.items.map(c => <p className="ngar-excerpt-comment" key={c.id}><strong>{c.author}</strong> {c.text}</p>)}
        {!state.discussion?.items.length && !state.commentError && !state.commentLoading && <p>暂无可见评论。</p>}
        {state.commentError && <p role="alert">{state.commentError} <button onClick={source.comments}>重试</button></p>}
        {state.commentLoading ? <p role="status">正在读取评论…</p> : state.discussion?.more && <button onClick={source.comments}>继续读取评论</button>}
      </div>}
    </div>
  </>
}

export function ExcerptPreview({ source, useTabInfo, close, refresh }) {
  const { tab } = useTabInfo()
  const state = useReader(source)
  useLayoutEffect(() => {
    if (!tab.visible) source.conceal()
    return () => source.conceal()
  }, [tab.visible, source])
  useEffect(() => {
    const hidden = () => { if (document.hidden) source.conceal() }
    window.addEventListener('blur', source.conceal); document.addEventListener('visibilitychange', hidden)
    return () => { window.removeEventListener('blur', source.conceal); document.removeEventListener('visibilitychange', hidden) }
  }, [source])
  if (!tab.visible) return null
  const row = state.rows.find(r => r.id === state.selected)
  return <article className="ngar ngar-excerpt-pane" aria-label="摘录预览">
    {row ? <><h3>{state.note?.title || row.title}</h3>
      {state.note ? <NoteBody key={state.selected} source={source} state={state} /> : <>
        {row.author && <div className="ngar-byline">{row.author}</div>}
        <p className="ngar-hint" role="status">{state.noteError || '正在读取正文…'} {state.noteError && (
          state.noteErrorCode === 'FEED_EXPIRED' ? <button disabled={state.loading} onClick={refresh}>刷新推荐</button> :
          state.noteErrorCode === 'LOGIN_REQUIRED' ? <button disabled={Boolean(state.login || state.loginBusy || state.refreshing)} onClick={source.connect}>连接来源（打开官网扫码窗口）</button> :
          <button onClick={() => source.select(row.id)}>重试</button>)}</p>
      </>}
      <button className="ngar-excerpt-link" onClick={close}>收起预览 <kbd>Esc</kbd></button></> :
      <p className="ngar-hint">从阅读索引选择条目。</p>}
  </article>
}
