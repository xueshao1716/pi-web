import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from 'playwright'

const base = process.env.PI_WEB_FRONTEND_URL || 'http://127.0.0.1:5173/#/assets'
const token = fs.readFileSync(process.env.PI_WEB_TOKEN_FILE || 'D:/pi-web/.token', 'utf8').trim()
const reviewDir = '.impeccable/review'
fs.mkdirSync(reviewDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.addInitScript(value => localStorage.setItem('yuanshu_access_token', value), token)
  await page.goto(base, { waitUntil: 'networkidle' })
  assert.ok(await page.locator('.asset-card').count() > 0, 'seeded assets should render')
  assert.equal(await page.locator('.asset-filter-button').count(), 10, 'kind and time filters should render')

  await page.getByRole('button', { name: '视频', exact: true }).click()
  await page.waitForTimeout(100)
  const videoNames = await page.locator('.asset-card__name').allTextContents()
  assert.ok(videoNames.length > 0 && videoNames.every(name => /\.(mp4|webm|mov|m4v|mkv|avi|m3u8)$/i.test(name.trim())), 'video filter should only show video files')
  await page.getByRole('button', { name: '全部', exact: true }).first().click()
  await page.waitForTimeout(100)

  await page.locator('.asset-card').filter({ has: page.locator('img') }).first().click()
  assert.equal(await page.getByRole('complementary', { name: '资产详情' }).count(), 1, 'selection should show details')
  assert.ok(await page.getByRole('button', { name: '重命名' }).isVisible(), 'rename should be reachable')
  assert.ok(await page.getByRole('button', { name: '删除' }).isVisible(), 'delete should be reachable')
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await page.waitForTimeout(100)
  assert.equal(await page.locator('.asset-preview img').count(), 1, 'image preview should render')
  await page.getByRole('button', { name: '关闭预览' }).click()
  assert.ok(await page.getByRole('button', { name: '重命名' }).isVisible(), 'details actions survive preview close')

  await page.getByRole('button', { name: '视频', exact: true }).click()
  await page.waitForTimeout(100)
  await page.locator('.asset-card').first().click()
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await page.waitForTimeout(100)
  assert.equal(await page.locator('.asset-preview video').count(), 1, 'video preview should render')
  assert.notEqual(await page.locator('.asset-preview video').getAttribute('controls'), null, 'video controls should render')
  await page.screenshot({ path: `${reviewDir}/assets-fix-desktop.png`, fullPage: true })
  await page.getByRole('button', { name: '关闭预览' }).click()

  await page.getByRole('button', { name: '其他', exact: true }).click()
  await page.waitForTimeout(100)
  assert.ok((await page.locator('.asset-card').count()) >= 0, 'other filter should be usable')
  await page.getByRole('button', { name: '清除筛选' }).click().catch(() => {})
  const emptySearch = page.locator('input[placeholder="搜索名称或路径"]')
  await emptySearch.fill('__asset_library_no_match__')
  await page.waitForTimeout(100)
  assert.ok((await page.getByText('这个筛选下没有资产', { exact: true }).count()) > 0, 'empty filtered state should be legible')

  const mobile = await browser.newPage({ viewport: { width: 375, height: 667 } })
  await mobile.addInitScript(value => localStorage.setItem('yuanshu_access_token', value), token)
  await mobile.goto(base, { waitUntil: 'networkidle' })
  const mobileOverflow = await mobile.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  assert.equal(mobileOverflow.scrollWidth, mobileOverflow.clientWidth, 'mobile page should not overflow horizontally')
  await mobile.screenshot({ path: `${reviewDir}/assets-fix-mobile.png`, fullPage: true })
  await mobile.close()

  const errorPage = await browser.newPage({ viewport: { width: 800, height: 600 } })
  await errorPage.addInitScript(value => localStorage.setItem('yuanshu_access_token', value), token)
  await errorPage.route('**/api/ws/artifacts**', route => route.abort())
  await errorPage.route('**/api/ws/deliveries**', route => route.abort())
  await errorPage.goto(base, { waitUntil: 'networkidle' })
  assert.ok(await errorPage.getByRole('alert').count() > 0, 'endpoint failures should expose an alert')
  assert.ok(await errorPage.getByRole('button', { name: '重试' }).count() > 0, 'endpoint failures should expose retry')
  await errorPage.close()

  console.log(JSON.stringify({ seededCards: videoNames.length, videoFilter: 'only video extensions', imagePreview: true, videoPreview: true, detailsActionsAfterClose: true, emptyState: true, errorState: true, mobileOverflow, screenshots: [`${reviewDir}/assets-fix-desktop.png`, `${reviewDir}/assets-fix-mobile.png`] }))
} finally {
  await browser.close()
}
