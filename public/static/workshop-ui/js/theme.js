// 界面工坊 · 主题引擎
// 移植 M3E/M3 思想：一个种子色派生整套语义色板（HSL 空间），明暗两套。
// 纯函数，可单测。

// #rgb / #rrggbb / hsl(...) → {h,s,l} (s/l: 0-100)
export function hexToHsl(input) {
  if (typeof input === 'string') {
    const m2 = /^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i.exec(input.trim());
    if (m2) return { h: parseFloat(m2[1]) % 360, s: parseFloat(m2[2]), l: parseFloat(m2[3]) };
  }
  let m = /^#([0-9a-f]{3})$/i.exec(input);
  if (m) {
    const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16) / 255);
    return rgbToHsl(r, g, b);
  }
  m = /^#([0-9a-f]{6})$/i.exec(input);
  if (!m) return { h: 262, s: 40, l: 60 }; // M3 默认紫兜底
  const n = parseInt(m[1], 16);
  return rgbToHsl(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmt = (o) => `hsl(${Math.round(o.h)}, ${Math.round(clamp(o.s, 0, 100))}%, ${Math.round(clamp(o.l, 0, 100))}%)`;

// 种子色 → CSS 变量表（明/暗）
export function buildTokens(seedHex, dark = false) {
  const seed = hexToHsl(seedHex);
  const h = seed.h;
  const s = clamp(seed.s, 30, 80); // 色相保真，饱和度收敛到可用区间

  if (dark) {
    return {
      '--tf-primary':        fmt({ h, s, l: 80 }),
      '--tf-on-primary':     fmt({ h, s: s * 0.9, l: 20 }),
      '--tf-primary-container': fmt({ h, s: s * 0.8, l: 32 }),
      '--tf-on-primary-container': fmt({ h, s: s * 0.6, l: 90 }),
      '--tf-surface':        fmt({ h, s: 16, l: 8 }),
      '--tf-surface-1':      fmt({ h, s: 14, l: 12 }),
      '--tf-surface-2':      fmt({ h, s: 13, l: 16 }),
      '--tf-on-surface':     fmt({ h, s: 12, l: 92 }),
      '--tf-on-surface-var': fmt({ h, s: 8, l: 68 }),
      '--tf-outline':        fmt({ h, s: 8, l: 42 }),
      '--tf-bg':             fmt({ h, s: 16, l: 6 }),
      '--tf-error':          'hsl(0, 72%, 68%)',
    };
  }
  return {
    '--tf-primary':        fmt({ h, s, l: 42 }),
    '--tf-on-primary':     '#ffffff',
    '--tf-primary-container': fmt({ h, s: s * 0.75, l: 90 }),
    '--tf-on-primary-container': fmt({ h, s: s * 0.9, l: 18 }),
    '--tf-surface':        fmt({ h, s: 30, l: 98 }),
    '--tf-surface-1':      fmt({ h, s: 24, l: 94 }),
    '--tf-surface-2':      fmt({ h, s: 20, l: 90 }),
    '--tf-on-surface':     fmt({ h, s: 12, l: 12 }),
    '--tf-on-surface-var': fmt({ h, s: 8, l: 36 }),
    '--tf-outline':        fmt({ h, s: 8, l: 62 }),
    '--tf-bg':             fmt({ h, s: 24, l: 96 }),
    '--tf-error':          'hsl(0, 60%, 44%)',
  };
}

// 把 tokens 应用到元素（画布沙盒与编辑器壳分开，互不污染）
export function applyTokens(tokens, el) {
  for (const [k, v] of Object.entries(tokens)) el.style.setProperty(k, v);
}

export const SEED_PRESETS = [
  { name: '经典紫', seed: '#6750A4' },
  { name: '靛蓝',   seed: '#4C5FD5' },
  { name: '青绿',   seed: '#00A884' },
  { name: '落日橙', seed: '#E8683A' },
  { name: '樱粉',   seed: '#D5488C' },
  { name: '石墨',   seed: '#5C6670' },
];
