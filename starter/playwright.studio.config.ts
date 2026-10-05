import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

// 本沙箱内预装的是 chromium-1228（Playwright 1.47 默认要 1134），
// 显式指向已有可执行文件，免去再下载。
const executablePath = path.join(
  os.homedir(),
  '.cache/ms-playwright/chromium-1228/chrome-linux/chrome',
)

// 仅用于 starter 自带的策展发布台验证（e2e-studio/）。
// 公开站点 7 条原需求由 tests/ 目录下的官方套件覆盖。
export default defineConfig({
  testDir: './e2e-studio',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath },
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
