import { SaxesParser } from 'saxes'

// NGA 把 JSON 的数字键写成 <item i="…">，其中用户表的键是 UID，不能按出现顺序重排。
export function parseForumXml(text) {
  const parser = new SaxesParser()
  const stack = []
  let root = null
  parser.on('doctype', () => { throw new Error('Unexpected XML doctype') })
  parser.on('opentag', ({ name, attributes }) => {
    const parent = stack.at(-1)
    if ((!parent && name !== 'root') || stack.length >= 64) throw new Error('Invalid forum XML')
    const key = name === 'item' && parent ? attributes.i ?? String(parent.next) : name
    if (parent) parent.next++
    stack.push({ key, text: '', children: null, next: 0 })
  })
  const append = value => { if (stack.length) stack.at(-1).text += value }
  parser.on('text', append)
  parser.on('cdata', append)
  parser.on('closetag', () => {
    const node = stack.pop()
    const value = node.children ?? node.text
    const parent = stack.at(-1)
    if (parent) (parent.children ??= Object.create(null))[node.key] = value
    else root = value
  })
  try {
    parser.write(text).close()
    return root && typeof root === 'object' ? root : null
  } catch { return null }
}
