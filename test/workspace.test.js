import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { legacyBoard as board, workspaceName } from '../src/shared/boards.js'
import { boardWorkspace } from '../src/host/workspace.js'
import { ngaReader } from '../test-support/reader.js'

test('two windows share one native board, and reopening a cold session preserves a renamed title', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-nga-workspace-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const oldHome = process.env.DSH_HOME
  process.env.DSH_HOME = root
  t.after(() => {
    if (oldHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = oldHome
  })
  let saved, created = 0
  const events = [], members = new Set()
  const workspace = { id: 'project', path: join(root, 'plugin-workspaces', workspaceName), attachSession: id => members.add(id) }
  const handle = { read: async () => ({ events }), append: async rows => events.push(...rows), flush() {}, close() {} }
  const ctx = {
    workspaceRegistry: { create: async () => workspace },
    sessions: { prepare: (id, { meta }) => ({ header: { id, cwd: meta.cwd } }) },
    sessionPersistence: {
      stat: () => saved,
      create: async header => { created++; saved = { header }; return handle },
      open: async (_id, mode) => { assert.equal(mode, 'read'); return handle },
    },
  }
  const open = boardWorkspace(ctx)
  await Promise.all([open([board]), open([board])])
  assert.deepEqual(events.map(event => event.type), ['session/title', 'turn/start', 'turn/end'])
  events[0].data.title = '自定的会话名'
  await boardWorkspace(ctx)([board])
  assert.equal(created, 1)
  assert.equal(events[0].data.title, '自定的会话名')
  assert.deepEqual([...members], [board.sessionId])
})

test('returning to the board ignores an older topic response and keeps its own draft and disclosures', async () => {
  const storage = { getItem: () => null, setItem() {}, removeItem() {} }
  let finish
  const reader = ngaReader((_action, { id, page }) => new Promise(resolve => { finish = () => resolve({ id, page }) }), storage)
  const late = reader.open(13, 2)
  reader.draft({ text: '留给这个主题' })
  reader.expanded(13, 2, [21])
  reader.showList()
  finish(); await late
  assert.equal(reader.snapshot().id, 0)
  assert.equal(reader.snapshot().thread, null)
  const again = reader.open(13, 2)
  finish(); await again
  assert.equal(reader.snapshot().draft.text, '留给这个主题')
  assert.deepEqual(reader.expanded(13, 2), [21])
  assert.deepEqual(reader.expanded(13, 1), [])
})
