export class ReaderError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

export const unconfirmedReplyMessage = '发送结果未确认，请刷新帖子核对后再决定是否重发。'

export function requireReplyReceipt(receipt) {
  if (receipt?.sent !== true) throw new ReaderError('REPLY_UNKNOWN', unconfirmedReplyMessage, 502)
  return receipt
}

export function positive(value, label) {
  if (typeof value !== 'number' && typeof value !== 'string') throw new ReaderError('INVALID_INPUT', label + '无效。')
  const number = Number(value)
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(number)) {
    throw new ReaderError('INVALID_INPUT', label + '无效。')
  }
  return number
}
