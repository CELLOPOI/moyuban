import JSON5 from 'json5'
import { parse, serialize } from 'parse5'
import { contentBlocks, plain, postAuthor } from './content.js'

const attribute = (node, name) => node?.attrs?.find(attr => attr.name === name)?.value
const nodeText = node => node ? plain(serialize(node)) : ''

function* walk(root) {
  const pending = [root]
  while (pending.length) {
    const node = pending.pop()
    yield node
    const children = node.childNodes ?? []
    for (let i = children.length - 1; i >= 0; i--) pending.push(children[i])
  }
}

// 只读取网页内公布的数据字面量，不执行 NGA 的脚本。
function literal(source) {
  try { return JSON5.parse(source) } catch { return null }
}

function readPageInfo(scripts, id, requestedPage) {
  const header = scripts.find(code => /\b__CURRENT_TID\s*=/.test(code) && /\b__CURRENT_PAGE\s*=/.test(code))
  if (Number(/\b__CURRENT_TID\s*=\s*(\d+)/.exec(header)?.[1]) !== id) return null
  const page = Number(/\b__CURRENT_PAGE\s*=\s*(\d+)/.exec(header)?.[1])
  if (!Number.isSafeInteger(page) || page < 1) return null
  const pager = scripts.find(code => /^\s*var\s+__PAGE\s*=/.test(code))
  // 单页帖不输出翻页栏。多页帖以 NGA 给出的页数为准，不能按可见楼数估算。
  let pages = 1
  if (pager) {
    const match = /^\s*var\s+__PAGE\s*=\s*(\{[^;]+?\})\s*;/.exec(pager)
    const info = match && literal(match[1])
    if (!info || Number(info[2]) !== page) return null
    pages = Number(info[1])
  }
  if (!Number.isSafeInteger(pages) || pages < page || page !== requestedPage) return null
  return { page, pages }
}

function readFloor(row, floor, users) {
  const fields = new Map()
  let attachments
  for (const node of walk(row)) {
    const id = attribute(node, 'id')
    if (id) fields.set(id, node)
    if (node.tagName === 'script') {
      const match = /^\s*ubbcode\.attach\.load\(\s*['"]postattach(\d+)['"]\s*,\s*['"]postcontent\1['"]\s*,\s*(\[[\s\S]*\])\s*,/.exec(node.childNodes[0]?.value)
      if (match && Number(match[1]) === floor) attachments = literal(match[2])
    }
  }
  const container = fields.get('postcontainer' + floor)
  const content = fields.get('postcontent' + floor)
  const anchor = container?.childNodes.find(node => node.tagName === 'a' && /^pid\d+Anchor$/.test(attribute(node, 'id')))
  if (!content || !anchor) return null
  const pid = Number(attribute(anchor, 'id').slice(3, -6))
  if (!Number.isSafeInteger(pid) || (!pid && floor !== 0)) return null
  const authorLink = fields.get('postauthor' + floor)
  const uid = /[?&]uid=(-?\d+)(?:&|$)/.exec(attribute(authorLink, 'href'))?.[1]
  const user = users?.[uid]
  const author = nodeText(authorLink) || (typeof user === 'string' ? user : user?.username)
  const date = nodeText(fields.get('postdate' + floor))
  const time = Date.parse(date.replace(' ', 'T') + '+08:00')
  return { id: pid, pid, floor, ...postAuthor(author, uid), time: Number.isFinite(time) ? time / 1000 : 0, blocks: contentBlocks(content, attachments) }
}

export function parseThreadHtml(html, id, requestedPage) {
  if (typeof html !== 'string' || !html.includes('<!--postlistend-->')) return null
  const doc = parse(html)
  const scripts = []
  let list, title
  for (const node of walk(doc)) {
    const nodeId = attribute(node, 'id')
    if (nodeId === 'm_posts_c') list = node
    if (node.tagName === 'h1' && nodeId === 'currentTopicName') title = nodeText(node)
    if (node.tagName === 'script') scripts.push(node.childNodes[0]?.value ?? '')
  }
  const navigation = readPageInfo(scripts, id, requestedPage)
  if (!list || !title || !navigation) return null
  const start = list.childNodes.findIndex(node => node.nodeName === '#comment' && node.data === 'postliststart')
  const end = list.childNodes.findIndex(node => node.nodeName === '#comment' && node.data === 'postlistend')
  if (start < 0 || end <= start) return null

  const userScript = scripts.find(code => /^\s*\/\/userinfostart\b/.test(code))
  const userData = /commonui\.userInfo\.setAll\(\s*(\{[\s\S]*?\})\s*\)\s*;?\s*\/\/userinfoend/.exec(userScript)
  const users = userData && literal(userData[1])
  const posts = []
  const seenFloors = new Set()
  for (const node of list.childNodes.slice(start + 1, end)) {
    if (node.tagName !== 'table') continue
    for (const row of walk(node)) {
      if (row.tagName !== 'tr') continue
      const match = /^post1strow(\d+)$/.exec(attribute(row, 'id'))
      if (!match) continue
      // 楼层可以有空号；贴条不是独立楼层。引用使用页面锚点里的真实 PID。
      const floor = Number(match[1])
      if (!Number.isSafeInteger(floor) || seenFloors.has(floor)) return null
      const post = readFloor(row, floor, users)
      if (!post) return null
      posts.push(post)
      seenFloors.add(floor)
    }
  }
  return posts.length ? { id, title, ...navigation, posts } : null
}
