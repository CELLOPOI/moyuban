export async function enterIndex(page, url) {
  await page.goto(url)
  const welcome = page.getByRole('dialog', { name: '预览版说明' })
  // 空白宿主还可能提示配置 DSH 账号，关闭即可阅读，不需要账号或模型密钥。
  const signIn = page.getByRole('dialog', { name: '开始使用', exact: true })
  for (const [dialog, name] of [[welcome, '继续'], [signIn, '关闭']]) {
    await page.addLocatorHandler(dialog, async () => {
      const button = dialog.getByRole('button', { name, exact: true })
      try { await button.click({ timeout: 2000 }) } catch (error) {
        if (await dialog.isVisible() && await button.isEnabled()) throw error
      }
    })
  }
  const side = page.locator('[data-slot="sidebar.workspaces"]')
  const entry = side.locator('[data-row-key="session:dsh-nga-reader-start-xhs"]')
  const folder = side.locator('[role="treeitem"][aria-expanded]').filter({ hasText: '资料摘录' }).first()
  await folder.waitFor()
  // 冷启动可能再次恢复文件夹的展开状态，等到会话真正挂载后再操作列表。
  for (let n = 0; n < 6; n++) {
    if (await entry.isVisible()) {
      await entry.press('Enter', { timeout: 1500 }).catch(() => {})
      if (await page.getByLabel('资料条目').waitFor({ timeout: 1500 }).then(() => true, () => false)) return
    }
    await side.locator('[role="treeitem"][aria-expanded=false]').filter({ hasText: '资料摘录' }).first()
      .click({ timeout: 1000, position: { x: 45, y: 13 } }).catch(() => {})
    await entry.waitFor({ timeout: 1500 }).catch(() => {})
  }
  throw new Error('The reading index did not open in the isolated DSH host')
}
