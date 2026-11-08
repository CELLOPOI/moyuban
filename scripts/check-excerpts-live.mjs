// 使用已登录专用测试账号的临时宿主。只输出数量、媒体状态和位置误差。
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { enterIndex } from './excerpt-test-ui.mjs'

const url = process.env.EXCERPT_TEST_URL
if (!url || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw new Error('An isolated local DSH Web URL is required')
const browser = await chromium.launch({ channel: process.env.EXCERPT_TEST_BROWSER || 'chrome' })
try {
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(14000)
  const batches = new Map(), attachments = []
  page.on('response', async r => {
    const path = new URL(r.url()).pathname
    if (path === '/api/dsh-nga-reader.attachment') attachments.push(r.status())
    if (path !== '/api/dsh-nga-reader' || !r.ok()) return
    const { action } = r.request().postDataJSON()
    if (action === 'homeFeed') { const b = await r.json().catch(() => null); if (b) batches.set(b.batch, b) }
  })
  await enterIndex(page, url)
  const list = page.getByLabel('资料条目')
  await list.locator('button').first().waitFor()
  async function batch(n) {
    for (let i = 0; !batches.has(n) && i < 100; i++) await delay(50)
    assert.ok(batches.has(n), 'Missing batch ' + n); return batches.get(n)
  }
  const first = await batch(0)
  assert.ok(first.generation, 'Sign into the test account first')
  await list.evaluate(el => { el.scrollTop = el.scrollHeight })
  await page.waitForFunction(n => document.querySelectorAll('[data-note-id]').length > n, first.items.length)
  const second = await batch(1)
  assert.equal(second.run, first.run)
  const all = [first, second].flatMap(b => b.items.map(r => r.id))
  assert.equal(new Set(all).size, all.length)
  console.log('Signed-in batches:', [first.items.length, second.items.length], 'overlap: 0')
  for (const kind of ['normal', 'video']) {
    let verified = false
    for (const card of second.items.filter(row => row.type === kind).slice(0, 8)) {
      const row = list.locator('[data-note-id="' + card.id + '"]')
      await row.evaluate(el => el.scrollIntoView({ block: 'center' }))
      const offset = () => row.evaluate(el => el.getBoundingClientRect().top - el.parentElement.getBoundingClientRect().top)
      await row.evaluate(el => { el.addEventListener('pointerdown', () => {
        el.dataset.testClickOffset = String(el.getBoundingClientRect().top - el.parentElement.getBoundingClientRect().top)
      }, { once: true }) })
      const reading = page.waitForResponse(r => {
        if (new URL(r.url()).pathname !== '/api/dsh-nga-reader') return false
        const q = r.request().postDataJSON()
        return q.action === 'feedNote' && q.id === card.id
      }, { timeout: 20000 }).then(r => r.json()).catch(() => null)
      await row.click()
      const pane = page.getByLabel('摘录预览')
      const show = pane.getByRole('button', { name: /查看附件/ })
      const note = await reading
      if (note?.id !== card.id || note.type !== kind || (kind === 'normal' ? note.images.length < 2 : !note.video)) {
        console.log(kind, note?.error || (note?.id === card.id ? 'different attachment count' : 'detail unavailable'))
        await page.keyboard.press('Escape'); continue
      }
      await show.waitFor()
      assert.equal(await pane.locator('img,video').count(), 0)
      await show.click()
      if (kind === 'normal') {
        await pane.getByRole('button', { name: '下一张' }).click()
        await pane.getByAltText('附件，第 2 张').evaluate(el => el.decode())
      } else {
        const media = pane.locator('video')
        assert.equal(await media.evaluate(v => v.paused && v.muted && !v.autoplay), true)
        await media.evaluate(v => v.play())
        await page.waitForFunction(() => document.querySelector('.ngar-attachment video')?.currentTime > .2)
        const target = await media.evaluate(v => Math.min(v.duration / 2, 5))
        await media.evaluate((v, t) => { v.currentTime = t }, target)
        await page.waitForFunction(t => { const v = document.querySelector('.ngar-attachment video'); return v && !v.seeking && v.currentTime >= t - .2 }, target)
      }
      await pane.getByRole('button', { name: /评论/ }).first().click()
      await pane.locator('.ngar-excerpt-comment').first().waitFor()
      const count = await pane.locator('.ngar-excerpt-comment').count()
      await page.keyboard.press('Escape')
      await pane.waitFor({ state: 'hidden' })
      await page.waitForFunction(id => document.activeElement?.dataset.noteId === id, card.id)
      await delay(400)
      const before = Number(await row.getAttribute('data-test-click-offset')), after = await offset(), delta = Math.abs(after - before)
      assert.ok(delta <= 8, 'Return offset changed from ' + before + ' to ' + after)
      assert.equal(await page.locator('.ngar-attachment :is(img,video)').count(), 0)
      console.log(kind, 'matched original card;', kind === 'video' ? 'decoded, played, sought, removed;' : note.images.length + ' images, second decoded;',
        count + ' visible comments; return offset ' + delta + 'px')
      verified = true; break
    }
    assert.ok(verified, 'No verified ' + kind + ' note in this batch')
  }
  console.log('Media HTTP statuses:', [...new Set(attachments)])
} catch (error) {
  // Playwright 的超时调用日志可能包含已登录账号的标题；不把它们写进终端。
  console.error(error.name, String(error.message).split('\n')[0].replace(/https?:\/\/\S+/g, '[url]'))
  process.exitCode = 1
} finally { await browser.close() }
