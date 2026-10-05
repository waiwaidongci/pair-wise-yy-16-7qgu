# 林昭摄影作品集 · 公开展示站 + 策展发布台

React + TypeScript + Vite 单页应用，包含两部分：

1. **公开摄影站点**（`/`、`/work`、`/work/:seriesId`、`/about`、`/contact`），
   外加一个全局共享灯箱（非独立路由）。
2. **策展发布台**（`/studio`，内部工具入口），面向"断网策展、回网合并"的协同发布流程。

## 启动

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 类型检查 + 生产构建
npm run preview
```

## 公开站点

- 所有内容（14 张照片、3 个系列、标题、说明、尺寸）只来自
  `src/data/photos.json`（由 `mock-data/photos.json` 原样拷入），
  照片文件在 `public/photos/`，字体在 `public/fonts/`，不引用任何外部 CDN。
- **筛选状态保持**：分类筛选保存在路由之外的全局 store，进出系列页后返回仍保留。
- **灯箱范围限定**：灯箱是挂在布局层的唯一实例；任何页面打开它时都显式传入
  "当前可见的照片数组"，上一张/下一张只在该数组（如筛选结果、本系列叙事顺序）内循环。
- **零 CLS**：`SmartImage` 用 photos.json 的真实 `width/height` 设置
  `aspect-ratio` 占位，图片绝对定位填充，加载前后布局不跳动。
- **响应式**：桌面 3 列瀑布流 → 平板 2 列 → 手机单列；灯箱说明在手机端变为底部信息条。
- **联系表单**：行内校验、非法邮箱提示、未通过禁用提交、提交后展示独立成功态。

## 策展发布台（`/studio`）

纯函数核心在 `src/studio/engine.ts`（无 DOM 依赖，可单测），React 层
（`src/studio/useStudio.tsx` + `pages/StudioPage.tsx`）只负责派发动作与持久化
（localStorage）。规则与需求一一对应：

| 需求 | 实现 |
|---|---|
| 每批发布先冻结基线 | `freezeBaseline()`：从当前事实深拷贝并 `Object.freeze` |
| 离线操作带操作号和来源 | 每个 `Operation` 有 `opId`/`source`/`online`，全部写操作日志 |
| 恢复后逐字段合并 | `sync()`：基线/主策展人/协作者三方逐字段合并 |
| 两边都改同一字段 | 保留双方值，产生 `pending` 冲突，裁决前门禁不放行 |
| 未裁完不能发布 | `evaluateGate()` 检查每个成员照片的 `crop`，失败为 blocked |
| 已发布快照不能被新草稿回写 | 发布产出深冻结 `PublishedSnapshot`；已发布批次拒绝编辑（409） |
| 基线/排序变化使派生结果失效 | 自动标记 `stale`，`recomputeDerived()` 按内容哈希重算；输入未变沿用原哈希 |
| 重复重试沿用首次结果 | 按 `opId` 幂等：重放返回 `duplicate` 并引用首次结果 |
| 主策展人可强制发布，协作者 403 | `publish({force})` 对 collaborator 返回 403 并写日志 |

页面内可切换**身份**（主策展人/协作者）与**联网状态**（在线/断网），
并提供"载入演示场景"一键构造"双端离线 + 同字段冲突"的批次。

## 测试

```bash
# 引擎规则单测（12 个：基线/幂等/三方合并/冲突/门禁/快照冻结/失效重算/403/完整闭环）
npm run test:studio

# 策展发布台浏览器 E2E（4 个，配置 playwright.studio.config.ts）
npx playwright test --config playwright.studio.config.ts
```

公开站点 7 条原需求的浏览器验证由仓库根目录 `../tests` 的 Playwright 套件覆盖
（结构基线、内容完整性、耦合约束，共 12 个用例），在当前环境下全部通过。
