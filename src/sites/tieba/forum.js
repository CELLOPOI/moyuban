import { boardRef } from '../../shared/boards.js'

export const followedCategory = { key: 'followed', name: '我关注的吧', kind: 'followed', groups: [] }

export function forum(name) {
  if (typeof name !== 'string' || !name.trim()) return null
  const kw = name.trim()
  return boardRef('tieba', 'bar', kw.replace(/[A-Z]/g, letter => letter.toLowerCase()), kw + '吧')
}
