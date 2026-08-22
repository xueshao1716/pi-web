import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import UnoCSS from 'unocss/vite'

// 主界面 React 前端构建配置：
//   dev   → 产物在 frontend/dist（不污染 public/，线上 pi-web 可用）
//   发布  → 手动把 dist 产物复制到 public（/static 或根），替换旧 vanilla 入口
// 独立开发：dev 时 /api 代理到本地 pi-web（8787），便于联调
export default defineConfig({
  plugins: [react(), UnoCSS()],
  base: './',  // 相对路径，构建产物可放任意子目录（如 public/react/）
  build: {
    outDir: 'dist',        // 独立输出，绝不覆盖 public/
    emptyOutDir: true,     // dist 可以清（只含 React 产物）
    rollupOptions: {
      input: 'index.html',
    },
  },
  server: {
    port: 5173,
    // 钉死 IPv4 回环：默认可能只绑 [::1]，配合系统代理时本机都连不上
    host: '127.0.0.1',
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/static': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
})

