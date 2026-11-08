import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import JSON5 from 'json5'
import { ReaderError } from '../../shared/errors.js'
import { withLock, writeAtomic } from '../../host/files.js'
import { forum, followedCategory as followed } from './forum.js'

const indexFile = '.目录.json', journalFile = '.目录保存中.json'
const invalid = message => new ReaderError('INVALID_DIRECTORY', message, 422)
const conflict = () => new ReaderError('DIRECTORY_CHANGED', '分类文件已被修改，请重新读取后再保存。', 409)
const json = value => JSON.stringify(value, null, 2) + '\n'

function categoryName(name) {
  if (typeof name !== 'string' || !name || name.trim() !== name || name.length > 100 || !name.isWellFormed() ||
      /[<>:"/\\|?*\u0000-\u001f]/u.test(name) || /^[.]|[.]$/u.test(name) ||
      /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name) || name === followed.name) {
    throw invalid('分类名不能留空、使用路径字符、系统保留名或“我关注的吧”。')
  }
  return name
}

function groupsOf(groups) {
  if (!Array.isArray(groups)) throw invalid('分类需要包含分组列表。')
  const names = new Set()
  return groups.map(group => {
    const name = group?.name?.trim?.()
    if (!name || names.has(name) || !Array.isArray(group.boards)) throw invalid('请填写不重复的分组名称和对应的吧列表。')
    names.add(name)
    const seen = new Set()
    const boards = group.boards.map(label => {
      const kw = typeof label === 'string' && label.trim().replace(/(.+)吧$/u, '$1')
      const ref = kw && !/[/\\?#]/.test(kw) && forum(kw)
      if (!ref) throw invalid('“' + name + '”里有无效的吧名。')
      if (seen.has(ref.sessionId)) throw invalid('“' + name + '”里重复添加了' + ref.name + '。')
      seen.add(ref.sessionId)
      return ref
    })
    return { name, boards }
  })
}

// 只接受 sections 的字面量。逐项读取也保留了“2025”“2024”等数字分组的原始顺序。
function parseSections(source) {
  const tokens = /(?:\s+|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)|"(?:\\[\s\S]|[^"\\\r\n])*"|'(?:\\[\s\S]|[^'\\\r\n])*'|[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*|\d+|[={}:,[\];]/uy
  let pos = 0, token
  function next() {
    do {
      if (pos === source.length) { token = null; return }
      tokens.lastIndex = pos
      const match = tokens.exec(source)
      if (!match) throw invalid('文件包含无法识别的内容。')
      token = match[0]; pos = tokens.lastIndex
    } while (/^(?:\s|\/)/u.test(token))
  }
  function take(value) { if (token !== value) return false; next(); return true }
  function need(value) { if (!take(value)) throw invalid('此处需要 ' + value + '。') }
  function string(key) {
    const value = token
    if (!value || !/^['"]/.test(value) && !(key && /^[$_\p{ID_Start}\d]/u.test(value))) throw invalid('请使用引号填写名称。')
    next()
    return /^['"]/.test(value) ? JSON5.parse(value) : value
  }
  function list(end, read) {
    const items = []
    while (!take(end)) {
      items.push(read())
      if (!take(',')) { need(end); break }
    }
    return items
  }
  next(); need('export'); need('const'); need('sections'); need('='); need('{')
  const groups = list('}', () => {
    const name = string(true); need(':'); need('[')
    return { name, boards: list(']', () => string(false)) }
  })
  if (take('as')) need('const')
  take(';')
  if (token !== null) throw invalid('文件末尾只能保留注释。')
  return groupsOf(groups)
}

function render(groups) {
  const lines = groups.map(g => '  ' + JSON.stringify(g.name) + ': [' + g.boards.map(b => JSON.stringify(b.name)).join(', ') + '],')
  return ['export const sections = {', ...lines, '};', ''].join('\n')
}

async function readText(path) {
  try {
    if (!(await lstat(path)).isFile()) throw invalid('目录内只能编辑普通文件：' + path)
    return await readFile(path, 'utf8')
  } catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

export function tiebaDirectory(workspace) {
  const path = join(workspace, '分类')
  let boards = new Map()
  const read = file => readText(join(path, file))
  async function write(file, contents, previous) {
    const target = join(path, file)
    if (contents === null) await rm(target)
    else if (previous === null) await writeFile(target, contents, { flag: 'wx', mode: 0o600 })
    else await writeAtomic(target, contents)
  }
  async function rollback(changes) {
    for (const { file, before, after } of [...changes].reverse()) {
      // 中断后可能有外部编辑，只恢复仍等于本次写入内容的文件。
      if (await read(file) === after) await write(file, before, after)
    }
    await rm(join(path, journalFile))
  }
  async function commit(changes) {
    if (!changes.length) return
    await writeAtomic(join(path, journalFile), json(changes))
    const written = []
    try {
      for (const { file, before, after } of changes) {
        if (await read(file) !== before) throw conflict()
        await write(file, after, before)
        written.push({ file, before, after })
      }
    } catch (error) { await rollback(written); throw error }
    await rm(join(path, journalFile))
  }
  async function locked(run) {
    await mkdir(path, { recursive: true })
    if (!(await lstat(path)).isDirectory()) throw invalid('“分类”需要是工作区内的普通目录。')
    return withLock(path, async () => {
      const journal = await read(journalFile)
      if (journal !== null) {
        const changes = JSON.parse(journal)
        for (const { file, before, after } of changes) {
          if (file !== indexFile && !(file.endsWith('.ts') && categoryName(file.slice(0, -3)))) throw invalid('目录恢复记录无效。')
          if ([before, after].some(v => v !== null && typeof v !== 'string')) throw invalid('目录恢复记录无效。')
        }
        await rollback(changes)
      }
      return run()
    })
  }
  async function scan() {
    let order = await read(indexFile)
    const names = (await readdir(path, { withFileTypes: true })).filter(item => item.isFile() && item.name.endsWith('.ts'))
      .map(item => item.name.slice(0, -3)).filter(name => name !== followed.name).sort()
    if (order === null) {
      order = json([])
      await commit([{ file: indexFile, before: null, after: order }])
    }
    let index
    try { index = JSON.parse(order); if (!Array.isArray(index)) throw new Error() }
    catch { throw invalid('“分类”内的 ' + indexFile + ' 格式无效，请修正分类顺序。') }
    const entries = new Map(), keys = new Set([followed.key])
    const remaining = new Set(names)
    for (const { key, name } of index) {
      if (typeof key === 'string' && key && !keys.has(key) && remaining.delete(name)) {
        keys.add(key); entries.set(name, key)
      }
    }
    for (const name of remaining) {
      let key = 'file-' + name
      while (keys.has(key)) key += '-'
      keys.add(key); entries.set(name, key)
    }
    const files = new Map(), categories = [followed], found = new Map()
    for (const [name, key] of entries) {
      const raw = await read(name + '.ts')
      if (raw === null) continue
      files.set(name + '.ts', raw)
      try {
        categoryName(name)
        const groups = parseSections(raw)
        categories.push({ key, name, groups })
        for (const group of groups) for (const ref of group.boards) found.set(ref.sessionId, ref)
      } catch (error) {
        categories.push({ key, name, groups: [], error: name + '.ts：' + (error instanceof ReaderError ? error.message : '名称的引号或转义无效。') })
      }
    }
    boards = found
    files.set(indexFile, order)
    const revision = createHash('sha256').update(JSON.stringify([...files])).digest('hex')
    return { files, result: { path, categories, revision } }
  }
  const snapshot = () => locked(async () => (await scan()).result)
  return {
    async initialize() { if (await read(indexFile) === null) await snapshot() },
    snapshot, read: async () => (await snapshot()).categories, find: id => boards.get(id),
    save: (draft, revision) => locked(async () => {
      const { files, result } = await scan()
      if (result.revision !== revision) throw conflict()
      if (!Array.isArray(draft)) throw invalid('需要普通分类列表。')
      const originals = new Map(result.categories.slice(1).map(c => [c.key, c]))
      const next = new Map(), used = new Set(), usedNames = new Set(), order = []
      for (const row of draft) {
        const key = row?.key ?? randomUUID(), old = originals.get(key)
        if (used.has(key) || (row?.key != null && !old)) throw invalid('分类编号重复或已失效。')
        const name = categoryName(row.name), folded = name.normalize('NFC').toLowerCase()
        if (usedNames.has(folded)) throw invalid('分类文件名重复：' + name)
        used.add(key); usedNames.add(folded); order.push({ key, name })
        // 未编辑的文件沿用原文，包括注释、换行和手工排版。
        let raw = old && files.get(old.name + '.ts')
        if (!(old?.error && row.groups === null)) {
          const groups = groupsOf(row.groups)
          if (!old || old.error || render(groups) !== render(old.groups)) raw = render(groups)
        }
        next.set(name + '.ts', raw)
      }
      next.set(indexFile, json(order))
      const changes = []
      for (const [file, before] of files) if (!next.has(file)) changes.push({ file, before, after: null })
      for (const [file, after] of next) {
        const before = files.get(file) ?? null
        if (before !== after) changes.push({ file, before, after })
      }
      await commit(changes)
      return (await scan()).result
    }),
  }
}
