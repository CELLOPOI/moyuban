import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import manifest from '../package.json' with { type: 'json' }
import { name as hostName } from '../src/host/index.js'
import { forum } from '../src/sites/tieba/forum.js'

test('the client bundle selects workspace blanks, picks a board and returns to the working session with Escape', async () => {
  const board = forum('linux')
  const byId = { work: {}, ordinaryBlank: { blank: true }, notes: {}, picker: { blank: true }, [board.sessionId]: { title: '自定名称' } }
  const workspaces = [
    { workspaceId: 'reader', sessionIds: [board.sessionId, 'notes'] },
    { workspaceId: 'ordinary', sessionIds: ['work', 'ordinaryBlank'] },
  ]
  const listeners = new Set(), slots = new Map(), tabStorage = new Map()
  const source = getSnapshot => ({
    getSnapshot, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  })
  let active = 'work', tab, expanded = false, menuOpen = false, shortcut, openOnPick = false, bundle
  const notify = () => { for (const fn of listeners) fn() }
  function mount(id) { active = id; notify() }
  const window = new EventTarget()
  window.__ModuleLoader__ = { load: value => { bundle = value } }
  const document = { createElement: () => ({}), head: { append() {} }, querySelector: () => menuOpen }
  const fetch = async (path, options) => {
    assert.equal(path, '/api/dsh-nga-reader')
    assert.deepEqual(JSON.parse(options.body), { site: 'tieba', board: board.sessionId, name: board.name, fromDirectory: true, action: 'openBoard' })
    return Response.json({ site: 'tieba', workspaceId: 'reader', sessionId: board.sessionId, opened: board.sessionId,
      boards: [board], manual: [board.sessionId], favorites: [], settings: { openOnPick } })
  }
  const sessionStorage = { getItem: key => tabStorage.get(key), setItem: (key, value) => tabStorage.set(key, value) }
  const script = await readFile(new URL('../dist/client.js', import.meta.url), 'utf8')
  runInNewContext(script, { window, document, sessionStorage, fetch, TextEncoder, TextDecoder })
  const react = { createContext: () => ({}), createElement: (_type, props) => ({ props }) }
  const client = bundle.factory(id => id === 'react' ? react : {})
  assert.equal(hostName, manifest.name)
  assert.equal(bundle.id, manifest.name)
  assert.equal(client.name, manifest.name)
  client.apply({
    effect: setup => setup(),
    slots: { inject: (_name, setup) => setup(), register: (slot, render) => slots.set(slot.name, { ...slot, render }) },
    shortcuts: { register: value => { shortcut = value } },
    layout: { beginNavigation: () => new AbortController().signal },
    sessions: { list: source(() => ({ byId, phase: 'loading' })) },
    workspaces: { list: source(() => ({ items: workspaces, archivedSessionIds: [] })) },
    uiWorkspace: { openSession: mount },
    sidebarRightTabs: { register() {} },
    sidebarRight: {
      mounted: source(() => active), active: () => tab, isExpanded: () => expanded,
      openResource(address, { kind }) { tab = { id: 'preview', kind, address }; expanded = true },
      hide(id) { assert.equal(id, tab.id); expanded = false },
    },
  })
  const matches = sessionId => slots.get('conversation.composer').select({ sessionId })
  const settingsSlot = slots.get('plugins.bundle.config')
  assert.equal(settingsSlot.key, manifest.name)
  const library = settingsSlot.render().props.library
  function escape() {
    const event = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }
  for (const id of ['work', 'ordinaryBlank', 'notes']) assert.equal(matches(id), null)
  assert.equal(escape(), false)
  mount('picker')
  assert.equal(matches('picker'), null)
  workspaces[0].sessionIds.push('picker')
  notify()
  assert.equal(matches('picker'), 'picker')
  library.preview('tieba', { key: 'tech', name: '数码技术' })
  assert.equal(tab.address, 'dsh-resource://dsh-nga-reader/category/tieba/tech/' + encodeURIComponent('数码技术.ts'))
  await library.add(board)
  assert.equal(active, 'picker')
  openOnPick = true
  await library.add(board)
  assert.equal(active, board.sessionId)
  assert.equal(matches(active), active)
  assert.equal(tabStorage.get('dsh-nga-reader.previous'), 'work')
  assert.equal(tabStorage.get('dsh-nga-reader.last-site'), 'tieba')
  assert.equal(tabStorage.get('dsh-nga-reader.last-board'), board.sessionId)
  menuOpen = true
  assert.equal(escape(), false)
  menuOpen = false
  assert.equal(escape(), true)
  assert.equal(expanded, false)
  assert.equal(active, board.sessionId)
  assert.equal(escape(), true)
  assert.equal(active, 'work')
  await shortcut.resolve().run()
  assert.equal(active, board.sessionId)
})
