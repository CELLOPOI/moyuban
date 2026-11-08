import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { tiebaDirectory } from '../src/sites/tieba/directory.js'

const draftOf = state => state.categories.slice(1).map(({ key, name, groups, error }) => ({ key, name, groups: error ? null :
  groups.map(g => ({ name: g.name, boards: g.boards.map(b => b.name) })) }))

test('Tieba disk files round-trip external and editor edits, ordering, deletion and restart', async t => {
  const ws = await mkdtemp(join(tmpdir(), 'tieba-files-'))
  t.after(() => rm(ws, { recursive: true, force: true }))
  const desktop = tiebaDirectory(ws), web = tiebaDirectory(ws)
  await desktop.initialize()
  const empty = await desktop.snapshot(), dir = empty.path
  assert.deepEqual(empty.categories.map(c => [c.key, c.name]), [['followed', '我关注的吧']])
  assert.deepEqual((await readdir(dir)).filter(file => file.endsWith('.ts')), [])
  const initial = await web.save([{ name: '游戏讨论', groups: [{ name: '游戏', boards: ['原神吧'] }] }], empty.revision)
  assert.deepEqual((await desktop.read()).map(c => c.name), ['我关注的吧', '游戏讨论'])
  const game = join(dir, '游戏讨论.ts'), model = join(dir, '模型制作.ts')
  const external = "// DSH 编辑\nexport const sections = { '2026': ['明日方舟吧'], '2025': ['原神吧'], } as const;\n"
  await writeFile(game, external)
  await writeFile(model, 'export const sections = {模型: ["高达模型吧"]};\n')
  await assert.rejects(web.save(draftOf(initial), initial.revision), { code: 'DIRECTORY_CHANGED' })
  const fresh = await desktop.snapshot()
  const edited = fresh.categories.find(c => c.name === '游戏讨论')
  assert.deepEqual(edited.groups.map(g => g.name), ['2026', '2025'])
  assert.equal(edited.groups[0].boards[0].id, '明日方舟')
  const rows = draftOf(fresh)
  const changed = rows.pop()
  changed.name = '模型工坊'; changed.groups[0].boards.unshift('手办')
  rows.unshift(changed)
  const next = await web.save(rows, fresh.revision)
  assert.equal(next.categories[1].key, changed.key)
  assert.deepEqual((await desktop.read())[1].groups[0].boards.map(b => b.name), ['手办吧', '高达模型吧'])
  assert.equal(await readFile(game, 'utf8'), external)
  assert.match(await readFile(join(dir, '模型工坊.ts'), 'utf8'), /手办吧/)
  assert.ok(!(await readdir(dir)).includes('模型制作.ts'))
  const malicious = 'export const sections = {}; globalThis.__tiebaExecuted = true;'
  await writeFile(model, malicious)
  const broken = await web.snapshot()
  assert.ok(broken.categories.find(c => c.name === '模型制作').error)
  assert.equal(globalThis.__tiebaExecuted, undefined)
  const brokenRows = draftOf(broken)
  brokenRows[0].groups[0].name = '改名分组'
  await web.save(brokenRows, broken.revision)
  assert.equal(await readFile(model, 'utf8'), malicious)
  const saved = await desktop.snapshot()
  const race = await Promise.allSettled([desktop.save([], saved.revision), web.save([], saved.revision)])
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(race.find(r => r.status === 'rejected').reason.code, 'DIRECTORY_CHANGED')
  const restarted = tiebaDirectory(ws)
  await restarted.initialize()
  assert.deepEqual((await restarted.read()).map(c => c.name), ['我关注的吧'])
  assert.deepEqual((await readdir(dir)).filter(f => f.endsWith('.ts')), [])
  await rm(dir, { recursive: true })
  assert.deepEqual((await restarted.read()).map(c => c.name), ['我关注的吧'])
})

test('directory save validates file boundaries and restores earlier files after a later write fails', async t => {
  const ws = await mkdtemp(join(tmpdir(), 'tieba-save-'))
  t.after(() => rm(ws, { recursive: true, force: true }))
  const directory = tiebaDirectory(ws)
  const before = await directory.save([{ name: '数码技术', groups: [] }], (await directory.snapshot()).revision)
  const rows = draftOf(before)
  for (const name of ['../越界', '我关注的吧', 'COM1', '数码技术']) {
    await assert.rejects(directory.save([...rows, { name, groups: [] }], before.revision), { code: 'INVALID_DIRECTORY' })
  }
  const untouched = join(before.path, '数码技术.ts'), raw = await readFile(untouched, 'utf8')
  await mkdir(join(before.path, '冲突.ts'))
  await assert.rejects(directory.save([...rows.slice(1), { name: '冲突', groups: [] }], before.revision))
  assert.equal(await readFile(untouched, 'utf8'), raw)
  assert.equal((await directory.snapshot()).revision, before.revision)
  assert.ok(!(await readdir(dirname(before.path))).includes('越界.ts'))
})

test('upgrading retains old category IDs, custom order, and the exact bytes of existing names', async t => {
  const ws = await mkdtemp(join(tmpdir(), 'tieba-upgrade-')), dir = join(ws, '分类')
  t.after(() => rm(ws, { recursive: true, force: true }))
  await mkdir(dir)
  const order = [{ key: 'games', name: '游戏讨论' }, { key: 'tech', name: '数码技术' }, { key: 'hobby', name: '兴趣生活' }]
  const files = new Map(order.map(({ name }) => [name + '.ts', '\uFEFF// 自定义 ' + name + '\r\nexport const sections = { 收藏: ["摄影吧"] };\r\n']))
  files.set('.目录.json', JSON.stringify(order))
  for (const [name, contents] of files) await writeFile(join(dir, name), contents)
  const directory = tiebaDirectory(ws)
  await directory.initialize()
  const snapshot = await directory.snapshot()
  assert.deepEqual(snapshot.categories.slice(1).map(({ key, name }) => ({ key, name })), order)
  assert.ok(snapshot.categories.slice(1).every(c => c.groups[0].boards[0].id === '摄影'))
  for (const [name, contents] of files) assert.deepEqual(await readFile(join(dir, name)), Buffer.from(contents))
  await rm(join(dir, '.目录.json'))
  assert.deepEqual((await directory.read()).slice(1).map(c => c.name), order.map(c => c.name).sort())
  for (const [name, contents] of files) if (name.endsWith('.ts')) assert.deepEqual(await readFile(join(dir, name)), Buffer.from(contents))
})
