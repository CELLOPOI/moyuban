import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { preferences } from '../src/client/settings-store.js'
import { readerSettings } from '../src/host/settings.js'
import { mediaCache, directoryCache } from '../src/host/cache.js'
import { defaults } from '../src/shared/settings.js'
import { floorParts } from '../src/client/floor.js'
import { smileGroups } from '../src/sites/nga/smiles.js'
import { editReply } from '../src/sites/nga/editor.js'
import { ngaSite } from '../src/sites/nga/index.js'
import { boardRef, legacyBoard } from '../src/shared/boards.js'

test('both retired source values preserve other settings, revisions and unknown-field validation on upgrade', async t => {
  const home = await mkdtemp(join(tmpdir(), 'reader-upgrade-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const { path } = await readerSettings(home).read()
  const custom = { ...defaults, openOnPick: false, mediaCacheMiB: 31, defaultEffort: 'Max' }
  for (const defaultSource of ['live', 'example']) {
    const raw = JSON.stringify({ ...custom, defaultSource })
    await writeFile(path, raw)
    const host = readerSettings(home)
    const before = await host.read()
    assert.equal(before.warning, '')
    assert.deepEqual(before.values, custom)
    assert.equal(await readFile(path, 'utf8'), raw)
    await host.withBoards(config => assert.deepEqual(config.values, custom))
    await host.save(before.values, before.revision)
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), custom)
  }
  await writeFile(path, JSON.stringify({ ...custom, defaultSource: 'live', unknown: true }))
  assert.match((await readerSettings(home).read()).warning, /未知配置项 unknown/)
})

test('a focus reload cannot replace saved settings or consume a subsequent reload', async () => {
  const original = { values: defaults, revision: 'r1' }
  const saved = { values: { ...defaults, openOnPick: false }, revision: 'r2' }
  const external = { values: { ...saved.values, foldImages: false }, revision: 'r3' }
  const saveReply = Promise.withResolvers(), oldRead = Promise.withResolvers(), newRead = Promise.withResolvers()
  const reads = [Promise.resolve(original), oldRead.promise, newRead.promise]
  const source = preferences(action => action === 'saveSettings' ? saveReply.promise : reads.shift())
  await source.load()
  const saving = source.save(saved.values, original.revision)
  const focus = source.load(true)
  saveReply.resolve(saved)
  await saving
  const reloading = source.load(true)
  oldRead.resolve(original)
  await focus
  assert.equal(source.snapshot().revision, saved.revision)
  newRead.resolve(external)
  await reloading
  assert.deepEqual(source.snapshot(), external)
})

test('file and form share portable settings, migrate only board files, and fence stale edits across hosts', async t => {
  const root = await mkdtemp(join(tmpdir(), 'nga-settings-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const a = readerSettings(root), b = readerSettings(root)
  const [original, second] = await Promise.all([a.read(), b.read()])
  assert.deepEqual(original.values, defaults)
  assert.equal(original.revision, second.revision)
  const manual = 'dsh-nga-reader-fid-99.json'
  const tieba = boardRef('tieba', 'bar', 'linux', 'linux吧')
  const boardData = new Map([
    [manual, '{"kind":"fid","id":"99","name":"测试"}'],
    [tieba.sessionId + '.json', '{"site":"tieba","kind":"bar","id":"linux","name":"linux吧"}'],
    ['favorites-17.json', '[]'],
    ['favorites-sample_3137.json', '[]'],
    ['last-pick.json', '"dsh-nga-reader-fid-99"'],
    ['last-pick-tieba.json', JSON.stringify(tieba.sessionId)],
  ])
  await a.withBoards(async config => {
    for (const [file, contents] of boardData) await writeFile(join(config.boardPath, file), contents)
    await writeFile(join(config.boardPath, 'dsh-nga-reader-start-tieba.json'), '{}')
    await writeFile(join(config.boardPath, 'unrelated.txt'), 'keep')
  })
  const custom = { ...defaults, boardDataDirectory: join(root, 'data'), cacheDirectory: join(root, 'images'), foldImages: false }
  const results = await Promise.allSettled([a.save(custom, original.revision), b.save(custom, original.revision)])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'SETTINGS_CHANGED')
  const current = await b.read()
  assert.deepEqual(current.values, custom)
  for (const [file, contents] of boardData) assert.equal(await readFile(join(current.boardPath, file), 'utf8'), contents)
  const copied = await readdir(current.boardPath)
  assert.ok(!copied.includes('unrelated.txt'))
  assert.ok(!copied.includes('dsh-nga-reader-start-tieba.json'))
  const moved = join(root, 'manual edit')
  await writeFile(current.path, JSON.stringify({ ...custom, boardDataDirectory: moved, renderSmiles: false }))
  await readerSettings(root).withBoards(async config => {
    assert.equal(config.values.renderSmiles, false)
    assert.equal(config.boardPath, join(moved, 'dsh-nga-reader-boards'))
    assert.equal(JSON.parse(await readFile(join(config.boardPath, manual))).id, '99')
  })
  await writeFile(current.path, '{"renderSmiles":"false"}')
  assert.match((await a.read()).warning, /renderSmiles/)
  await assert.rejects(a.withBoards(() => assert.fail()), { code: 'SETTINGS_INVALID' })
})

test('disk caches use the chosen location; inline images and both full AC packs retain their markup', async t => {
  const cachePath = await mkdtemp(join(tmpdir(), 'nga-cache-'))
  t.after(() => rm(cachePath, { recursive: true, force: true }))
  const groups = [{ key: 'sample', name: '分类', groups: [{ name: '分组', boards: [] }] }]
  const old = { kind: legacyBoard.kind, id: legacyBoard.id, name: legacyBoard.name, sessionId: legacyBoard.sessionId }
  groups[0].groups[0].boards.push(old)
  await writeFile(join(cachePath, 'public-directory.json'), JSON.stringify({ time: Date.now(), categories: groups }))
  const other = boardRef('sample', old.kind, old.id, old.name)
  const second = [{ ...groups[0], groups: [{ name: '分组', boards: [other] }] }]
  await directoryCache('sample', cachePath, 30, async () => second)
  assert.deepEqual((await directoryCache('nga', cachePath, 30, () => assert.fail()))[0].groups[0].boards, [legacyBoard])
  assert.deepEqual(await directoryCache('sample', cachePath, 30, () => assert.fail()), second)
  const image = 'https://img4.nga.cn/ngabbs/post/smile/ac15.png'
  const media = mediaCache(async () => new Response(Buffer.from('png fixture'), { headers: { 'content-type': 'image/png' } }))
  const config = { values: defaults, cachePath }
  const nga = ngaSite()
  assert.equal(await (await media(nga, image, config)).text(), 'png fixture')
  const secondSite = { id: 'sample', imageUrl: nga.imageUrl }
  const secondMedia = mediaCache(() => new Response('other bytes', { headers: { 'content-type': 'image/png' } }))
  assert.equal(await (await secondMedia(secondSite, image, config)).text(), 'other bytes')
  assert.equal(await (await mediaCache(() => assert.fail())(nga, image, config)).text(), 'png fixture')
  assert.equal((await media(nga, 'https://unrelated.example/image.png', config)).status, 400)
  const picture = { kind: 'image', url: image }, quote = { kind: 'quote', text: '引文' }, text = { kind: 'text', text: '回复' }
  assert.deepEqual(floorParts([picture, quote, text], false), { context: [quote], output: [picture, text] })
  assert.deepEqual(floorParts([picture, quote, text]).context, [picture, quote])
  assert.deepEqual(smileGroups.slice(0, 2).map(group => group.faces.length), [45, 46])
  for (const group of smileGroups) for (const face of group.faces) {
    assert.equal(editReply('前后', [1, 1], 'face', face.code).text, '前[s:' + face.code + ']后')
  }
})
