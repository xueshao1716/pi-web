# Task 3 实施报告：模型中心决策化重排

## 状态

已完成。改动仅覆盖 Task 3 指定的模型中心页面、模型展示/筛选组件、通道状态色与结构契约测试；未新增或修改后端 API、产品功能、依赖和数据结构，也未执行浏览器验收。

## 实现

- 新增 `ActiveModelHero`，集中展示当前模型；当前为 `auto/auto` 时明确展示 Auto 智能路由，并保留免费 flash、复杂任务 pro、429/故障降级与手动固定模型的说明。
- 新增受控 `ModelFilterBar`，保留类型、搜索、免费/推理/视觉能力筛选、免费优先及切换中状态。
- 新增紧凑 `ModelCard`，保留名称、provider/id、免费/推理/视觉、上下文、备注与切换操作，减少卡内装饰和信息冗余。
- `ModelHub` 第一屏严格重排为 `PageHeader → ActiveModelHero → ModelFilterBar → model-results 网格`。
- 累计成本、累计消息、免费通道、`ModelChannels` 和 Provider 用量表统一下沉至默认折叠的“通道与用量”。
- `ModelHub`、`ModelChannels` 和三个模型组件中的 emerald/purple/sky 固定色类清零，改用现有 `pi-success`、`pi-danger`、`pi-accent` 等语义 token。
- 免费优先排序改为 `[...filteredModels].sort(...)`；筛选和非排序分支也返回新数组，不直接 `sort(models)`，避免突变 store 数组。

## TDD：RED / GREEN

### RED

先扩展 `tests/unit/frontend-ui-structure.test.mjs`，再运行：

```text
node --test tests/unit/frontend-ui-structure.test.mjs
tests 9 · pass 6 · fail 3
```

失败分别命中：

1. 缺少 `ActiveModelHero` / `ModelFilterBar` / `ModelCard` 拆分与首屏顺序契约。
2. 通道、累计用量和 Provider 明细未统一进入“通道与用量”折叠区。
3. `ModelHub.tsx` 与 `ModelChannels.tsx` 仍包含 emerald/purple/sky 固定色类。

完整 RED 输出保存在本地忽略文件 `task-3-red.log`，不纳入提交。

### GREEN

实现后目标结构与设计契约：

```text
node --test tests/unit/frontend-ui-structure.test.mjs frontend/tests/design-contract.test.mjs
28/28 passed
```

新增结构测试同时锁定：store 数据入口、60 秒统计刷新、模型切换 API、通道增删 API 和非突变排序。

## API / 行为保留证据

- Store 输入仍为 `const { models, currentModel, setCurrentModel, cwd } = useApp()`。
- Provider 统计仍为 `useSWR('provider-stats', () => StatsApi.providers(), { refreshInterval: 60000 })`。
- 模型切换仍调用 `KeysApi.switchModel({ provider: model.provider, modelId: model.id })`，成功后仍更新 `setCurrentModel(modelKey)`。
- 模型类型筛选、关键词搜索、免费/推理/视觉筛选、免费优先和重置筛选均保留。
- `ModelChannels` 仍调用 `KeysApi.manage()`、`KeysApi.add(...)`、`KeysApi.remove(...)`，添加表单、加载、成功/失败反馈和删除行为均保留。
- 未修改 `frontend/src/api.ts`、`frontend/src/types.ts` 或任何后端文件；未新增 API、依赖或功能。

## 验证命令

- `node --test tests/unit/frontend-ui-structure.test.mjs frontend/tests/design-contract.test.mjs`：28/28 通过。
- `npm test`：240/240 通过。
- `cd frontend && npx tsc --noEmit -p .`：通过。
- `cd frontend && npm run build`：成功，4284 modules transformed；仅既有 UnoCSS shortcut、Vite deprecated option 与 chunk-size 提示。构建后已还原跟踪的 `frontend/dist` 并清理新 hash 产物，未纳入提交。
- `cd frontend && npm run lint:design -- --diff`：执行完成，报告 2 条既有告警：`ChatArea.tsx:679` violet gradient、`styles.css:1008` height transition；两者均不属于 Task 3 文件或新增行。
- `npx impeccable detect src/pages/ModelHub.tsx src/components/ModelChannels.tsx src/components/models/ActiveModelHero.tsx src/components/models/ModelFilterBar.tsx src/components/models/ModelCard.tsx`：零发现。
- `git diff --check`：通过；仅 Git for Windows 的 LF→CRLF 提示。

## Changed files

- `frontend/src/pages/ModelHub.tsx`
- `frontend/src/components/ModelChannels.tsx`
- `frontend/src/components/models/ActiveModelHero.tsx`
- `frontend/src/components/models/ModelFilterBar.tsx`
- `frontend/src/components/models/ModelCard.tsx`
- `tests/unit/frontend-ui-structure.test.mjs`
- `.superpowers/sdd/2026-08-31-ui-system-polish/task-3-report.md`

## 残余风险

- 按任务约束未做浏览器/四视口验收；将在 Task 6 统一执行。
- Impeccable `--diff` 的两条既有告警仍存在，但本任务目标文件单独扫描为零发现，未扩大范围处理。
- `.pi-subagents/` 是任务开始前已有的未跟踪运行目录，未暂存、未提交。

## 暂存区

提交完成后已复核：无 staged files；仅保留任务开始前已有的未跟踪 `.pi-subagents/`。
