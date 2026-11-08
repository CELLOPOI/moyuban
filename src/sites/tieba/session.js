const passport = 'passport.baidu.com', tieba = 'tieba.baidu.com'
export const baiduDomains = new Set([passport, tieba, 'wappass.baidu.com'])
const storedNames = /^(?:BDUSS|PTOKEN|STOKEN|BAIDUID)(?:_BFESS)?$/
export const cookieValue = value => typeof value === 'string' && /^[\x21-\x2b\x2d-\x3a\x3c-\x7e]+$/.test(value)

const acceptsDomain = (host, domain) => host === domain || (domain === 'baidu.com' && host.endsWith('.baidu.com'))
const acceptsPath = (path, base) => path === base || path.startsWith(base.endsWith('/') ? base : base + '/')

export function baiduSession(account = {}) {
  const jar = new Map()
  const key = row => [row.domain, row.path, row.name].join('\n')
  function put(row) { jar.set(key(row), row) }

  if (Array.isArray(account.sessionCookies)) {
    for (const row of account.sessionCookies) {
      if (storedNames.test(row.name) && cookieValue(row.value) &&
          (row.domain === 'baidu.com' || baiduDomains.has(row.domain)) && row.path?.startsWith('/')) put({ ...row })
    }
  } else {
    // 旧包只保存平铺的凭据。缺少作用域的 PTOKEN 只给账号中心，STOKEN 只给贴吧。
    for (const [name, value] of Object.entries(account.cookies ?? {})) {
      if (!storedNames.test(name) || !cookieValue(value)) continue
      const domain = name.startsWith('PTOKEN') ? passport : name.startsWith('STOKEN') ? tieba : 'baidu.com'
      put({ name, value, domain, path: '/' })
    }
  }

  function receive(url, headers) {
    if (url.protocol !== 'https:' || !baiduDomains.has(url.hostname)) return
    for (const header of headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(';')
      const match = /^([\w-]+)=(.*)$/.exec(pair.trim())
      if (!match) continue
      const attrs = new Map(attributes.map(part => {
        const attr = part.trim(), split = attr.indexOf('=')
        return split < 0 ? [attr.toLowerCase(), ''] : [attr.slice(0, split).toLowerCase(), attr.slice(split + 1)]
      }))
      const domain = (attrs.get('domain') || url.hostname).toLowerCase().replace(/^\./, '')
      if (!acceptsDomain(url.hostname, domain)) continue
      const path = attrs.get('path')?.startsWith('/') ? attrs.get('path') : url.pathname.slice(0, url.pathname.lastIndexOf('/')) || '/'
      const row = { name: match[1], value: match[2], domain, path }
      const age = attrs.get('max-age')
      const expires = age != null && /^-?\d+$/.test(age) ? Date.now() + Number(age) * 1000 : Date.parse(attrs.get('expires'))
      if (Number.isFinite(expires)) row.expires = expires
      if (!row.value || row.value.toLowerCase() === 'deleted' || expires <= Date.now()) jar.delete(key(row))
      else if (cookieValue(row.value)) put(row)
    }
  }

  function applicable(url) {
    if (url.protocol !== 'https:' || !baiduDomains.has(url.hostname)) return []
    return [...jar.values()].filter(row => (row.expires == null || row.expires > Date.now()) &&
      acceptsDomain(url.hostname, row.domain) && acceptsPath(url.pathname, row.path))
      .sort((a, b) => b.path.length - a.path.length || b.domain.length - a.domain.length)
  }
  function snapshot() {
    return [...jar.values()].filter(row => storedNames.test(row.name) && (row.expires == null || row.expires > Date.now()))
      .sort((a, b) => key(a).localeCompare(key(b))).map(row => ({ ...row }))
  }
  return {
    receive, snapshot,
    header: url => applicable(url).map(row => row.name + '=' + row.value).join('; '),
    hasLogin: () => applicable(new URL('https://' + tieba + '/')).some(row => /^BDUSS(?:_BFESS)?$/.test(row.name)),
    hasTiebaToken: url => applicable(url).some(row => row.domain === tieba && /^STOKEN(?:_BFESS)?$/.test(row.name)),
    acceptPassportSession(values) {
      if (!values) return
      const existing = applicable(new URL('https://' + passport + '/'))
      for (const name of ['BDUSS', 'BDUSS_BFESS', 'PTOKEN', 'STOKEN', 'PTOKEN_BFESS', 'STOKEN_BFESS']) {
        const value = values[name.toLowerCase()]
        if (cookieValue(value) && value !== 'deleted' && !existing.some(row => row.name === name)) {
          put({ name, value, domain: name.startsWith('BDUSS') ? 'baidu.com' : passport, path: '/' })
        }
      }
    },
  }
}
