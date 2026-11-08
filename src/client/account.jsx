import React, { useEffect, useRef, useState } from 'react'

export function AccountDialog({ reader, account, onClose, onChange }) {
  const { api, site } = reader
  const dialog = useRef(null)
  const [revision, setRevision] = useState(0)
  const [qr, setQr] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [scanned, setScanned] = useState(false)
  useEffect(() => { dialog.current.showModal() }, [])
  useEffect(() => {
    if (account.connected) return
    const controller = new AbortController()
    const signal = controller.signal
    let timer, ticketId
    setQr(''); setError(''); setScanned(false)
    async function start() {
      const ticket = await api('login', {}, signal)
      if (signal.aborted) return
      ticketId = ticket.id
      setQr(ticket.image)
      async function poll() {
        try {
          if (Date.now() >= ticket.expiresAt) throw new Error('二维码已过期，请重新获取。')
          const result = await api('poll', { id: ticket.id }, signal)
          if (signal.aborted) return
          if (result.state === 'connected') { ticketId = null; await onChange(); onClose(); return }
          if (result.state === 'scanned') setScanned(true)
          timer = setTimeout(poll, 2400)
        } catch (err) { if (!signal.aborted) { setError(err.message); setQr('') } }
      }
      timer = setTimeout(poll, 2200)
    }
    void start().catch(err => { if (!signal.aborted) setError(err.message) })
    return () => {
      controller.abort(); clearTimeout(timer)
      if (site.capabilities?.followed && ticketId) void api('cancelLogin', { id: ticketId }).catch(() => {})
    }
  }, [revision, account.connected, api])

  async function logout() {
    setBusy(true)
    try { await api('logout'); await onChange(); onClose() }
    catch (err) { setError(err.message); setBusy(false) }
  }
  return <dialog ref={dialog} className="ngar-dialog" aria-label={site.name + ' 账号'} onCancel={onClose}>
    <div className="ngar-dialog-head"><h2>{account.connected ? site.name + ' 账号' : '连接 ' + site.name}</h2><button onClick={onClose} aria-label="关闭账号窗口">×</button></div>
    {account.connected ? <><p>当前账号　<strong>{account.name}</strong></p><button className="ngar-btn" onClick={logout} disabled={busy}>断开账号</button></> :
      <>{(!error || !site.capabilities?.followed) && <p>{scanned ? '已扫码，请在手机上确认登录。' : '用' + (site.capabilities?.followed ? '百度 App' : site.name + ' 客户端') + '扫码，并在手机上确认登录。'}</p>}
        {qr ? <img className="ngar-qr" alt={site.name + ' 登录二维码'} src={qr} /> : !error && <p role="status">正在获取二维码…</p>}
        {error && <button className="ngar-btn" onClick={() => setRevision(revision + 1)}>重新获取二维码</button>}
      </>}
    {error && <p role="alert">{error}</p>}
  </dialog>
}
