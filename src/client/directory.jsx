import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { FileTypeIcon, IconCheckOutlineRegular, IconChevronRightOutlineRegular, IconFolderOpenRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { legacySite } from '../shared/boards.js'
import { followedCategory } from '../sites/tieba/forum.js'
import { AccountDialog } from './account.jsx'

const directoryKind = 'dsh-nga-reader-category'
const addressPrefix = 'dsh-resource://dsh-nga-reader/category/'
const fileName = category => category.name + '.ts'

export function categoryAddress(site, category) {
  const scope = site === legacySite ? '' : site + '/'
  return addressPrefix + scope + encodeURIComponent(category.key) + '/' + encodeURIComponent(fileName(category))
}

export const categoryTab = {
  id: directoryKind, kind: directoryKind, patterns: [addressPrefix + '**'],
  title: address => decodeURIComponent(address.split('/').at(-1)),
}

// 主对话和右栏共享同一次目录读取。重新打开已保存的标签页也能凭地址找回分类。
export function directorySource(fetchDirectory, settings = () => ({ values: { directoryCacheMinutes: 30 }, revision: '' }), disk = false) {
  const listeners = new Set()
  let state = { categories: [], error: '', loading: false, ready: false }, pending, loadedAt = 0, lastRevision
  function set(patch) {
    state = { ...state, ...patch }
    for (const notify of listeners) notify()
  }
  let version = 0, watching = 0, timer
  function accept(result) {
    ++version
    set({ ...result, ready: true, loading: false, error: '' })
  }
  function load() {
    const { values, revision } = settings()
    if (pending || (!disk && lastRevision === revision && Date.now() - loadedAt < values.directoryCacheMinutes * 60_000)) return pending
    const id = version
    if (!state.ready) set({ loading: true, error: '' })
    pending = fetchDirectory().then(result => {
      if (version !== id) return
      loadedAt = Date.now()
      lastRevision = revision
      if (!disk || state.revision !== result.revision || state.error) accept(result)
    }).catch(error => { if (id === version) set({ error: error.message, loading: false }) }).finally(() => {
      pending = undefined
    })
    return pending
  }
  function watch() {
    void load()
    if (!disk) return
    function refresh() { if (!document.hidden) void load() }
    if (++watching === 1) {
      timer = setInterval(refresh, 2500)
      window.addEventListener('focus', load)
    }
    return () => {
      if (--watching === 0) { clearInterval(timer); window.removeEventListener('focus', load) }
    }
  }
  return { load, accept, watch, snapshot: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) } }
}

function useDirectory(source) {
  const state = useSyncExternalStore(source.subscribe, source.snapshot)
  useEffect(() => source.watch(), [source])
  return state
}

function ReadStatus({ state, retry }) {
  if (state.error) return <p className="ngar-hint" role="alert">{state.error} <button type="button" onClick={retry}>重新读取</button></p>
  if (!state.categories.length) return <p className="ngar-hint" role="status">{state.ready && !state.loading ? '这个站点当前没有可选分类。' : '正在读取分类…'}</p>
  return null
}

export function CategoryCards({ library, site }) {
  return <section className="ngar ngar-directory" aria-label="版面分类">
    <div className="ngar-prompt"><div className="ngar-bubble">整理一下资料目录。</div></div>
    {site.capabilities.directory && <SiteCards key={site.id} site={site} library={library} />}
  </section>
}

function SiteCards({ site, library }) {
  const source = library.directory(site.id)
  const state = useDirectory(source)
  const categories = site.capabilities.followed && !state.categories.some(c => c.kind === 'followed')
    ? [followedCategory, ...state.categories] : state.categories
  return <>
    <ReadStatus state={state} retry={source.load} />
    <div className="ngar-files">{categories.map(category => <button type="button" key={category.key}
      className="ngar-file" onClick={() => library.preview(site.id, category)} aria-label={'在侧栏预览' + category.name}>
      <FileTypeIcon path={fileName(category)} size={28} />
      <span><strong>{fileName(category)}</strong><small>{category.kind === 'followed' ? '查看当前百度账号关注的吧' : category.error ? '文件格式有误' :
        category.groups.length + ' 个分组 · ' + category.groups.reduce((sum, group) => sum + group.boards.length, 0) + ' 个条目'}</small></span>
      <IconChevronRightOutlineRegular size={15} />
    </button>)}</div>
  </>
}

function CategoryListing({ category, library, generation }) {
  const catalog = useSyncExternalStore(library.subscribe, library.snapshot)
  const [query, setQuery] = useState(''), [adding, setAdding] = useState(''), [message, setMessage] = useState('')
  const pending = useRef(null)
  useEffect(() => () => pending.current?.abort(), [])
  const term = query.trim().toLocaleLowerCase()
  const groups = category.groups.map(group => {
    if (!term || group.name.toLocaleLowerCase().includes(term)) return group
    return { ...group, boards: group.boards.filter(ref => (ref.name + ' ' + ref.kind + '=' + ref.id).toLocaleLowerCase().includes(term)) }
  }).filter(group => group.boards.length)
  const favorites = new Set(catalog.favorites), included = new Set(catalog.boards.map(ref => ref.sessionId))
  async function add(ref) {
    const controller = new AbortController()
    pending.current = controller
    setAdding(ref.sessionId); setMessage('')
    try {
      await library.add(ref, controller.signal, generation)
      if (!controller.signal.aborted) setMessage(ref.name + '已加入工作区。')
    } catch (error) { if (!controller.signal.aborted) setMessage(error.message) }
    finally { if (!controller.signal.aborted) setAdding('') }
  }
  return <>
    <label className="ngar-source-search"><input type="search" placeholder="筛选子版面…" aria-label="筛选当前分类的子版面"
      value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className="ngar-code" aria-label={category.name + '的子版面'}>
      <div className="ngar-code-line"><code><em>export const</em> sections = {'{'}</code></div>
      {groups.map(group => <details key={group.name} open className="ngar-code-group">
        <summary className="ngar-code-line"><code><IconFolderOpenRegular size={14} /> {JSON.stringify(group.name)}: [</code></summary>
        {group.boards.map(ref => {
          const saved = included.has(ref.sessionId)
          const status = favorites.has(ref.sessionId) ? '已收藏' : saved ? '已在工作区' : '添加到工作区'
          return <button key={ref.sessionId} type="button" className="ngar-code-line ngar-board-line" disabled={Boolean(adding)}
            title={ref.name + ' · ' + status} aria-label={ref.name + '，' + status} onClick={() => void add(ref)}>
            <code><span>{JSON.stringify(ref.name)}</span>,</code>
            {saved && <IconCheckOutlineRegular size={14} />}{adding === ref.sessionId && <small>添加中…</small>}
          </button>
        })}
        <div className="ngar-code-line ngar-bracket"><code>],</code></div>
      </details>)}
      <div className="ngar-code-line"><code>{'}'}</code></div>
      {!groups.length && <p className="ngar-hint">这个分类里没有匹配的子版面。</p>}
    </div>
    <div className="ngar-directory-status" role="status">{message || (catalog.settings?.openOnPick === false ? '点子版面加入工作区' : '点子版面加入工作区并打开')}</div>
  </>
}

function FollowedPreview({ library, site }) {
  const source = library.followed
  const state = useSyncExternalStore(source.subscribe, source.snapshot)
  useEffect(() => {
    const check = () => { if (!document.hidden) void source.check() }
    const timer = setInterval(check, 3000)
    function visibility() {
      const phase = source.snapshot().phase
      if (document.hidden && ['loading', 'ready', 'error', 'reauth'].includes(phase)) source.clear('hidden')
      if (!document.hidden && phase === 'hidden') void source.open(false)
    }
    function focus() {
      if (['ready', 'error', 'signedOut', 'hidden'].includes(source.snapshot().phase)) void source.open(false)
    }
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      clearInterval(timer); window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', visibility)
      source.clear()
    }
  }, [source])
  const again = () => void source.open(true)
  return <>
    <div className="ngar-followed-controls">
      {state.account && <strong>{state.account.name}</strong>}
      {state.phase === 'ready' && <button onClick={again}>重新同步</button>}
      {state.account && <><button onClick={() => void source.logout(true, library.notifyAccount)}>切换账号</button>
        <button onClick={() => void source.logout(false, library.notifyAccount)}>退出登录</button></>}
    </div>
    {state.phase === 'ready' && (state.boards.length
      ? <CategoryListing key={state.account.generation} library={library} generation={state.account.generation}
          category={{ name: '我关注的吧', groups: [{ name: '我关注的吧', boards: state.boards }] }} />
      : <p className="ngar-hint">当前账号还没有关注的吧。</p>)}
    {['loading', 'hidden'].includes(state.phase) && <p className="ngar-hint" role="status">正在读取关注列表…</p>}
    {state.phase === 'error' && <p className="ngar-hint" role="alert">{state.account && '已登录。'}{state.error} <button onClick={again}>{state.account ? '重新同步' : '重新读取'}</button></p>}
    {state.phase === 'reauth' && <p className="ngar-hint" role="status">贴吧未接受当前登录。 <button onClick={again}>重试同步</button>{' '}
      <button onClick={() => source.clear('login')}>重新扫码登录</button></p>}
    {['idle', 'signedOut'].includes(state.phase) && <p className="ngar-hint"><button className="ngar-setting-button" onClick={again}>
      {state.phase === 'signedOut' ? '扫码登录百度贴吧' : '查看我关注的吧'}</button></p>}
    {state.phase === 'login' && <AccountDialog reader={{ api: source.api, site }} account={{ connected: false }}
      onClose={() => { if (source.snapshot().phase === 'login') source.clear('signedOut') }}
      onChange={() => { library.notifyAccount(); return source.open(false) }} />}
  </>
}

export function CategoryPreview({ useTabInfo, library }) {
  const { tab } = useTabInfo()
  const parts = tab.navigation.address.slice(addressPrefix.length).split('/')
  const site = parts.length === 2 ? legacySite : parts[0]
  const key = parts.at(-2)
  if (site === 'tieba' && key === followedCategory.key) return <section className="ngar ngar-category-preview" aria-label="分类预览">
    <FollowedPreview library={library} site={library.preferences.snapshot().sites.find(item => item.id === site)} />
  </section>
  return <OrdinaryPreview site={site} categoryKey={key} library={library} />
}

function OrdinaryPreview({ site, categoryKey, library }) {
  const source = library.directory(site)
  const state = useDirectory(source)
  const category = state.categories.find(item => encodeURIComponent(item.key) === categoryKey)
  return <section className="ngar ngar-category-preview" aria-label="分类预览">
    <ReadStatus state={state} retry={source.load} />
    {category?.error ? <p className="ngar-hint" role="alert">{category.error}</p> :
      category ? <CategoryListing key={site + '/' + categoryKey} category={category} library={library} /> :
      state.categories.length > 0 && <p className="ngar-hint">这个分类已移出目录，请从主对话重新选择。</p>}
  </section>
}
