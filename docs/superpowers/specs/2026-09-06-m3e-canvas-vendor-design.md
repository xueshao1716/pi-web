# 界面工坊接入官方 M3E Canvas

日期：2026-09-06  
来源：用户确认走「把官方静态包请进仓库」，不再打磨自绘 v0.1。

## 决定

- 上游：[lnkiai/m3e-canvas](https://github.com/lnkiai/m3e-canvas)（MIT）
- 产物落到 `public/workshop-ui/`，经 `/static/workshop-ui/` 提供
- 构建 `NEXT_PUBLIC_BASE_PATH=/static/workshop-ui`
- 创作页「界面工坊」用 `location.replace` 整页打开（官方是整页设计工具；现网 8787 仍 DENY iframe）
- 入口带 `?vanilla=1`，兼容现网 CSP；`server.mjs` 同时给该路径单独放行 `unsafe-inline` + `frame-ancestors 'self'`

## 不做

- 不继续美化自绘壳
- 不 iframe 官方 GitHub Pages（依赖外网，且父页 CSP `default-src 'self'` 会挡）
