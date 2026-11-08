import { unconfirmedReplyMessage } from '../shared/errors.js'

const route = '/api/dsh-nga-reader'

export function mediaAddress(site, url) {
  return route + '.media?' + new URLSearchParams({ site, url })
}

export async function call(action, fields = {}, signal) {
  let response
  try {
    response = await fetch(route, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, action }), signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error(action === 'reply' ? unconfirmedReplyMessage : '与 DSH 的连接中断，请重试。')
  }
  let result
  try { result = await response.json() } catch {
    throw new Error(action === 'reply' ? unconfirmedReplyMessage : '无法连接阅读插件，请检查它是否已在当前 DSH 启用。')
  }
  if (!response.ok) {
    const message = result?.message || (action === 'reply' ? unconfirmedReplyMessage : '请求失败，请重试。')
    throw Object.assign(new Error(message), { code: result?.error })
  }
  return result
}
