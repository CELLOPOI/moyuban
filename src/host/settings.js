import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { defaults, sections } from '../shared/settings.js'
import { workspaceName } from '../shared/boards.js'
import { ReaderError } from '../shared/errors.js'
import { isBoardDataFile } from './board-files.js'
import { readTextOr, withLock, writeAtomic } from './files.js'
import { dshHome } from './workspace.js'

const json = value => JSON.stringify(value, null, 2) + '\n'
const revisionOf = text => createHash('sha256').update(text).digest('hex')
const invalid = message => new ReaderError('SETTINGS_INVALID', message, 422)

function expand(path) {
  if (path === '~') return homedir()
  return /^~[/\\]/.test(path) ? join(homedir(), path.slice(2)) : path
}

function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('配置文件需要包含一个 JSON 对象。')
  const values = { ...defaults }
  for (const [key, value] of Object.entries(input)) {
    // 旧配置仍按原文件计算修订号，只在用户保存时移除已退役的字段。
    if (key === 'defaultSource' && (value === 'live' || value === 'example')) continue
    if (!Object.hasOwn(defaults, key)) throw invalid('未知配置项 ' + key + '。')
    values[key] = value
  }
  for (const [, fields] of sections) for (const field of fields) {
    const value = values[field.key]
    if (field.path) {
      if (typeof value !== 'string' || value.includes('\0')) throw invalid(field.key + ' 需要填写目录路径。')
      values[field.key] = value.trim()
      if (values[field.key] && !isAbsolute(expand(values[field.key]))) throw invalid(field.key + ' 需要使用宿主的绝对路径或 ~/ 路径。')
    } else if (field.choices) {
      if (!field.choices.includes(value)) throw invalid(field.key + ' 可选值为 ' + field.choices.join('、') + '。')
    } else if (field.min !== undefined) {
      if (!Number.isSafeInteger(value) || value < field.min || value > field.max) throw invalid(field.key + ' 需要填写 ' + field.min + ' 到 ' + field.max + ' 的整数。')
    } else if (typeof value !== 'boolean') throw invalid(field.key + ' 需要填写 true 或 false。')
  }
  return values
}

export function readerSettings(home = dshHome()) {
  const base = join(home, 'plugin-data', 'dsh-nga-reader')
  const workspace = join(home, 'plugin-workspaces', workspaceName)
  const path = join(workspace, 'reader-settings.json')
  const pointer = join(base, 'board-location.json')
  let lastValid = defaults
  function snapshot(values, revision, warning = '') {
    return { values, path, revision, warning,
      cachePath: values.cacheDirectory ? resolve(expand(values.cacheDirectory), 'dsh-nga-reader-cache') : join(base, 'cache'),
      boardPath: values.boardDataDirectory ? resolve(expand(values.boardDataDirectory), 'dsh-nga-reader-boards') : join(base, 'boards') }
  }
  async function read(locked = false) {
    let raw = await readTextOr(path, null)
    if (raw === null) {
      if (!locked) return withLock(base, () => read(true))
      await mkdir(workspace, { recursive: true })
      raw = json(defaults)
      await writeAtomic(path, raw)
    }
    const revision = revisionOf(raw)
    try {
      const values = validate(JSON.parse(raw.replace(/^\uFEFF/, '')))
      lastValid = values
      return snapshot(values, revision)
    } catch (error) {
      return snapshot(lastValid, revision, error instanceof SyntaxError ? '配置文件的 JSON 格式有误。' : error.message)
    }
  }
  async function writable(dir) {
    const probe = join(dir, '.write-' + randomUUID())
    try { await mkdir(dir, { recursive: true }); await writeFile(probe, '', { flag: 'wx' }); await rm(probe) }
    catch (error) { throw invalid('目录无法写入：' + dir + '（' + (error.code ?? 'IO') + '）。') }
  }
  async function useLocation(target) {
    const saved = await readTextOr(pointer, null)
    const previous = saved === null ? join(base, 'boards') : JSON.parse(saved)
    if (saved !== null && previous === resolve(target)) {
      try { if ((await stat(target)).isDirectory()) return } catch (error) { if (error.code !== 'ENOENT') throw error }
      throw invalid('版面数据目录暂不可用：' + target)
    }
    await mkdir(target, { recursive: true })
    const actual = await realpath(target)
    if (saved !== null && previous === actual) return
    const marker = join(actual, '.reader-boards')
    const ready = await readTextOr(marker, null)
    const old = await realpath(previous).catch(error => { if (error.code !== 'ENOENT') throw error; return null })
    if (ready !== 'ready' && old !== actual) {
      const files = await readdir(actual)
      if (ready === 'copying' || !files.some(isBoardDataFile)) {
        if (!old && saved !== null) throw invalid('原版面数据目录暂不可用：' + previous)
        await writeFile(marker, 'copying')
        for (const name of (old ? await readdir(old) : []).filter(isBoardDataFile)) {
          await writeAtomic(join(actual, name), await readFile(join(old, name)))
        }
      }
    }
    await writeAtomic(marker, 'ready')
    await writeAtomic(pointer, json(actual))
  }
  return {
    read,
    withBoards: action => withLock(base, async () => {
      const settings = await read(true)
      if (settings.warning) throw invalid(settings.warning + ' 请打开阅读设置修正。')
      await useLocation(settings.boardPath)
      return action(settings)
    }),
    save: (input, revision) => withLock(base, async () => {
      const before = await read(true)
      if (before.revision !== revision) throw new ReaderError('SETTINGS_CHANGED', '配置文件已被其他窗口或编辑器修改，请重新读取。', 409)
      const values = validate(input), next = snapshot(values, '')
      await writable(next.cachePath)
      // 先准备好数据，再发布新的配置。复制失败时原文件和原数据仍然可用。
      await useLocation(next.boardPath)
      await writable(next.boardPath)
      if (revisionOf(await readTextOr(path, '')) !== revision) throw new ReaderError('SETTINGS_CHANGED', '配置文件已被编辑，请重新读取。', 409)
      await writeAtomic(path, json(values))
      return read(true)
    }),
  }
}
