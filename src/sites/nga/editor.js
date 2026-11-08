import { imageUrl, linkUrl } from './markup-urls.js'
import { smileGroups, smileUrl } from './smiles.js'

export const ngaEditor = { editReply, imageUrl, linkUrl, smileGroups, smileUrl }

const tags = { bold: 'b', strike: 'del', quote: 'quote' }

// 暂存替换范围：弹层里的输入框拿走焦点后，仍插回原来的选区。
export function editReply(text, [start, end], kind, value = '') {
  const selected = text.slice(start, end)
  let replacement, from, to
  if (Object.hasOwn(tags, kind)) {
    const tag = tags[kind]
    replacement = '[' + tag + ']' + selected + '[/' + tag + ']'
    from = start + tag.length + 2
    to = from + selected.length
  } else if (kind === 'face') {
    if (typeof value !== 'string') return { error: '请选择一个表情。' }
    const code = smileUrl(value) ? value : 'ac:' + value
    if (!smileUrl(code)) return { error: '请选择一个表情。' }
    replacement = '[s:' + code + ']'
  } else if (kind === 'link' || kind === 'image') {
    const url = value.trim()
    if (kind === 'link') {
      if (!linkUrl(url)) return { error: '请输入完整的 http 或 https 链接。' }
      const label = selected.trim()
      replacement = label && label !== url ? '[url=' + url + ']' + label + '[/url]' : '[url]' + url + '[/url]'
    } else {
      const image = imageUrl(url)
      if (!image) return { error: '请输入 NGA 附件的图片地址。' }
      replacement = '[img]' + (/^\.\/mon_/i.test(url) ? url : image) + '[/img]'
    }
  } else throw new Error('Unknown reply tool')
  const next = text.slice(0, start) + replacement + text.slice(end)
  if (next.length > 8000) return { error: '插入后会超过 8000 字，请先缩短草稿。' }
  return { text: next, selection: [from ?? start + replacement.length, to ?? start + replacement.length] }
}
