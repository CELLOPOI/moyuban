import { ReaderError } from '../shared/errors.js'
import { ngaSite } from '../sites/nga/index.js'
import { readAttachment } from '../sites/xhs/media.js'
import { readingActions } from './actions.js'
import { boardLibrary } from './board-library.js'
import { mediaCache } from './cache.js'
import { readerSettings } from './settings.js'
import { siteRegistry } from './sites.js'
import { boardWorkspace } from './workspace.js'

export const name = 'dsh-moyu'
export const inject = ['connection', 'credentials', 'workspaceRegistry', 'sessionPersistence', 'sessions']

// 保留已有的程序化 NGA 调用入口，和 DSH 路由共用相同的校验与分发。
export function createActions(credentials, nga) {
  return readingActions(siteRegistry(credentials, nga ? [ngaSite(nga)] : undefined))
}

export function registerRoutes(ctx, sites, settings) {
  const media = mediaCache()
  const run = readingActions(sites)
  const catalog = boardLibrary(boardWorkspace(ctx), sites, () => ctx.workspaceRegistry.archivedSessionIds, settings)
  const boardActions = new Set(['workspace', 'syncBoards', 'openBoard', 'removeBoard'])
  // 这个精确路由由 DSH 自身验证身份，并限定为宿主 owner。
  ctx.connection.fetch.register({
    path: '/api/dsh-nga-reader', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      const headers = { 'Cache-Control': 'no-store' }
      try {
        if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new ReaderError('INVALID_INPUT', '请求格式无效。', 415)
        const raw = await request.text()
        const tooLong = () => new ReaderError('INVALID_INPUT', '请求内容过长。', 413)
        if (raw.length > 2 * 1024 * 1024) throw tooLong()
        let body
        try { body = JSON.parse(raw) } catch { throw new ReaderError('INVALID_INPUT', '请求格式无效。') }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ReaderError('INVALID_INPUT', '请求格式无效。')
        if (raw.length > 24000 && body.action !== 'saveBoardDirectory') throw tooLong()
        if (body.action === 'getSettings' || body.action === 'saveSettings') {
          sites.forRequest(body)
          const config = body.action === 'getSettings' ? await settings.read() : await settings.save(body.values, body.revision)
          return Response.json({ ...config, sites: sites.descriptions }, { headers })
        }
        return Response.json(boardActions.has(body.action) ? await catalog(body.action, body) : await run(body.action, body), { headers })
      } catch (error) {
        const known = error instanceof ReaderError
        return Response.json({ error: known ? error.code : 'INTERNAL', message: known ? error.message : '操作失败，请重新打开版面会话后重试。' },
          { status: known ? error.status : 500, headers })
      }
    },
  })
  ctx.connection.fetch.register({
    path: '/api/dsh-nga-reader.media', methods: ['GET'], requestBody: 'buffered',
    async fetch(request) {
      const params = new URL(request.url).searchParams
      const url = params.get('url')
      if (!url || url.length > 4096) return new Response(null, { status: 400 })
      try { return await media(sites.get(params.get('site') ?? undefined), url, await settings.read()) }
      catch (error) { if (error instanceof ReaderError) return new Response(null, { status: error.status }); throw error }
    },
  })
  ctx.connection.fetch.register({
    path: '/api/dsh-nga-reader.attachment', methods: ['GET'], requestBody: 'buffered',
    async fetch(request) {
      const p = new URL(request.url).searchParams
      try {
        const url = await sites.get('xhs').feed.attachment({ run: p.get('run'), id: p.get('id') }, p.get('kind'), p.get('index'))
        return await readAttachment(url, p.get('kind'), request)
      } catch (error) { return new Response(null, { status: error instanceof ReaderError ? error.status : 502, headers: { 'Cache-Control': 'no-store' } }) }
    },
  })
}

export function apply(ctx) {
  const settings = readerSettings()
  const sites = siteRegistry(ctx.credentials, undefined, settings.read)
  registerRoutes(ctx, sites, settings)
  ctx.on('dispose', () => sites.get('xhs').feed.dispose())
}
