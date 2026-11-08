import { decodeHTML } from 'entities'
import { parseFragment } from 'parse5'

const origin = 'https://tieba.baidu.com'
export function webUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value, base)
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url : null
  } catch { return null }
}

export function imageUrl(value) {
  const url = webUrl(value)
  if (!url || url.port) return null
  const { hostname, pathname } = url
  const picture = ['tiebapic.baidu.com', 'imgsrc.baidu.com', 'imgsa.baidu.com'].includes(hostname) && pathname.startsWith('/forum/')
  const smile = /^(?:tb[0-9]*\.bdstatic\.com|gsp[0-9]\.baidu\.com)$/.test(hostname) && pathname.includes('/tb/editor/images/')
  if (!picture && !smile) return null
  url.protocol = 'https:'
  return url.href
}

export const plainText = value => typeof value === 'string' ? decodeHTML(value.replace(/<br\s*\/?>/gi, '\n')) : ''
const authorOf = value => plainText(value?.name_show || value?.show_nickname || value?.name) || '匿名吧友'

export function blocksOf(content) {
  const blocks = []
  let runs = []
  function flush() {
    const text = runs.map(run => run.text).join('')
    if (text.trim()) blocks.push(runs.some(run => run.href || run.smile) ? { kind: 'text', text, runs } : { kind: 'text', text })
    runs = []
  }
  for (const part of Array.isArray(content) ? content : []) {
    if (!part) continue
    const type = Number(part.type)
    if (type === 3) {
      const url = [part.origin_src, part.big_cdn_src, part.src].map(imageUrl).find(Boolean)
      if (url) { flush(); blocks.push({ kind: 'image', url }) }
      else runs.push({ text: '〔图片〕' })
    } else if (type === 2) {
      const text = '〔' + (plainText(part.c || part.text) || '表情') + '〕'
      const smile = imageUrl(part.src)
      runs.push(smile ? { text, smile } : { text })
    } else {
      const href = type === 1 && webUrl(part.link || part.text)?.href
      const text = plainText(part.text || part.c) || href || ({ 5: '〔视频〕', 10: '〔语音〕' }[type] ?? '')
      if (text) runs.push(href ? { text, href } : { text })
    }
  }
  flush()
  return blocks
}

export function postOf(post) {
  return { id: post.id, floor: Number(post.floor), author: authorOf(post.author), authorId: post.author?.id,
    time: Number(post.time) || 0, blocks: blocksOf(post.content), replyCount: Number(post.sub_post_number) || 0 }
}

const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value
const has = (node, cls) => attr(node, 'class')?.split(/\s+/).includes(cls)
function* walk(node) {
  yield node
  for (const child of node.childNodes ?? []) yield* walk(child)
}
function contentParts(node, href) {
  if (node.nodeName === '#text') return [{ text: node.value, href }]
  if (['script', 'style', 'iframe', 'template'].includes(node.tagName)) return []
  if (node.tagName === 'br') return [{ text: '\n' }]
  if (node.tagName === 'img') {
    const smile = imageUrl(attr(node, 'src'))
    const text = attr(node, 'alt') || '〔表情〕'
    return [smile ? { text, smile } : { text }]
  }
  if (node.tagName === 'a') href = webUrl(attr(node, 'href'), origin)?.href
  return (node.childNodes ?? []).flatMap(child => contentParts(child, href))
}

// 楼中楼网页返回 HTML 片段。只提取文字、链接和受支持的表情，不向 DSH 注入网页。
export function floorReplies(html) {
  const rows = [], seen = new Set()
  for (const li of walk(parseFragment(html))) {
    if (li.tagName !== 'li' || !has(li, 'list_item_floor')) continue
    const id = attr(li, 'pid')
    if (!/^[1-9]\d*$/.test(id) || seen.has(id)) continue
    const nodes = [...walk(li)]
    const body = nodes.find(node => has(node, 'floor_content'))
    if (!body) continue
    seen.add(id)
    const author = nodes.find(node => has(node, 'user_name'))
    const runs = contentParts(body)
    if (runs.length) { runs[0].text = runs[0].text.trimStart(); runs.at(-1).text = runs.at(-1).text.trimEnd() }
    const text = runs.map(run => run.text).join('')
    rows.push({ id, author: (author && contentParts(author).map(run => run.text).join('').trim().replace(/[:：]$/, '')) || '匿名吧友',
      blocks: text ? [{ kind: 'text', text, runs: runs.filter(run => run.text) }] : [] })
  }
  return rows
}
