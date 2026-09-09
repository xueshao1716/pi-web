# 工坊 HTML 六项 brief（一个动词）

日期：2026-09-07  
状态：已落地（需重启 8787 + 前端 build 后工坊表单可见）  
来源：Codex 前端 brief 对照，用户确认落地。

## 目标

生成 HTML 设计稿前，把任务写成可检查的六项：范围、结构、材质、**整套一个动词**、技术栈、验收。交互/版式必须和标题说同一件事。

## 做法

- `engine/workshop-html-brief.mjs`：推断或接收动词，补全六项，格式化进 ppt-html 执行提示
- 扩写 `kind=html`：一句话也能填出 brief
- 工坊表单：可选动词 + 智能填充；空则后端兜底
- `ppt-html` 技能：deck.json 写 `verb`；禁止 CDN / React / Tailwind / Inter 外链
- lint：缺动词记 warn，不把旧作品打成 error

## 不做什么

- 不改聊天/Board 壳
- 不把 Lithos 岩层揭花当默认主题
- 不换 React+Tailwind 栈
