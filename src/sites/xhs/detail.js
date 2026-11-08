import { ReaderError } from '../../shared/errors.js'
import { cardLink, commentPage, detailNote, mediaUrl, official, origin } from './content.js'

export const unavailable = () => new ReaderError('SOURCE_UNAVAILABLE', '来源暂时没有返回内容，请稍后重试。', 502)
export const restricted = () => new ReaderError('SOURCE_RESTRICTED', '来源限制了本次访问。已读条目会保留，请稍后再试。', 403)
export const loginRequired = () => new ReaderError('LOGIN_REQUIRED', '来源需要登录，请从输入栏的「＋」连接账号。', 401)
const missing = () => new ReaderError('NOTE_UNAVAILABLE', '来源显示这篇笔记已删除或不存在。', 404)
const inaccessible = () => new ReaderError('NOTE_UNAVAILABLE', '这篇笔记当前无法在来源网页查看。', 404)
const limited = () => new ReaderError('SOURCE_RATE_LIMITED', '来源访问过于频繁，请稍后再试。', 429)

// 仅把官网已明确的原因交给阅读端，错误正文、签名和跳转地址都留在浏览器内。
function messageError(message, note) {
  if (typeof message !== 'string') return null
  if (/访问.{0,8}频繁|请求.{0,8}频繁|操作.{0,8}频繁|访问次数.{0,6}上限/.test(message)) return limited()
  if (note && /仅自己可见|私密笔记|无权(?:限)?查看|(?:笔记|内容).{0,8}私密|(?:去|前往|请在).{0,8}app.{0,6}查看/i.test(message)) return inaccessible()
  if (note && /(?:笔记|内容|作品).{0,12}(?:删除|不存在)|作者.{0,8}删除/.test(message)) return /可能/.test(message) ? inaccessible() : missing()
  if (/请.{0,4}登录|未登录|登录.{0,6}(?:过期|失效)/.test(message)) return loginRequired()
  if (/访问受限|安全限制|安全验证|风险验证|网络环境.{0,8}异常/.test(message)) return restricted()
  return null
}

export function responseError(status, body, note = false) {
  if (status < 400 && (body?.code == null || Number(body.code) === 0) && body?.success !== false) return null
  if (status === 429) return limited()
  if (status === 401 || Number(body?.code) === -100) return loginRequired()
  const message = messageError(body?.msg ?? body?.message, note)
  if (message) return message
  if (note && (status === 404 || status === 410)) return inaccessible()
  if (status === 403 || status === 451 || Number(body?.code) === 300012) return restricted()
  return unavailable()
}

export function checkPage(page, note = false) {
  if (!page || page.isClosed()) throw unavailable()
  checkLocation(page.url(), note)
}

export function checkLocation(address, note = false) {
  const u = new URL(address)
  if (!official(u.hostname)) throw restricted()
  if (u.pathname.includes('/error') || u.searchParams.has('error_code') || u.pathname.includes('/404')) {
    throw messageError(u.searchParams.get('error_msg'), note) ??
      (u.pathname.includes('/404') && note ? inaccessible() : restricted())
  }
  if (/\/(?:website-)?login(?:\/|$)/.test(u.pathname)) throw loginRequired()
}

export const noteRoot = '#noteContainer, .note-detail-mask .note-container'

function slotDetail(slot, id) {
  const note = detailNote(slot?.note, id)
  return note && { note, comments: commentPage(slot.comments) }
}

export function stateDetail(state, id) {
  const map = state?.note?.noteDetailMap
  return slotDetail(map?.[id] ?? Object.values(map ?? {}).find(s => (s?.note?.noteId ?? s?.note?.note_id) === id), id)
}

// 只有详情接口未给出内容时才用官网页面。独立文档、或从索引点击后新出现的详情，
// 必须位于目标笔记地址；若正文容器也带编号，两者还必须一致。
export async function displayedDetail(page, card, fresh) {
  const result = await page.evaluate(({ id, root, fresh, origin }) => {
    if (location.origin !== origin) return null
    const visible = el => el?.getClientRects().length > 0
    const notice = [...document.querySelectorAll('.note-error,.error-page,.not-found-container,[role="alert"],.d-message-content,.reds-toast')]
      .filter(visible).map(el => el.innerText || '').join(' ').slice(0, 400)
    if (location.pathname !== '/explore/' + id) return { notice }
    const slot = window.__INITIAL_STATE__?.note?.noteDetailMap?.[id]
    if ((slot?.note?.noteId ?? slot?.note?.note_id ?? slot?.note?.id) === id) return { slot, notice }
    const el = [...document.querySelectorAll(root)].find(visible)
    const marker = el?.getAttribute('data-note-id')
    if (!el || (marker ? marker !== id : !fresh)) return { notice }
    const value = selector => el.querySelector(selector)?.innerText?.trim() || ''
    const video = el.querySelector('video')
    const wrapper = el.querySelector('.swiper-wrapper'), slides = [...(wrapper?.children ?? [])]
      .filter(child => child.matches('.swiper-slide:not(.swiper-slide-duplicate)')).slice(0, 100)
    const images = []
    for (const [i, slide] of slides.entries()) {
      const img = slide.querySelector('img'), index = slide.getAttribute('data-swiper-slide-index')
      const position = /^\d{1,2}$/.test(index) ? Number(index) : i
      if (img && !images[position]) images[position] = { url_default: img.currentSrc || img.getAttribute('src'),
        url: img.getAttribute('data-src'), width: img.naturalWidth, height: img.naturalHeight }
    }
    // 循环轮播会重排或复制 DOM；已知页数但尚未挂载的图保留原位置。
    const total = Math.min(100, Math.max(images.length, slides.length,
      Number(el.querySelector('.swiper-pagination-total')?.textContent) || 0, el.querySelectorAll('.swiper-pagination-bullet').length))
    return { notice, player: video?.currentSrc || video?.src || video?.querySelector('source')?.src,
      note: { note_id: id, title: value('#detail-title,.note-content .title'), desc: value('#detail-desc,.note-content .desc'),
      user: { nickname: value('.author-wrapper .name,.author .username,.author .name') },
      type: video ? 'video' : undefined, image_list: Array.from({ length: total }, (_, i) => images[i] ?? {}) } }
  }, { id: card.id, root: noteRoot, fresh, origin }).catch(() => null)
  if (!result) return null
  const error = messageError(result.notice, true)
  if (error) throw error
  if (!cardLink(page.url(), card.id)) return null
  if (result.slot) return slotDetail(result.slot, card.id)
  if (result.note) {
    const note = detailNote({ ...result.note, type: result.note.type ?? card.type }, card.id)
    note.video = mediaUrl(result.player)
    if (note.body || note.video || note.images.some(i => i.url)) return { note, rendered: true }
  }
  return null
}
