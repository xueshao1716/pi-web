# Task 4 实施报告：主题与系统页面重排

## 状态

已完成。改动仅覆盖 Task 4 指定的主题页、系统页、结构契约测试，以及 Task 3 审查要求的 `ModelChannels.tsx` 未使用 `X` import 删除；未修改 ThemeApi/SystemApi 定义、调用参数、请求行为、后端、依赖或产品功能。

## 实现

### 主题系统

- 使用公共 `PageHeader` 与 `SectionHeader`，移除页面手写 `<h1>`。
- 页面层级调整为“主题画廊 → 实时预览/精调双栏 → 默认折叠开发者选项”；桌面为预览与精调主辅布局，手机自然单列。
- 保留主题切换即时应用、accent 色板与自定义色、density、壁纸预设/URL/上传/清除、服务端保存、重置和 CSS 导出。
- Token 速览与 CSS 导出只位于默认关闭的“开发者选项”，普通用户首屏不再看到 token 工具。
- `WALL_PRESETS` 和页面其余非 badge 文本不再使用 10px；补充受控按钮状态和可访问标签。

### 系统

- 使用公共 `PageHeader`、`SectionHeader` 与四个 `StatusTile`。
- 顶部真实摘要服务状态、版本、运行时长和网络状态，数据均来自既有 `SystemApi.info()` SWR 返回。
- 更新检测与外网配置并列为主任务区；系统能力与运行平台细节移到页面底部默认折叠。
- 保留 30 秒 SWR 去重、`SystemApi.checkUpdate()`、域名编辑/添加/删除/保存、LAN 地址复制行为。
- LAN URL 统一由实际 `info.port || 8787` 生成，复制内容和“已复制”状态比较共同使用 `lanUrl`，不再硬编码比较 `:8787`。
- 固定 emerald 改为语义 `pi-success/pi-warning`；保存状态移除 emoji 式勾号；清除页面非 badge 10px。

### Task 3 Minor

- 仅删除 `frontend/src/components/ModelChannels.tsx` 中未使用的 Lucide `X` import，未做其他 Task 3 改动。

### 网络状态语义窄修

- reviewer 指出 `lanIPs/domains` 只能证明系统信息中存在入口，不能证明网络“可用”或“已配置”。网络 `StatusTile` 因此改为只显示“已发现入口 / 未发现入口”，加载期间显示占位并说明“等待系统信息”。
- detail 只汇总入口总数、局域网入口数与非空公网域名数；状态色使用 `info/neutral`，不表达连通成功或故障。
- 未修改后端 `engine/system-panel.mjs`、配置、System API 或 LAN URL 生成/复制逻辑。

## TDD 证据

1. 先扩展 `tests/unit/frontend-ui-structure.test.mjs`，增加 6 条 Task 4 契约。
2. 首次运行：16 项中 10 通过、6 失败，失败覆盖公共页头、主题开发者折叠、10px、系统状态摘要、能力折叠、固定色/emoji/实际端口比较。
3. 实现后结构测试与设计契约合跑：34/34 通过。
4. 网络语义窄修先新增结构契约，单测首次运行 0/1，按预期因旧实现缺少入口计数且仍使用“可用/待配置”而 RED；实现后同一契约 1/1 GREEN，完整结构与设计契约 35/35 通过。

## 行为/API 保留证据

- Theme API：`await ThemeApi.save(theme, accent, wallpaper)` 原调用与参数保持不变。
- System API：
  - `useSWR('system-info', () => SystemApi.info(), { dedupingInterval: 30000 })`
  - `SystemApi.checkUpdate()`
  - `SystemApi.saveNetwork({ domains })`
- 结构契约同时锁定即时 `applyTheme(theme, accent)`、density 派生、壁纸上传/清除、域名增删、LAN 复制和实际端口状态比较。

## 验证

- RED：`node --test tests/unit/frontend-ui-structure.test.mjs` → 10/16 通过，6 条新增契约按预期失败。
- 网络语义 RED：`node --test --test-name-pattern="系统网络摘要" tests/unit/frontend-ui-structure.test.mjs` → 0/1，按预期失败。
- 网络语义 GREEN：同一命令 → 1/1 通过。
- `node --test tests/unit/frontend-ui-structure.test.mjs frontend/tests/design-contract.test.mjs` → 35/35 通过。
- `cd frontend && npx tsc --noEmit -p .` → 通过，无输出。
- `npm test` → 246/246 通过。
- `cd frontend && npm run build` → 成功，4286 modules transformed；仅既有 UnoCSS shortcut、Vite deprecated option 和 chunk size 提示。构建产物已还原，不纳入提交。
- `npx impeccable detect src/pages/Themes.tsx src/pages/System.tsx src/components/ModelChannels.tsx` → 零发现。
- `npm run lint:design -- --diff` → 执行完成，仍报告两条既有问题：`ChatArea.tsx:679` violet gradient、`styles.css:1008` height transition；均不在 Task 4 目标文件或本次新增行。
- `git diff --check` → 通过。
- 禁用项扫描：Task 4 两页无 `emerald-`、`text-[10px]`、`✓`、`transition-all`。

## 命令说明

曾从仓库根运行 `npx tsc --noEmit -p frontend`，命中根级非 TypeScript 的 `tsc` 占位包而失败；随后改用前端项目既有方式 `cd frontend && npx tsc --noEmit -p .`，真实 TypeScript 校验通过。

## Diff 摘要

- `frontend/src/pages/Themes.tsx`：主题画廊、实时预览/精调、开发者折叠层级重排。
- `frontend/src/pages/System.tsx`：真实状态摘要、更新/网络主区、能力折叠及实际端口复制修复。
- `frontend/src/components/ModelChannels.tsx`：删除未使用 `X` import。
- `tests/unit/frontend-ui-structure.test.mjs`：新增 6 条 Task 4 结构/行为契约。
- 本报告。

## 残余风险

- reviewer 发现既有后端 `engine/system-panel.mjs` 的 System API 将 `port` 固定返回为 `8787`，非默认端口运行时可能使前端拿到错误端口；这是既有后端 API 数据风险，本轮 UI 边界明确 defer，未修改后端、配置或 LAN URL 逻辑。
- 未执行浏览器四视口截图与真实交互验收；按计划留给 Task 6。
- Impeccable `--diff` 的两条既有告警仍存在，但 Task 4 目标文件单独扫描为零发现，未扩大范围处理。
- worktree 中 `.pi-subagents/` 是任务运行目录，保持未跟踪，不纳入提交。
