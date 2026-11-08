import { positive, ReaderError } from '../../shared/errors.js'
import { createNga } from './api.js'
import { ngaAccount } from './account.js'
import { parseBoardInput } from './boards.js'
import { imageUrl } from './markup-urls.js'

export function ngaSite(api = createNga()) {
  return {
    id: 'nga', name: 'NGA', editor: 'nga-bbcode', replyRequiresLogin: true,
    inputHint: '例如：二次元国家地理 或 fid=-447601',
    list: ({ board, page, account }) => api.list(page, account, board),
    thread: ({ id, page, account }) => api.thread(id, page, account),
    reply: ({ id, text, quote, account }) => api.reply(id, text, quote, account),
    createAccount: grant => ngaAccount(api, grant),
    topicId: value => positive(value, '帖子编号'),
    quoteTarget({ postId, pid = postId, floor, page, excerpt }) {
      // 0.7.0 的端内引用用 pid 保存，主楼允许编号为零。
      if (![pid, floor].every(id => Number.isSafeInteger(id) && id >= 0) || (!pid && floor) || typeof excerpt !== 'string') {
        throw new ReaderError('INVALID_INPUT', '引用楼层无效。')
      }
      return { pid, floor, page: positive(page, '引用页码'), excerpt: excerpt.slice(0, 160) }
    },
    directory: () => api.directory(),
    favorites: account => api.favorites(account),
    searchBoards: (query, account) => api.searchBoards(query, account),
    parseBoard(input) {
      if (typeof input !== 'string') return null
      const ref = parseBoardInput(input)
      if (!ref && /^(?:https?:|www\.|(?:bbs\.)?nga\.|ngabbs\.|-?\d+$|(?:fid|stid)\s*[=:：])/i.test(input)) {
        throw new ReaderError('INVALID_INPUT', '请输入 NGA 版面链接、版面编号或 stid=合集编号。')
      }
      return ref
    },
    resolveBoard: (board, account) => api.resolveBoard(board, account),
    imageUrl,
  }
}
