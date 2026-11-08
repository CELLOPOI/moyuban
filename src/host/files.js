import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { ReaderError } from '../shared/errors.js'

export async function readTextOr(path, fallback) {
  try { return await readFile(path, 'utf8') }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error }
}

// 临时文件与目标位于同一目录，桌面和 Web 始终只能读到完整文件。
export async function writeAtomic(path, contents) {
  const temp = path + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temp, contents, { mode: 0o600, flag: 'wx' })
    await rename(temp, path)
  } finally { await rm(temp, { force: true }) }
}

// 桌面和 Web 可同时操作同一目录。整次读改写共用一把跨进程锁。
export async function withLock(base, run) {
  await mkdir(base, { recursive: true })
  const path = join(base, 'storage.lock')
  const deadline = Date.now() + 90_000
  let lock
  while (!lock) {
    try { lock = await open(path, 'wx', 0o600) }
    catch (error) {
      if (error.code !== 'EEXIST') throw error
      // 正常退出会释放锁，崩溃留下的锁只在持有进程已消失时回收。
      const owner = Number(await readTextOr(path, ''))
      let abandoned = false
      if (Number.isSafeInteger(owner) && owner > 0) {
        try { process.kill(owner, 0) } catch (reason) { abandoned = reason.code === 'ESRCH' }
      } else {
        const info = await stat(path).catch(() => null)
        abandoned = info && Date.now() - info.mtimeMs > 90_000
      }
      if (abandoned) await rm(path, { force: true })
      else if (Date.now() >= deadline) throw new ReaderError('STORAGE_BUSY', '版面数据正在被另一窗口使用，请稍后重试。', 503)
      else await delay(60)
    }
  }
  try { await lock.writeFile(String(process.pid)); return await run() }
  finally { await lock.close(); await rm(path, { force: true }) }
}
