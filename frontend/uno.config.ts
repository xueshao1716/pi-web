import { defineConfig, presetUno, presetAttributify } from 'unocss'

// UnoCSS 配置：继承 pi-web 深色 token，命名空间化
export default defineConfig({
  presets: [presetUno(), presetAttributify()],
  theme: {
    colors: {
      'pi-bg': 'var(--pi-bg)',
      'pi-bg1': 'var(--pi-bg1)',
      'pi-bg2': 'var(--pi-bg2)',
      'pi-bg3': 'var(--pi-bg3)',
      'pi-bg-hover': 'var(--pi-bg-hover)',
      'pi-bg-active': 'var(--pi-bg-active)',
      'pi-border': 'var(--pi-border)',
      'pi-border-soft': 'var(--pi-border-soft)',
      'pi-text': 'var(--pi-text)',
      'pi-dim': 'var(--pi-dim)',
      'pi-dim2': 'var(--pi-dim2)',
      'pi-accent': 'var(--pi-accent)',
      'pi-accent2': 'var(--pi-accent2)',
      'pi-accent-deep': 'var(--pi-accent-deep)',
      'pi-green': 'var(--pi-green)',
      'pi-red': 'var(--pi-red)',
      'pi-yellow': 'var(--pi-yellow)',
      // 语义层级 token（HeroUI surface/overlay/field）
      'pi-surface': 'var(--pi-surface)',
      'pi-surface-fg': 'var(--pi-surface-fg)',
      'pi-overlay': 'var(--pi-overlay)',
      'pi-overlay-fg': 'var(--pi-overlay-fg)',
      'pi-field': 'var(--pi-field)',
      'pi-field-border': 'var(--pi-field-border)',
      'pi-default': 'var(--pi-default)',
      'pi-success': 'var(--pi-success)',
      'pi-warning': 'var(--pi-warning)',
      'pi-danger': 'var(--pi-danger)',
    },
    transitionDuration: {
      fast: '0.14s',
      base: '0.2s',
      slow: '0.3s',
    },
  },
  shortcuts: {
    'btn': 'press inline-flex items-center justify-center gap-1.5 rounded-pi-md px-3 py-1.5 text-sm font-medium cursor-pointer select-none disabled:opacity-50 disabled:pointer-events-none',
    'btn-primary': 'btn btn-grad text-white hover:brightness-110 active:scale-[.98]',
    'btn-ghost': 'btn text-pi-dim hover:text-pi-text hover:bg-pi-bg3',
    'btn-tool': 'btn w-7 h-7 p-0 text-pi-dim hover:text-pi-text hover:bg-pi-bg-hover active:bg-pi-bg-active rounded-pi-sm',
    'card': 'rounded-pi-lg border border-pi-border bg-pi-bg2',
    'panel': 'rounded-pi-lg glass-hi',
    'input-pi': 'w-full px-3 py-2 rounded-pi-md bg-pi-field border border-pi-field-border text-pi-text text-sm outline-none focus:border-pi-accent focus:ring-1 focus:ring-pi-accent/40 placeholder:text-pi-dim2 transition-colors',
  },
  rules: [
    ['rounded-pi-sm', { 'border-radius': 'var(--pi-r-sm)' }],
    ['rounded-pi-md', { 'border-radius': 'var(--pi-r-md)' }],
    ['rounded-pi-lg', { 'border-radius': 'var(--pi-r-lg)' }],
    ['rounded-pi-xl', { 'border-radius': 'var(--pi-r-xl)' }],
    ['rounded-pi-pill', { 'border-radius': 'var(--pi-r-sm)' }],
  ],
})
