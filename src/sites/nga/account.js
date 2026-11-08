import { randomUUID } from 'node:crypto'
import QRCode from 'qrcode'
import { ReaderError } from '../../shared/errors.js'

const expired = () => new ReaderError('LOGIN_EXPIRED', '二维码已失效，请重新扫码。', 410)

export function ngaAccount(api, grant) {
  let ticket
  async function complete(current) {
    const user = await api.pollLogin(current)
    if (ticket !== current || Date.now() >= current.expiresAt) throw expired()
    if (!user) return { state: 'pending' }
    await grant.save(() => {
      if (ticket !== current || Date.now() >= current.expiresAt) throw expired()
      return user
    })
    if (ticket === current) ticket = null
    return { state: 'connected', name: user.name }
  }
  return {
    read: grant.read,
    id(user) {
      if (!/^\d+$/.test(user.uid)) throw new ReaderError('NGA_ACCESS', '请重新连接 NGA 账号。', 403)
      return String(user.uid)
    },
    async login() {
      const keys = await api.beginLogin()
      const image = await QRCode.toDataURL(keys.url, { width: 232, margin: 3, errorCorrectionLevel: 'M' })
      ticket = { ...keys, id: randomUUID(), expiresAt: Date.now() + 120_000 }
      return { id: ticket.id, expiresAt: ticket.expiresAt, image }
    },
    async poll({ id }) {
      const current = ticket
      if (!current || current.id !== id || Date.now() >= current.expiresAt) throw expired()
      // 两个窗口同时轮询时，只兑换一次。
      current.pending ??= complete(current).finally(() => { delete current.pending })
      return current.pending
    },
    async logout() {
      ticket = null
      await grant.clear()
      return { connected: false }
    },
  }
}
