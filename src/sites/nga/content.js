import { decodeHTML } from 'entities'
import { parseFragment } from 'parse5'
import { linkUrl, imageUrl } from './markup-urls.js'
import { smileCodeFromUrl, smileUrl } from './smiles.js'

const otherTags = /\[\/?(?:i|u|color|size|font|align|pid|tid|uid|collapse|list|h)(?:=[^\]]*)?\]/gi
const faceLabel = code => '〔' + code.slice(code.indexOf(':') + 1) + '〕'

export function plain(value) {
  return decodeHTML(String(value ?? '')).replace(/<br\s*\/?>|<\/p>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(otherTags, '').replace(/\[s:([^\]\r\n]+)\]/gi, (_, code) => faceLabel(code))
    .replace(/\[\/?(?:b|s|del|url)(?:=[^\]]*)?\]/gi, '').replace(/\s+/g, ' ').trim()
}

export function postAuthor(value, uid) {
  const name = plain(value)
  if (/^#anony_/i.test(name)) return { author: '匿名用户' }
  if (name === '匿名用户' || name === '匿名') return { author: name }
  if (!/^[1-9]\d*$/.test(String(uid)) || !Number.isSafeInteger(Number(uid))) return { author: name || '匿名用户' }
  const authorId = Number(uid)
  const nameUid = /^UID[\s:：]*(\d+)$/i.exec(name)?.[1]
  const author = !name || nameUid === String(authorId) ? 'UID ' + authorId : name
  return { author, authorId }
}

const imageAttrs = ['data-srcorg', 'data-srclazy', 'data-srcnolazy', 'data-src', 'data-original', 'src']
const htmlTags = new Map([['blockquote', 'quote'], ['b', 'b'], ['strong', 'b'], ['del', 'del'], ['s', 'del']])

// 只提取正文、换行与受支持的标记。懒加载的 src 通常是占位图，优先取原图属性。
function forumMarkup(value) {
  if (!Array.isArray(value?.childNodes)) {
    const raw = String(value ?? '')
    if (!/<[!/?a-z]/i.test(raw)) return decodeHTML(raw)
    value = parseFragment(raw)
  }
  const parts = [], pending = [...value.childNodes].reverse()
  while (pending.length) {
    const node = pending.pop()
    if (typeof node === 'string') { parts.push(node); continue }
    const tag = node.tagName
    if (node.nodeName === '#text') { parts.push(node.value); continue }
    if (tag === 'script' || tag === 'style' || tag === 'template' || tag === 'noscript') continue
    if (tag === 'br') { parts.push('\n'); continue }
    if (tag === 'img') {
      const attrs = new Map(node.attrs.map(({ name, value }) => [name, value]))
      const url = imageAttrs.map(name => imageUrl(attrs.get(name))).find(Boolean)
      parts.push(url ? '[img]' + url + '[/img]' : '〔外部图片〕')
      continue
    }
    const mark = htmlTags.get(tag)
    if (mark) { parts.push('[' + mark + ']'); pending.push('[/' + mark + ']') }
    if (tag === 'p' || tag === 'div') pending.push('\n')
    const children = node.childNodes ?? []
    for (let i = children.length - 1; i >= 0; i--) pending.push(children[i])
  }
  return parts.join('')
}

function albumImages(_, contents) {
  const urls = contents.match(/(?:(?:https?:)?\/\/|\.\/|(?:\/?attachments\/)?mon_\d+\/)[^\s\[\]<>"',]+/gi)
  return urls ? urls.map(url => '[img]' + url + '[/img]').join('\n') : contents
}

const tokens = /\[(?<close>\/?)(?<tag>b|s|del|quote|url)(?:=(?<arg>[^\]\r\n]*))?\]|\[s:(?<face>[^\]\r\n]{1,64})\]|\[(?<media>img|attach)(?:-?\d{1,3}|=[^\]\r\n]*)?\](?<path>[^\[\]]+)\[\/\k<media>\]/gi

export function contentBlocks(value, attachments) {
  const source = forumMarkup(value).replace(otherTags, '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n')
    .replace(/\[album(?:=[^\]\r\n]*)?\]([\s\S]*?)\[\/album\]/gi, albumImages)
  const blocks = [], pictures = new Set()
  let runs = [], bold = 0, strike = 0, quoted = 0, href = null, start = 0

  function add(text, smile) {
    if (text) runs.push({ text, ...(smile && { smile }), ...(bold && { bold: true }), ...(strike && { strike: true }), ...(href && { href }) })
  }
  function flush() {
    const first = runs.findIndex(run => run.text.trim())
    if (first < 0) { runs = []; return }
    const line = runs.slice(first, runs.findLastIndex(run => run.text.trim()) + 1)
    runs = []
    line[0].text = line[0].text.trimStart()
    line.at(-1).text = line.at(-1).text.trimEnd()
    const text = line.map(run => run.text).join('')
    const styled = line.some(run => run.smile || run.bold || run.strike || run.href)
    blocks.push({ kind: quoted ? 'quote' : 'text', text, ...(styled && { runs: line }) })
  }
  function picture(url) {
    if (pictures.has(url)) return
    pictures.add(url)
    flush()
    blocks.push({ kind: 'image', url })
  }
  for (const match of source.matchAll(tokens)) {
    add(source.slice(start, match.index))
    start = match.index + match[0].length
    const { face, media, path, tag, close, arg } = match.groups
    if (face) {
      add(faceLabel(face), smileUrl(face))
    } else if (media) {
      const url = imageUrl(path)
      if (url) {
        const code = smileCodeFromUrl(url)
        if (code) add(faceLabel(code), smileUrl(code))
        else picture(url)
      } else add(media.toLowerCase() === 'attach' ? path : '〔外部图片〕')
    } else {
      const delta = close ? -1 : 1
      switch (tag.toLowerCase()) {
        case 'quote': flush(); quoted = Math.max(0, quoted + delta); break
        case 'b': bold = Math.max(0, bold + delta); break
        case 's': case 'del': strike = Math.max(0, strike + delta); break
        case 'url': {
          // 没写参数的 [url] 以标签内的文字作为目标地址。
          const end = !close && arg === undefined ? source.indexOf('[', start) : -1
          href = close ? null : linkUrl((arg ?? (end < 0 ? '' : source.slice(start, end))).trim())
          break
        }
      }
    }
  }
  add(source.slice(start))
  flush()
  for (const file of Object.values(attachments ?? {})) {
    if (!file || (file.type && !/^(?:img|image(?:\/[\w.+-]+)?)$/i.test(file.type))) continue
    const url = imageUrl(file.attachurl ?? file.url)
    if (url) picture(url)
  }
  return blocks
}
