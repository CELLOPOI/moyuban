import React, { useContext, useState } from 'react'
import { ReadingOptions } from './preferences.jsx'
import { mediaAddress } from './host-api.js'

export function ForumImage({ site, url, alt, fallback, ...props }) {
  const { mediaCacheMiB } = useContext(ReadingOptions)
  const first = mediaCacheMiB && site.capabilities.media ? mediaAddress(site.id, url) : url
  const [miss, setMiss] = useState(null)
  const [failed, setFailed] = useState(null)
  const src = miss === first ? url : first
  if (!url || failed === src) return fallback
  return <img {...props} src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer"
    onError={() => { if (src === url) setFailed(src); else setMiss(src) }} />
}

export function Smile({ site, url, label }) {
  const { renderSmiles } = useContext(ReadingOptions)
  return renderSmiles ? <ForumImage className="ngar-smile" site={site} url={url} alt={label} fallback={label} /> : label
}
