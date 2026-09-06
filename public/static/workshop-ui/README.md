# 界面工坊 · M3E 草图板 v0.1

灵感来源 [M3E Canvas](https://github.com/lnkiai/m3e-canvas)：在浏览器里拖拽组装 Material 3 Expressive 风格界面，一键导出给 AI 编码工具的 Prompt。

## 用法
直接用浏览器打开 `index.html`（或挂任意静态服务）。

- **左侧面板**：17 种 M3E 组件，拖进屏幕即添加
- **中间画布**：412×892 手机屏；点选组件可拖动、右下角手柄缩放、双击改文字、Delete 删除
- **右侧面板**：种子色 / 6 预设 / 明暗切换（HSL 派生整套语义色）；组件属性；多屏幕管理
- **顶部**：✨ 整理（贴边+纵向排列）、▶ 预览、⇪ 导出 Prompt

## 架构
```
index.html          入口 + 三栏布局
css/workshop.css    编辑器壳样式（深色科技风）
js/state.js         状态单一真源：doc = {theme, screens[]}，不可变操作，localStorage 持久化
js/theme.js         主题引擎：种子色 → CSS 变量 tokens（纯函数，支持 hex/hsl 输入）
js/render.js        组件渲染器：读 tokens 绘制 17 种 M3E 风格组件
js/prompt.js        Prompt 导出器：结构化状态 → 中文自然语言 brief
js/main.js          主逻辑：拖放/选中/拖动/缩放/键盘/面板联动
```

设计文档存在 localStorage（key: `ui-forge-doc`），无后端、无依赖、纯原生 JS。

## 自测
```
node js/selftest.mjs        # 状态/主题/Prompt 单测
node selftest-http.mjs      # 静态资源可达性
```

## Roadmap（二期）
- URL hash 分享链接（deflate+base64，无后端分享）
- 组件间连线（页面跳转）+ 预览模式可点按走流程
- 桌面屏 1280×800
- agent.md 协议：让外部 AI agent 产出设计 JSON 导入
