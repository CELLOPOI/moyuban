import assert from 'node:assert/strict'
import test from 'node:test'
import { floorParts } from '../src/client/floor.js'
import { editReply } from '../src/sites/nga/editor.js'
import { ngaReader } from '../test-support/reader.js'
import { normalizeThread } from '../src/sites/nga/api.js'
import { contentBlocks } from '../src/sites/nga/content.js'

test('each floor keeps its text visible and folds its pictures into its own thought', () => {
  const parts = raw => floorParts(contentBlocks(raw))
  const quoted = parts('[quote]前情[/quote]我的回复[quote]后文里的引文[/quote]')
  assert.deepEqual(quoted.context.map(b => b.text), ['前情'])
  assert.deepEqual(quoted.output.map(b => b.text), ['我的回复', '后文里的引文'])
  const paragraphs = parts('开场[b]一\n\n二[/b]段')
  assert.equal(paragraphs.context[0].text, '开场一')
  assert.equal(paragraphs.output[0].text, '二段')
  assert.deepEqual(paragraphs.output[0].runs, [{ text: '二', bold: true }, { text: '段' }])
  for (const raw of ['只有一句', '[quote]仅有引文[/quote]']) {
    assert.deepEqual(parts(raw), { context: [], output: contentBlocks(raw) })
  }
  const image = '[img]./mon_202611/test.jpg[/img]'
  assert.deepEqual(parts(image), { context: contentBlocks(image), output: [] })
})

test('toolbar wraps a selection, restores the caret, and leaves an over-limit draft untouched', () => {
  const bold = editReply('前选中后', [1, 3], 'bold')
  assert.deepEqual(bold, { text: '前[b]选中[/b]后', selection: [4, 6] })
  assert.deepEqual(editReply('末尾', [2, 2], 'quote'), { text: '末尾[quote][/quote]', selection: [9, 9] })
  const face = editReply('前后', [1, 1], 'face', '哭笑')
  assert.equal(face.text, '前[s:ac:哭笑]后')
  assert.equal(face.selection[0], face.text.length - 1)
  assert.ok(editReply('字'.repeat(7999), [0, 0], 'strike').error)
  assert.ok(editReply('文字', [0, 2], 'link', 'javascript:alert(1)').error)
  assert.ok(editReply('', [0, 0], 'image', 'https://not-nga.example/test.jpg').error)
})

test('NGA floor parsing renders the editor markup and leaves unsafe links inert', () => {
  const link = editReply('资料', [0, 2], 'link', 'https://example.com/read').text
  const image = editReply('', [0, 0], 'image', './mon_202611/a.jpg').text
  const raw = '[quote]上文[/quote][b]新[/b][del]旧[/del][s:ac:茶]' + link + image
  const blocks = normalizeThread({ __T: { subject: '排版' }, __R: [{ content: raw }] }, 9, 1).posts[0].blocks
  assert.deepEqual(blocks, contentBlocks(raw))
  assert.deepEqual(blocks[1].runs, [{ text: '新', bold: true }, { text: '旧', strike: true },
    { text: '〔茶〕', smile: 'https://img4.nga.cn/ngabbs/post/smile/ac39.png' }, { text: '资料', href: 'https://example.com/read' }])
  assert.equal(blocks[2].kind, 'image')
  assert.deepEqual(contentBlocks('[url=javascript:alert(1)]资料[/url]'), [{ kind: 'text', text: '资料' }])
})

test('model, effort and permission are local choices and never enter a forum request', async () => {
  const data = new Map(), calls = []
  const storage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }
  const api = async (action, fields) => { calls.push([action, fields]); return { id: 1, page: 1, pages: 1 } }
  const reader = ngaReader(api, storage)
  reader.setAppearance('model', 'DeepSeek-V4-Pro')
  reader.setAppearance('effort', 'Max')
  reader.setAppearance('permission', '仅可查看')
  const reopened = ngaReader(api, storage)
  assert.deepEqual(reopened.snapshot().appearance, { model: 'DeepSeek-V4-Pro', effort: 'Max', permission: '仅可查看' })
  assert.equal(calls.length, 0)
  await reopened.open(1, 1)
  reopened.draft({ text: '一条回复' })
  await reopened.submit()
  const payload = calls.find(([key]) => key === 'reply')[1]
  assert.deepEqual(Object.keys(payload).sort(), ['board', 'id', 'mode', 'quote', 'requestId', 'site', 'text'])
})
