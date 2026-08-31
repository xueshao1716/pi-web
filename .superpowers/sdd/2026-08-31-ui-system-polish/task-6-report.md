# Task 6 全站视觉验收报告

## 状态

已完成。Task 6 只修复了真实浏览器验收发现的一个 UI 问题：Apps 移动端原生工具选择器实际高度为 37px，不满足 44px 触控目标；已增加 `min-h-11`，未改变选择器行为、路由或 API。

## 浏览器验收

使用隔离 worktree 的 Vite 开发服务 `http://127.0.0.1:5173`，通过代理连接既有 API 服务；未重启生产服务、未替换生产 bundle。运行时令牌仅从本地文件读取并注入临时 Playwright context，不写入脚本、命令行参数、报告或截图内容。

### 截图扫描

- 视口：375×812、390×844、768×1024、1440×900
- 路由：chat、models、themes、system、apps、tasks、sessiondb
- 截图：29 张（含 mist + reduced-motion 额外场景）
- 横向溢出：0
- console error：0
- page error：0

截图与机器可读摘要保存在本地忽略目录：
`.superpowers/sdd/2026-08-31-ui-system-polish/browser-audit/`

当前模型通道无法解析截图像素，因此不对截图做未经证实的“肉眼视觉结论”；布局与交互结论以真实浏览器 DOM、计算几何和交互结果为证据。

### 交互验收：33/33

- 移动“更多”菜单打开、唯一 `aria-current`、初始焦点、Esc 关闭、焦点回收
- 移动导航和菜单项触控目标至少 44px
- Apps 移动选择器可见，实际尺寸 `358×44px`，可切换至技能库
- SessionDb 移动表格/卡片路径互斥，移动操作按钮满足 44px
- 768px 各目标页面无横向溢出
- 1440px Apps 桌面分组侧栏可见，移动选择器隐藏
- Themes 主题层级存在且开发者选项默认关闭
- System 能力清单默认折叠，四个 StatusTile 存在
- SessionDb 桌面表格路径存在，移动卡片在桌面隐藏
- 桌面右栏可打开/关闭，实际宽度 `460.796875px`，`position: relative`，参与布局而非悬浮遮挡
- mist 主题成功应用
- reduced-motion 媒体查询生效

## 代码验证

- `npm test`：252/252 通过
- `node --test frontend/tests/design-contract.test.mjs tests/unit/frontend-ui-structure.test.mjs`：40/40 通过
- `cd frontend && npx tsc --noEmit -p .`：通过
- `cd frontend && npm run build`：通过
- Impeccable detector：`[]`
- `git diff --check`：通过
- `frontend/dist` 已恢复到提交前状态，构建产物未纳入源码变更

## 变更文件

- `frontend/src/pages/Apps.tsx`
- `tests/unit/frontend-ui-structure.test.mjs`

## 残余风险

- 截图未由当前模型进行像素级视觉判读；已保留截图和结构化浏览器证据，后续若有可用视觉浏览器可再次做像素级审阅。
- 既有 Vite/UnoCSS/chunk-size 警告仍存在，但本轮未新增构建错误。
- 后端 `engine/system-panel.mjs` 非默认端口返回值风险仍按原计划 defer，未在 UI 任务中越界修改。
- 当前提交仍位于隔离分支 `feat/ui-system-polish`，尚未合并到生产 `main`，因此生产 8787 页面暂时不会显示本轮 UI。
