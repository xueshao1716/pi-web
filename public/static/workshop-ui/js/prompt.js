// 界面工坊 · Prompt 导出器
// 参考 M3E Canvas 的 prompt.ts 思路：把结构化设计状态翻译成自然语言 brief。
// 只保留中文，目标是可直接粘贴给 Claude Code / Codex / Cursor。

import { COMPONENT_TYPES } from './state.js';

export function buildPrompt(doc) {
  const lines = [];
  const dark = doc.theme.dark ? '深色' : '浅色';
  const screens = doc.screens;

  lines.push('请根据以下界面设计说明，实现一个完整的页面。');
  lines.push('');
  lines.push('## 设计总览');
  lines.push(`- 设计风格：Material 3 Expressive（大圆角、层次化表面色、强调色容器）`);
  lines.push(`- 配色模式：${dark}模式`);
  lines.push(`- 种子色：${doc.theme.seed}（请以此为 brand color 派生 primary / surface / outline 等语义色）`);
  lines.push(`- 屏幕数量：${screens.length}`);
  lines.push('');
  lines.push('## 设计规范（请严格遵守）');
  lines.push('- 完全圆角按钮（pill 形），高度 40-56px');
  lines.push('- 卡片圆角 12-16px，使用 surface-1 层级色而非阴影');
  lines.push('- 文字层级：标题 16-24px / 正文 14px / 辅助 12px');
  lines.push('- 间距遵循 8dp 栅格（8/16/24/32）');
  lines.push('');

  screens.forEach((scr, i) => {
    lines.push(`## 屏幕 ${i + 1}：${scr.name}（${scr.size === 'phone' ? '手机 412×892' : '桌面 1280×800'}）`);
    if (i === 0) lines.push('（此为默认首页）');
    lines.push('');

    const sorted = [...scr.components].sort((a, b) => a.y - b.y || a.x - b.x);
    if (sorted.length === 0) {
      lines.push('（空屏幕）');
      lines.push('');
      return;
    }

    sorted.forEach((c) => {
      const def = COMPONENT_TYPES[c.type];
      const pos = describePos(c, scr);
      let desc = `【${def ? def.label : c.type}】${pos}`;
      const details = [];
      if (c.text) details.push(`文字"${c.text}"`);
      if (c.desc) details.push(`说明"${c.desc}"`);
      if (c.type === 'slider' && c.value != null) details.push(`当前值 ${c.value}%`);
      if (c.type === 'switch' || c.type === 'checkbox') details.push(c.checked === false ? '未选中' : '已选中');
      if (details.length) desc += '：' + details.join('，');
      lines.push('- ' + desc);
    });
    lines.push('');
  });

  lines.push('## 输出要求');
  lines.push('- 输出单文件 HTML（内联 CSS/JS），可直接在浏览器打开');
  lines.push('- 若有多个屏幕，用顶部或底部的导航在屏幕间切换');
  lines.push('- 交互组件（按钮/开关/滑条/输入框）需要真实可交互');
  lines.push('- 配色从种子色派生，保持整体和谐');
  return lines.join('\n');
}

// 位置描述：按画布 412 宽折算成大致区块
function describePos(c, scr) {
  const W = scr.size === 'phone' ? 412 : 1280;
  const cx = c.x + c.w / 2;
  let col;
  if (cx < W / 3) col = '左侧';
  else if (cx > (W * 2) / 3) col = '右侧';
  else col = '居中';
  const cy = c.y + c.h / 2;
  let row;
  if (cy < 200) row = '顶部';
  else if (cy > 650) row = '底部';
  else row = '中部';
  return `${row}${col}（x:${c.x}, y:${c.y}, ${c.w}×${c.h}）`;
}
