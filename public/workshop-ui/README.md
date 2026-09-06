# 界面工坊 · 官方 M3E Canvas

本目录是 [lnkiai/m3e-canvas](https://github.com/lnkiai/m3e-canvas)（MIT）的静态导出，不是元枢自绘壳。

- 上游提交：`d2bc92c`
- 构建：`NEXT_PUBLIC_BASE_PATH=/static/workshop-ui`
- 入口：`/static/workshop-ui/index.html?vanilla=1`
- 元枢壳：`yuanshu-shell.css` / `yuanshu-shell.js`（顶栏 + 0.72 缩放 + 元枢主题/壁纸 + 元枢模型）。升级官方导出后要重新挂上这两行。
- 许可证：见同目录 `LICENSE`

升级：克隆上游 → 同样 base path 再 `npm run build` → 用 `out/` 覆盖本目录，并更新提交号。
