// 对已启动的临时 DSH Web 实例验收。只有推荐数据和附件使用虚构样本，界面、插槽、快捷键均由真实宿主提供。
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { enterIndex } from './excerpt-test-ui.mjs'

const address = process.env.EXCERPT_TEST_URL
if (!address || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(address).hostname)) throw new Error('Set EXCERPT_TEST_URL to the isolated local DSH Web URL')
const browser = await chromium.launch({ channel: process.env.EXCERPT_TEST_BROWSER || 'chrome' })
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/YaQAAAAASUVORK5CYII=', 'base64')
const name = '雨后的旧书店', fixture = '雨停后，在旧书店的窗边坐了一会儿。铜灯还亮着，翻开的书里夹着一枚绿色书签。'
const titles = ['工作台的自然光', '周末的慢车时刻', '雨天散步的路线', '一只蓝釉小杯', '手冲记录', '木窗上的旧铜件', '窄巷里的招牌',
  '沿河步行笔记', '洗印店的色卡', '一张老地图', '笔尖与纸张', '阴天的窗景', '黄昏走过石桥', '留白的练习', '旧照片怎么整理',
  '归档这周的底片', '街角的两棵树', '散步时记下的颜色', '旧站台的方向牌', '街坊的修表铺', '记一次夜间拍摄', '江边的候船室']
const rows = Array.from({ length: 64 }, (_, i) => ({ id: (i + 1).toString(16).padStart(24, '0'),
  title: i === 38 ? name : titles[i % titles.length], author: '南窗', type: 'normal' }))
try {
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1440, height: 900 }, colorScheme: 'light' })
  const errors = [], images = [], batches = [], generation = 'fixture-account'
  const next = Promise.withResolvers(), refresh = Promise.withResolvers()
  let refreshes = 0, limited = true, cold = 'initial'
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/api/dsh-nga-reader', async route => {
    const { action, site, batch, id } = route.request().postDataJSON()
    if (site !== 'xhs') return route.continue()
    let json
    if (action === 'homeFeed') {
      batches.push(batch)
      if (cold === 'initial') {
        cold = 'failed'
        return route.fulfill({ status: 504, json: { error: 'HOME_TIMEOUT', message: '打开小红书首页超时，请检查宿主网络后重试。' } })
      }
      if (batch === 1) await next.promise
      json = { run: 'fixture', generation, batch, more: batch < 2, items: rows.slice(batch * 28, (batch + 1) * 28) }
    }
    if (action === 'feedRefresh' && cold === 'failed') {
      cold = 'login'
      return route.fulfill({ status: 401, json: { error: 'LOGIN_REQUIRED', message: '来源需要登录。' } })
    } else if (action === 'feedRefresh' && cold === 'login') {
      cold = 'ready'
      json = { run: 'fixture', generation, batch: 0, more: true, items: rows.slice(0, 28) }
    } else if (action === 'feedRefresh') {
      if (++refreshes === 1) {
        await refresh.promise
        return route.fulfill({ status: 503, json: { error: 'SOURCE_UNAVAILABLE', message: '来源暂时不可用。' } })
      }
      json = { run: 'new', generation, batch: 0, more: false, items: [{ ...rows[0], title: '新索引中的书店' }] }
    }
    if (action === 'feedStatus') json = { generation }
    if (action === 'feedNote' && id === rows[1].id && limited) return route.fulfill({ status: 429,
      json: { error: 'SOURCE_RATE_LIMITED', message: '来源访问过于频繁，请稍后再试。' } })
    if (action === 'feedNote') json = { ...rows.find(r => r.id === id), body: fixture, type: 'normal', commentCount: '1',
      images: Array.from({ length: 4 }, () => ({ width: 1080, height: 1440, available: true })) }
    if (action === 'feedComments') json = { items: [{ id: '1', author: '山雀', text: '窗边的光很好。' }], batch: 0, more: false }
    if (!json) return route.continue()
    return route.fulfill({ json })
  })
  await page.route('**/api/dsh-nga-reader.attachment?**', route => {
    images.push(new URL(route.request().url()).searchParams.get('index'))
    return route.fulfill({ contentType: 'image/png', headers: { 'cache-control': 'no-store' }, body: png })
  })
  await enterIndex(page, address)
  const list = page.getByLabel('资料条目')
  const composer = page.locator('.ngar-composer'), toolbarRefresh = composer.getByRole('button', { name: '刷新推荐' })
  await page.getByRole('alert').filter({ hasText: '打开小红书首页超时' }).waitFor()
  await toolbarRefresh.click()
  const reminder = page.getByRole('alert').filter({ hasText: '刷新失败：来源需要登录' })
  await reminder.getByRole('button', { name: '重新扫码（打开官网窗口）' }).waitFor()
  assert.equal(await list.locator('button').count(), 0)
  await reminder.getByRole('button', { name: '重试刷新' }).click()
  await list.locator('button').first().waitFor()
  assert.equal(await list.locator('img,video').count(), 0)
  const labels = await list.locator('.ngar-topic > span:first-of-type').allTextContents()
  assert.deepEqual(new Set(labels), new Set(['思考', '已搜索网页', '执行了命令', '已调用工具']))
  await composer.getByRole('button', { name: /^选择模型/ }).click()
  await page.getByRole('menuitem', { name: /思考强度/ }).click()
  await page.getByRole('menuitemradio', { name: 'Max' }).click()
  assert.match(await composer.getByRole('button', { name: /^选择模型/ }).getAttribute('aria-label'), /Max/)
  await composer.getByRole('button', { name: /^权限模式/ }).click()
  await page.getByRole('menuitemradio', { name: '仅可查看' }).click()
  await composer.getByRole('button', { name: '会话选项' }).click()
  assert.ok(await page.getByText('小红书 · 已连接', { exact: true }).isVisible())
  assert.ok(await page.getByRole('menuitem', { name: /换号扫码/ }).isVisible())
  assert.ok(await page.getByRole('menuitem', { name: '读取下一批' }).isEnabled())
  await page.keyboard.press('Escape')
  assert.equal(await list.count(), 1)
  assert.equal(await page.getByRole('button', { name: '继续读取', exact: true }).count(), 0)
  await list.locator('[data-note-id="' + rows[1].id + '"]').click()
  const denied = page.getByLabel('摘录预览')
  await denied.getByText('来源访问过于频繁，请稍后再试。', { exact: false }).waitFor()
  assert.equal(images.length, 0)
  limited = false
  await denied.getByRole('button', { name: '重试', exact: true }).click()
  await denied.getByText(fixture, { exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await denied.waitFor({ state: 'hidden' })
  await list.hover()
  await page.mouse.wheel(0, 1800)
  const waiting = page.getByRole('status', { name: '正在读取推荐' })
  await waiting.locator('[data-shimmer=true]').waitFor()
  const whale = waiting.locator('.ngar-reading-icon')
  const mask = await whale.evaluate(el => getComputedStyle(el).maskImage)
  const url = mask.match(/^url\("(.+)"\)$/)?.[1]
  assert.ok(url && new URL(url).origin === new URL(address).origin)
  const asset = await page.request.get(url)
  assert.ok(asset.ok() && (await asset.body()).includes(Buffer.from('acTL')), 'Host whale animation is unavailable')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await whale.evaluate(el => getComputedStyle(el).maskImage), 'none')
  assert.ok(await whale.locator('svg').isVisible())
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  next.resolve()
  const row = list.getByRole('button', { name: '预览：' + name })
  await row.waitFor()
  await waiting.waitFor({ state: 'detached' })
  await row.evaluate(el => el.scrollIntoView({ block: 'center' }))
  const offset = () => row.evaluate(el => el.getBoundingClientRect().top - el.parentElement.getBoundingClientRect().top)
  for (const width of [1440, 768, 767]) {
    await page.setViewportSize({ width, height: 900 })
    await row.scrollIntoViewIfNeeded()
    const before = await offset(), count = images.length
    await row.click()
    const pane = page.getByLabel('摘录预览')
    await pane.getByText(fixture, { exact: true }).waitFor()
    assert.equal(await pane.locator('img,video').count(), 0)
    assert.equal(images.length, count)
    if (width === 1440 && process.env.EXCERPT_SCREENSHOT) {
      await page.waitForTimeout(450)
      await page.screenshot({ path: process.env.EXCERPT_SCREENSHOT })
    }
    await pane.getByRole('button', { name: /查看附件/ }).click()
    const picture = pane.locator('img')
    await picture.evaluate(img => img.decode())
    await pane.getByRole('button', { name: '下一张' }).click()
    await pane.getByAltText('附件，第 2 张').evaluate(img => img.decode())
    assert.equal(new URL(await picture.evaluate(img => img.currentSrc)).searchParams.get('index'), '1')
    if (width === 1440) assert.deepEqual(images.slice(count), ['0', '1'])
    await pane.getByRole('button', { name: /评论/ }).first().click()
    await pane.getByText('窗边的光很好。', { exact: false }).waitFor()
    // 同一个 DSH 标签失去桌面焦点时立即卸下图片，回到该标签不会自行再加载。
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await picture.waitFor({ state: 'detached' })
    await pane.getByRole('button', { name: /查看附件/ }).click()
    await pane.getByAltText('附件，第 2 张').waitFor()
    await page.keyboard.press('Escape')
    await pane.waitFor({ state: 'hidden' })
    await page.waitForFunction(id => document.activeElement?.dataset.noteId === id, rows[38].id)
    const delta = Math.abs(await offset() - before)
    assert.ok(delta <= 8, 'Return offset: ' + delta)
    console.log(width + 'px: no media before reveal; image 2 of 4; blur concealed; Escape returned to same row; offset ' + delta + 'px')
  }
  await list.hover()
  await page.mouse.wheel(0, 2400)
  await list.locator('[data-note-id="' + rows.at(-1).id + '"]').waitFor()
  assert.deepEqual(batches, [0, 1, 2])
  await page.setViewportSize({ width: 1440, height: 900 })
  const field = composer.getByRole('textbox')
  await field.fill('书店')
  assert.equal(await list.locator('button').count(), 1)
  await row.click()
  const pane = page.getByLabel('摘录预览')
  await pane.getByText(fixture, { exact: true }).waitFor()
  await toolbarRefresh.click()
  await page.getByRole('status', { name: '正在刷新推荐' }).waitFor()
  assert.ok(await toolbarRefresh.isDisabled())
  refresh.resolve()
  await page.getByRole('alert').filter({ hasText: '刷新失败' }).waitFor()
  assert.ok(await row.isVisible() && await pane.isVisible())
  await toolbarRefresh.click()
  await list.getByRole('button', { name: '预览：新索引中的书店' }).waitFor()
  await pane.waitFor({ state: 'hidden' })
  assert.equal(await field.inputValue(), '书店')
  assert.equal(await row.count(), 0)
  assert.equal(refreshes, 2)
  console.log('Native toolbar, four activity labels, animated whale, reduced motion, refresh failure and replacement: passed')
  assert.deepEqual(errors, [])
} finally { await browser.close() }
