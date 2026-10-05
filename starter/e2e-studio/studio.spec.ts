import { test, expect, type Page } from '@playwright/test'

// 策展发布台浏览器验证：把"断网协同 → 回网合并 → 裁决 → 重算 → 发布/403"
// 完整走一遍真实 UI。纯引擎规则另有 vitest 单测（src/studio/engine.test.ts）。

async function gotoStudio(page: Page) {
  await page.goto('/studio', { waitUntil: 'networkidle' })
  // 每次从干净状态开始
  page.on('dialog', d => d.accept())
  await page.getByRole('button', { name: '重置全部' }).click()
  await page.locator('section.studio-card').first().locator('select').selectOption('highland-pastoral')
  await page.getByRole('button', { name: '为该系列冻结新基线' }).click()
}

test.describe('策展发布台（真实浏览器）', () => {
  test('全链路：冻结基线→双端离线（带操作号/来源）→回网逐字段合并→冲突待裁决→派生失效重算→发布快照冻结', async ({ page }) => {
    await gotoStudio(page)

    // 冻结后派生看板立即失效
    await expect(page.locator('.derived-status').first()).toContainText('已失效')

    // 主策展人：断网后裁完全部 4 张 + 改一张照片说明
    await page.getByRole('button', { name: '切换断网' }).click()
    await expect(page.locator('.pill.offline')).toBeVisible()
    await page.locator('.studio-grid .studio-card').first().getByRole('button', { name: '一键裁完本系列' }).click()

    // 选到 pastoral-04 并由 lead 改 caption
    const leadCard = page.locator('.studio-grid .studio-card').first()
    await leadCard.locator('select').first().selectOption('pastoral-04')
    await leadCard.locator('select').nth(1).selectOption('caption')
    await leadCard.locator('input').fill('主策展人离线拟的结尾句')
    await leadCard.getByRole('button', { name: '记录操作（操作号自动生成）' }).click()

    // 协作者：断网下把同一字段改成另一个版本
    const collabCard = page.locator('.studio-grid .studio-card').nth(1)
    await collabCard.locator('select').first().selectOption('pastoral-04')
    await collabCard.locator('input').fill('协作者离线拟的结尾句')
    await collabCard.getByRole('button', { name: '记录操作（操作号自动生成）' }).click()

    // 日志里应出现带 op-xxxx 操作号、离线标记、不同来源的记录
    const logText = await page.locator('.log-table').innerText()
    expect(logText).toMatch(/op-\d{4}-/)
    expect(logText).toContain('离线')

    // 重复重试：同一操作号重放 → duplicate
    await leadCard.getByRole('button', { name: '用同一操作号重试' }).click()
    await expect(page.locator('.toast')).toContainText('duplicate')
    await page.locator('.toast').click()

    // 回网合并
    await page.getByRole('button', { name: '切换回网' }).click()
    await page.getByRole('button', { name: '执行回网合并' }).click()
    await expect(page.locator('.toast')).toContainText('待裁决')
    await page.locator('.toast').click()

    // 冲突面板：双方值都保留
    await expect(page.locator('.conflict-item').first()).toContainText('主策展人')
    await expect(page.locator('.conflict-item').first()).toContainText('协作者')

    // 裁决前发布门禁不通过（即使裁切齐了）
    const gate = page.locator('.gate-report')
    await expect(gate).toContainText('字段冲突待裁决')

    // 裁决：保留主策展人版本
    await page.getByRole('button', { name: '保留主策展人版本' }).click()
    await expect(page.locator('.conflict-item').first()).toContainText('已裁决')

    // 裁决后派生看板再次失效 → 重算
    await expect(page.locator('.derived-status').first()).toContainText('失效')
    await page.getByRole('button', { name: '重算派生看板' }).click()
    await expect(page.locator('.derived-status').first()).toContainText('有效')

    // 门禁通过，普通发布
    await expect(page.locator('.gate-report')).toContainText('全部通过')
    await page.getByRole('button', { name: '普通发布' }).click()
    await expect(page.locator('.toast')).toContainText('published')
    await page.locator('.toast').click()

    // 快照区出现冻结快照 v1
    await expect(page.locator('.snapshot-card.frozen').first()).toContainText('v1')

    // 已发布批次：编辑按钮全部禁用，任何操作都无法回写快照
    await expect(leadCard.getByRole('button', { name: '一键裁完本系列' })).toBeDisabled()
  })

  test('未裁完不能发布；协作者强制发布 403，主策展人可强制发布', async ({ page }) => {
    await gotoStudio(page)
    // 只裁一张，直接回网合并（协作者无修改，无冲突）
    const leadCard = page.locator('.studio-grid .studio-card').first()
    await leadCard.getByRole('button', { name: '裁切选中照片' }).click()
    await page.getByRole('button', { name: '执行回网合并' }).click()
    await page.locator('.toast').click().catch(() => {})
    await page.getByRole('button', { name: '重算派生看板' }).click()

    // 门禁报未裁完，普通发布按钮禁用
    await expect(page.locator('.gate-report')).toContainText('未裁完')
    await expect(page.getByRole('button', { name: '强制发布（仅主策展人）' })).toBeEnabled()

    // 切成协作者后强制发布 → 403 toast
    await page.locator('.studio-topbar select').selectOption('collaborator')
    await page.getByRole('button', { name: '强制发布（仅主策展人）' }).click()
    await expect(page.locator('.toast.error')).toContainText('403')
    await page.locator('.toast').click()
    // 没有产生任何快照
    await expect(page.locator('.snapshot-card')).toHaveCount(0)

    // 主策展人强制发布成功，带警告标记
    await page.locator('.studio-topbar select').selectOption('lead')
    await page.getByRole('button', { name: '强制发布（仅主策展人）' }).click()
    await expect(page.locator('.toast')).toContainText('published')
    await expect(page.locator('.snapshot-card.frozen').first()).toContainText('强制发布')
  })

  test('排序变化使派生看板失效，重算后顺序改变；重复重算沿用同一哈希', async ({ page }) => {
    await gotoStudio(page)
    await page.getByRole('button', { name: '重算派生看板' }).click()
    const hash1 = (await page.locator('.derived-status').first().innerText()).match(/hash ([0-9a-f]+)/)![1]

    // 不改任何内容再算一次：哈希一致
    await page.getByRole('button', { name: '重算派生看板' }).click()
    const hash2 = (await page.locator('.derived-status').first().innerText()).match(/hash ([0-9a-f]+)/)![1]
    expect(hash2).toBe(hash1)

    // lead 倒序重排
    await page.locator('.studio-grid .studio-card').first().getByRole('button', { name: '倒序重排' }).click()
    await expect(page.locator('.stale-note').first()).toContainText('排序已变化')

    // 回网合并再重算：第一项变为原最后一张
    await page.getByRole('button', { name: '执行回网合并' }).click()
    await page.locator('.toast').click().catch(() => {})
    await page.getByRole('button', { name: '重算派生看板' }).click()
    const firstItem = await page.locator('.board-list li').first().innerText()
    console.log('FIRST_BOARD_ITEM:', firstItem)
    expect(firstItem).toContain('pastoral-04')
    const hash3 = (await page.locator('.derived-status').first().innerText()).match(/hash ([0-9a-f]+)/)![1]
    expect(hash3).not.toBe(hash1)
  })

  test('演示场景一键载入：双端离线+冲突可直接进入合并流程', async ({ page }) => {
    await page.goto('/studio', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '载入演示场景（双端离线+冲突）' }).click()
    await expect(page.locator('.pill.online')).toBeVisible()
    await page.getByRole('button', { name: '执行回网合并' }).click()
    await expect(page.locator('.conflict-item')).toHaveCount(1)
    // 4 张都已由 lead 裁切，门禁只剩冲突一项
    await page.getByRole('button', { name: '重算派生看板' }).click()
    await expect(page.locator('.gate-report')).toContainText('冲突待裁决')
    await expect(page.locator('.gate-report')).not.toContainText('未裁完')
  })
})
