// 策展发布台 + 公开站点 浏览器验证脚本
// 运行：node e2e-verify.mjs（需先在 tests/ 下 npm install 并 npx playwright install chromium）
import { chromium } from '../tests/node_modules/@playwright/test/index.mjs'

const BASE = 'http://127.0.0.1:5173'
const results = []
function check(name, cond, extra = '') {
  results.push({ name, pass: !!cond, extra })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  —  ${extra}` : ''}`)
}

async function ensureOnline(page) {
  const pill = await page.locator('.status-pill').first().textContent()
  if (pill.includes('断网')) {
    await page.getByRole('button', { name: '恢复在线' }).click()
    await page.waitForTimeout(150)
  }
}
async function ensureOffline(page) {
  const pill = await page.locator('.status-pill').first().textContent()
  if (pill.includes('在线')) {
    await page.getByRole('button', { name: '断网（离线编辑）' }).click()
    await page.waitForTimeout(150)
  }
}
async function noticeText(page) {
  return (await page.locator('.console-banner').first().textContent()).trim()
}
async function cropAll(page) {
  // 裁图清单：每个未裁照片选择 3:2；循环直到没有未裁项（裁一项少一个 select）
  for (;;) {
    const sel = page.locator('.crop-list select').first()
    if ((await sel.count()) === 0) break
    await sel.selectOption('3:2')
    await page.waitForTimeout(30)
  }
}
async function addOp(page, col, photoId, field, value) {
  const c = page.locator('.editor-col').nth(col)
  await c.locator('select').nth(0).selectOption(photoId)
  await c.locator('select').nth(1).selectOption(field)
  await c.locator('input').fill(value)
  await c.getByRole('button', { name: '记录离线操作' }).click()
  await page.waitForTimeout(150)
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))

  await page.goto(BASE + '/console', { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })

  // 1. 冻结基线
  await page.getByRole('button', { name: '新建发布批次' }).click()
  await page.waitForSelector('.console-banner')
  check('冻结基线：创建批次后提示已冻结基线', /已冻结基线/.test(await noticeText(page)), await noticeText(page))
  const batchText = await page.locator('.batch-list button').first().textContent()
  const batchId = (batchText.match(/B-\d+/) || [''])[0]
  check('批次号存在', /^B-\d+$/.test(batchId), batchId)

  // 2. 离线操作带操作号与来源
  await ensureOffline(page)
  await addOp(page, 0, 'pastoral-01', 'caption', '策展人离线改的说明')
  await addOp(page, 1, 'pastoral-01', 'caption', '另一位编辑离线改的说明')
  await addOp(page, 0, 'pastoral-02', 'order', '3')

  const ops = await page.locator('.op-list li').allTextContents()
  check('离线操作带操作号 OP-xxxx', ops.every(t => /OP-\d{4}/.test(t)), ops.join(' | '))
  check('离线操作带来源（策展人/另一位编辑）', ops.some(t => t.includes('策展人')) && ops.some(t => t.includes('另一位编辑')))
  const retryLi = page.locator('.op-list li', { hasText: 'OP-0001' }).first()
  await retryLi.getByRole('button', { name: '重试（沿用首次结果）' }).click()
  await page.waitForTimeout(200)
  check('幂等：重复重试沿用首次结果', /沿用首次结果/.test(await noticeText(page)), await noticeText(page))

  // 3. 恢复在线 + 逐字段合并
  await ensureOnline(page)
  await page.getByRole('button', { name: '逐字段合并' }).click()
  await page.waitForTimeout(300)
  check('逐字段合并完成', /逐字段合并完成/.test(await noticeText(page)), await noticeText(page))

  // 4. 冲突：两边都改 → 保留双方待裁决
  const conflictItems = page.locator('.conflict-item')
  const conflictCount = await conflictItems.count()
  check('同一张照片两边都改 → 产生 1 项冲突待裁决', conflictCount === 1, `count=${conflictCount}`)
  if (conflictCount > 0) {
    const versions = await conflictItems.first().locator('.conflict-version').allTextContents()
    const bothKept = versions.some(v => v.includes('策展人离线改的说明')) && versions.some(v => v.includes('另一位编辑离线改的说明'))
    check('冲突保留双方版本待裁决', bothKept, versions.join(' | '))
    check('冲突未裁决前不可发布（有裁决按钮）', (await conflictItems.first().locator('.conflict-actions').count()) > 0)
  }

  // 5. 未裁完不能发布
  await page.getByRole('button', { name: '正式发布' }).click()
  await page.waitForTimeout(200)
  check('未裁完不能发布（裁图门槛）', /未裁完不能发布/.test(await noticeText(page)), await noticeText(page))

  // 6. 裁完全部 + 裁决冲突 → 正式发布
  await cropAll(page)
  await page.getByRole('button', { name: '采用策展人版本' }).click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: '正式发布' }).click()
  await page.waitForTimeout(300)
  const pubNotice = await noticeText(page)
  check('主策展人正式发布成功，生成不可变快照', /发布成功/.test(pubNotice) && /SN-\d{3}/.test(pubNotice), pubNotice)
  check('已发布快照出现在快照列表', (await page.locator('.snapshot-list li').count()) === 1)

  // 7. 已发布快照不可回写
  await page.getByRole('button', { name: '尝试回写' }).first().click()
  await page.waitForTimeout(200)
  check('已发布快照不可回写（守卫拦截）', /不可被新草稿回写/.test(await noticeText(page)), await noticeText(page))

  // 8. 协作者 → 403（发布与强制发布）
  await page.getByRole('button', { name: '协作者', exact: true }).click()
  await page.getByRole('button', { name: '新建发布批次' }).click()
  await page.waitForTimeout(200)
  await ensureOnline(page)
  await page.getByRole('button', { name: '逐字段合并' }).click()
  await page.waitForTimeout(200)
  await cropAll(page)
  await page.getByRole('button', { name: '正式发布' }).click()
  await page.waitForTimeout(200)
  check('协作者发布 → 403 Forbidden', /403/.test(await noticeText(page)), await noticeText(page))
  await page.getByRole('button', { name: '强制发布（主策展人）' }).click()
  await page.waitForTimeout(200)
  check('协作者强制发布 → 403 Forbidden', /403/.test(await noticeText(page)), await noticeText(page))

  // 9. 主策展人强制发布（跳过冲突裁决，但不跳过裁图）
  await page.getByRole('button', { name: '主策展人', exact: true }).click()
  await page.getByRole('button', { name: '新建发布批次' }).click()
  await page.waitForTimeout(200)
  await ensureOffline(page)
  await addOp(page, 0, 'landscape-01', 'caption', '策展人强发A')
  await addOp(page, 1, 'landscape-01', 'caption', '另一位编辑强发B')
  await ensureOnline(page)
  await page.getByRole('button', { name: '逐字段合并' }).click()
  await page.waitForTimeout(200)
  await cropAll(page)
  await page.getByRole('button', { name: '强制发布（主策展人）' }).click()
  await page.waitForTimeout(300)
  check('主策展人强制发布成功（跳过冲突裁决，裁图仍生效）', /强制发布成功/.test(await noticeText(page)), await noticeText(page))

  // 10. 失效与重算
  await page.getByRole('button', { name: '新建发布批次' }).click()
  await page.waitForTimeout(200)
  await ensureOffline(page)
  await addOp(page, 0, 'portrait-01', 'caption', '失效测试')
  await ensureOnline(page)
  await page.getByRole('button', { name: '逐字段合并' }).click()
  await page.waitForTimeout(200)
  await ensureOffline(page)
  await addOp(page, 0, 'portrait-02', 'order', '2')
  const invalidBanner = page.locator('.console-banner', { hasText: /失效/ })
  check('基线或排序变化 → 未发布派生结果失效', (await invalidBanner.count()) > 0)
  await ensureOnline(page)
  await page.getByRole('button', { name: '失效重算' }).click()
  await page.waitForTimeout(200)
  check('失效后重算成功', /重算/.test(await noticeText(page)), await noticeText(page))

  // 11. 公开站点路由渲染（冒烟）
  for (const r of ['/', '/work', '/work/highland-pastoral', '/about', '/contact']) {
    await page.goto(BASE + r, { waitUntil: 'networkidle' })
    check(`路由 ${r} 渲染核心内容`, await page.locator('main').isVisible())
  }

  check('全程控制台无 error', errors.length === 0, errors.join(' | '))

  await browser.close()
  const failed = results.filter(r => !r.pass)
  console.log(`\n==== ${results.length - failed.length}/${results.length} passed ====`)
  if (failed.length) {
    console.log('FAILED:', failed.map(f => f.name).join(', '))
    process.exit(1)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
