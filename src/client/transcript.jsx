import React, { useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  DisclosureRow, IconChevronDownOutlineRegular, IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular, IconChevronUpOutlineRegular, IconThinkOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { floorParts } from './floor.js'
import { ForumImage, Smile } from './smile.jsx'
import { ReadingOptions } from './preferences.jsx'
import { CategoryCards } from './directory.jsx'
import { entryForSite } from '../shared/boards.js'
import { activityFor } from './activity.jsx'

const clock = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
const timeOf = value => value ? clock.format(new Date(value * 1000)) : ''

function Pager({ page, last, next, change, label }) {
  if (page === 1 && !next) return null
  return <nav aria-label={label} className="ngar-pager">
    <button aria-label={label + '上一页'} disabled={page <= 1} onClick={() => change(page - 1)}><IconChevronLeftOutlineRegular size={15} /></button>
    <span>{last ? page + ' / ' + last : '第 ' + page + ' 页'}</span>
    <button aria-label={label + '下一页'} disabled={!next} onClick={() => change(page + 1)}><IconChevronRightOutlineRegular size={15} /></button>
  </nav>
}

function Picture({ site, url }) {
  return <div className="ngar-picture"><a href={url} target="_blank" rel="noreferrer" title="查看原图">
    <ForumImage site={site} url={url} alt="帖子配图" fallback="图片未能加载，查看原图" />
  </a></div>
}

function TopicRows({ list, query, reader }) {
  const term = query.trim().toLocaleLowerCase()
  const topics = list.items.filter(item => (item.title + ' ' + item.author).toLocaleLowerCase().includes(term))
  return <>
    {topics.map(item => <button className="ngar-topic" key={item.entryId ?? item.id} onClick={() => reader.open(item.entryId ?? item.id)} title={item.title}>
      <IconThinkOutlineRegular size={14} /><span>查看</span><i aria-hidden="true" /><span className="ngar-preview">{item.title}</span>
    </button>)}
    {!topics.length && <p className="ngar-hint">{term ? '本页没有匹配的讨论。' : '这一页没有讨论。'}</p>}
  </>
}

function Blocks({ site, blocks }) {
  return blocks.map((block, index) => {
    if (block.kind === 'image') return <Picture key={index} site={site} url={block.url} />
    const Tag = block.kind === 'quote' ? 'blockquote' : 'p'
    return <Tag key={index}>{block.runs ? block.runs.map((run, i) => {
      let value = run.smile ? <Smile site={site} url={run.smile} label={run.text} /> : run.text
      if (run.bold) value = <strong>{value}</strong>
      if (run.strike) value = <del>{value}</del>
      return run.href ? <a key={i} href={run.href} target="_blank" rel="noreferrer">{value}</a> : <React.Fragment key={i}>{value}</React.Fragment>
    }) : block.text}</Tag>
  })
}

function FloorReplies({ reader, threadId, post }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState(1)
  const [result, setResult] = useState(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!open || result?.page === page) return
    const request = new AbortController()
    setError('')
    reader.api('replies', { mode: 'live', id: threadId, postId: post.id, page }, request.signal)
      .then(value => { if (!request.signal.aborted) setResult(value) })
      .catch(err => { if (!request.signal.aborted) setError(err.message) })
    return () => request.abort()
  }, [open, page, retry, reader, threadId, post.id, result?.page])
  function change(next) { setError(''); setPage(next) }
  return <details className="ngar-subposts" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{'楼中楼（' + post.replyCount + '）'}</summary>
    {open && (result?.page === page ? <>
      {result.items.map(item => <div className="ngar-subpost" key={item.id}>
        <strong>{item.author}</strong><Blocks site={reader.site} blocks={item.blocks} />
      </div>)}
      {!result.items.length && <p className="ngar-hint">本页没有可见回复。</p>}
      <Pager label="楼中楼" page={page} last={result.pages} next={page < result.pages} change={change} />
    </> : <p className="ngar-hint" role="status">{error || '正在读取楼中楼…'} {error && <>
      <button onClick={() => setRetry(n => n + 1)}>重新读取</button>
      {result && <button onClick={() => change(result.page)}>返回上一页内容</button>}</>}</p>)}
  </details>
}

function Floors({ state, reader }) {
  const { id, thread } = state
  const { foldImages, showAuthorUid } = useContext(ReadingOptions)
  const [expanded, setExpanded] = useState(() => reader.expanded(id, thread.page))
  function toggle(floor) {
    const next = expanded.includes(floor) ? expanded.filter(id => id !== floor) : [...expanded, floor]
    reader.expanded(id, thread.page, next)
    setExpanded(next)
  }
  if (!thread.posts.length) return <p className="ngar-hint">这一页没有可见楼层。</p>
  return thread.posts.map(post => {
    const { context, output } = floorParts(post.blocks, foldImages)
    const count = context.filter(block => block.kind === 'image').length
    const pictures = count ? count + ' 张图片' : ''
    const preview = [pictures, context.find(block => block.text)?.text].filter(Boolean).join(' · ')
    const excerpt = output.find(block => block.kind === 'text')?.text || output.find(block => block.kind === 'quote')?.text ||
      pictures || (output.some(block => block.kind === 'image') ? '楼层配图' : '此楼层没有正文')
    const label = post.floor ? post.floor + ' 楼' : '主楼'
    const uid = showAuthorUid && post.authorId ? 'UID ' + post.authorId : ''
    const byline = [label, post.author, uid !== post.author && uid].filter(Boolean).join(' · ')
    const { title, icon: ActivityIcon } = activityFor(thread.id + '/' + post.floor)
    const open = expanded.includes(post.floor)
    return <article className="ngar-floor" key={post.floor} aria-label={label}>
      <DisclosureRow title={title} icon={<ActivityIcon size={14} />} open={open} expandable expandOnRowClick keepContentWhenOpen
        onToggle={() => toggle(post.floor)} collapsedContent={<><i className="ngar-dot" /><span className="ngar-preview" title={byline}>
          {byline}{!open && preview && ' · ' + preview}</span></>}>
        <div className="ngar-thought">
          {post.time > 0 && <time className="ngar-byline">{timeOf(post.time)}</time>}
          <Blocks site={reader.site} blocks={context} />
        </div>
      </DisclosureRow>
      {output.length > 0 ? <div className="ngar-output"><Blocks site={reader.site} blocks={output} /></div> :
        !count && <p>此楼层没有正文。</p>}
      {reader.site.capabilities.replies && post.replyCount > 0 && <FloorReplies reader={reader} threadId={thread.id} post={post} />}
      {reader.site.capabilities.quote && <button type="button" className="ngar-quote" disabled={state.sending} aria-label={'引用' + label} onClick={() => reader.draft({ quote: {
        postId: post.id, page: thread.page, floor: post.floor, excerpt: excerpt.slice(0, 140),
      } })}>引用</button>}
    </article>
  })
}

function Records({ state, reader }) {
  const { id, list, thread } = state
  const page = id ? thread.page : state.listPage
  const box = useRef(null)
  const [visible, setVisible] = useState(true)
  useLayoutEffect(() => {
    const el = box.current
    if (visible) el.scrollTop = reader.scroll(id, page)
  }, [visible, reader, id, page])
  return <>
    {!id && <button className="ngar-group" aria-expanded={visible} onClick={() => setVisible(!visible)}>
      {visible ? <IconChevronUpOutlineRegular size={14} /> : <IconChevronDownOutlineRegular size={14} />}
      <span>讨论索引</span><i /><span>{list.items.length} 条记录</span>
    </button>}
    <div className="ngar-records" ref={box} hidden={!visible} aria-label={id ? '楼层记录' : '版面帖子'}
      onScroll={event => reader.scroll(id, page, event.currentTarget.scrollTop)}>
      {id ? <Floors state={state} reader={reader} /> : <TopicRows list={list} query={state.query} reader={reader} />}
    </div>
    <Pager label={id ? '楼层' : '帖子列表'} page={page} last={id ? thread.pages : undefined}
      next={id ? page < thread.pages : list.hasNext} change={id ? page => reader.open(id, page) : reader.loadList} />
  </>
}

export function BoardTranscript({ reader, entryOnly, library }) {
  const state = useSyncExternalStore(reader.subscribe, reader.snapshot)
  // 空工作区的常驻入口也使用原生「新会话」目录，首个版面加入后可以安全收起旧入口。
  useEffect(() => {
    reader.activate()
    if (entryOnly) library.browse(entryForSite(reader.site.id).sessionId)
  }, [reader, entryOnly, library])
  if (entryOnly) return <CategoryCards site={reader.site} library={library} />
  const { id, thread, list } = state
  const data = id ? thread : list
  const error = id ? state.threadError : state.listError
  const title = id ? thread?.title || list?.items.find(item => (item.entryId ?? item.id) === id)?.title : '整理一下最近的讨论。'
  const time = thread?.posts[0]?.time
  return <section className="ngar ngar-transcript" aria-label="讨论记录">
    {title && <div className="ngar-prompt"><div className="ngar-bubble">{title}</div>
      {time > 0 && <time>{timeOf(time)}</time>}
    </div>}
    {data ? <Records key={[id, id ? thread.page : state.listPage].join('/')} state={state} reader={reader} /> :
      <div className="ngar-hint" role="status">{error || '正在读取…'} {error && <button onClick={() => id ? reader.open(id, state.page) : reader.loadList()}>重新读取</button>}</div>}
    {state.notice && <p className="ngar-hint" role={state.noticeError ? 'alert' : 'status'}>{state.notice}</p>}
  </section>
}
