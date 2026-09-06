// 界面工坊 · 主逻辑
// 状态单一真源（state.js）→ 渲染层只读（render.js）→ 主题注入（theme.js）→ 导出（prompt.js）

import * as S from './state.js';
import { buildTokens, applyTokens, SEED_PRESETS } from './theme.js';
import { renderComponent } from './render.js';
import { buildPrompt } from './prompt.js';

const $ = (id) => document.getElementById(id);
let doc = S.loadDoc() || S.createDoc();
let selId = null;
let previewMode = false;
let dirty = false;

// —— 持久化（防抖） ——
let saveTimer = null;
function markDirty() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { S.saveDoc(doc); dirty = false; }, 400);
}

// —— 主题注入 ——
function applyTheme() {
  const tokens = buildTokens(doc.theme.seed, doc.theme.dark);
  applyTokens(tokens, $('phone-screen'));
  applyTokens(tokens, document.documentElement);
}

// —— 渲染 ——
function renderAll() {
  applyTheme();
  renderTabs();
  renderPalette();
  renderCanvas();
  renderInspector();
  renderSeedUI();
}

const PAL_ICONS = {
  button: '⬭', fab: '✛', input: '▭', switch: '⬒', checkbox: '☑', chip: '◈',
  slider: '⬌', text: 'T', card: '▤', list: '☰', navbar: '▔', navrail: '▏',
  bottomnav: '▁', dialog: '⬜', snackbar: '▬', progress: '◐', image: '🖼',
};

function renderPalette() {
  const box = $('palette-list');
  box.innerHTML = '';
  for (const [type, def] of Object.entries(S.COMPONENT_TYPES)) {
    const item = document.createElement('div');
    item.className = 'palette-item';
    item.draggable = true;
    item.dataset.type = type;
    item.innerHTML = `<span class="ico">${PAL_ICONS[type] || '▣'}</span>${def.label}`;
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', type);
    });
    box.appendChild(item);
  }
}

function renderTabs() {
  const box = $('screen-tabs');
  box.innerHTML = '';
  doc.screens.forEach((scr) => {
    const tab = document.createElement('button');
    tab.className = 'tab' + (scr.id === doc.activeScreenId ? ' active' : '');
    tab.innerHTML = `${esc(scr.name)}${doc.screens.length > 1 ? ' <span class="close" data-close="' + scr.id + '">✕</span>' : ''}`;
    tab.addEventListener('click', (e) => {
      if (e.target.dataset.close) {
        doc = S.removeScreen(doc, e.target.dataset.close);
        selId = null;
      } else {
        doc = S.selectScreen(doc, scr.id);
        selId = null;
      }
      markDirty(); renderAll();
    });
    box.appendChild(tab);
  });
  const add = document.createElement('button');
  add.className = 'tab';
  add.textContent = '＋';
  add.title = '新建屏幕';
  add.addEventListener('click', () => { doc = S.addScreen(doc); markDirty(); renderAll(); });
  box.appendChild(add);

  const cur = S.activeScreen(doc);
  $('screen-name').value = cur.name;
}

function renderCanvas() {
  const screenEl = $('phone-screen');
  screenEl.innerHTML = '';
  const scr = S.activeScreen(doc);
  screenEl.style.background = 'var(--tf-bg)';
  scr.components.forEach((c) => {
    screenEl.appendChild(renderComponent(c, c.id === selId && !previewMode));
  });
}

// —— 拖放：新增组件 ——
function setupDrop() {
  const screenEl = $('phone-screen');
  screenEl.addEventListener('dragover', (e) => e.preventDefault());
  screenEl.addEventListener('drop', (e) => {
    e.preventDefault();
    if (previewMode) return;
    const type = e.dataTransfer.getData('text/plain');
    if (!S.COMPONENT_TYPES[type]) return;
    const rect = screenEl.getBoundingClientRect();
    const scale = rect.width / screenEl.offsetWidth;
    let x = (e.clientX - rect.left) / scale - S.COMPONENT_TYPES[type].w / 2;
    let y = (e.clientY - rect.top) / scale - S.COMPONENT_TYPES[type].h / 2;
    doc = S.addComponent(doc, type, x, y);
    markDirty(); renderCanvas();
  });
}

// —— 选中 / 拖动 / 缩放 ——
function setupCanvasInteraction() {
  const screenEl = $('phone-screen');

  screenEl.addEventListener('mousedown', (e) => {
    const compEl = e.target.closest('.comp');
    if (previewMode) return; // 预览模式下不做编辑
    if (!compEl) {
      if (selId) { selId = null; renderCanvas(); renderInspector(); }
      return;
    }
    e.preventDefault();
    selId = compEl.dataset.id;
    const comp = findComp(selId);
    if (!comp) return;

    const isResize = e.target.classList.contains('resize-handle');
    const startX = e.clientX, startY = e.clientY;
    const ox = comp.x, oy = comp.y, ow = comp.w, oh = comp.h;
    const rect = screenEl.getBoundingClientRect();
    const scale = rect.width / screenEl.offsetWidth;

    function onMove(ev) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      if (isResize) {
        doc = S.resizeComponent(doc, selId, ow + dx, oh + dy);
      } else {
        doc = S.moveComponent(doc, selId, ox + dx, oy + dy);
      }
      // 拖动中直接改 DOM，避免全量重绘卡顿
      const c = findComp(selId);
      compEl.style.left = c.x + 'px';
      compEl.style.top = c.y + 'px';
      compEl.style.width = c.w + 'px';
      compEl.style.height = c.h + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      markDirty(); renderCanvas(); renderInspector();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    renderCanvas(); renderInspector();

    // 选中后追加 resize 手柄
    const sel = screenEl.querySelector('.comp.selected');
    if (sel) {
      const h = document.createElement('div');
      h.className = 'resize-handle';
      sel.appendChild(h);
    }
  });

  // 双击改文字（简单 prompt 方案，一期够用）
  screenEl.addEventListener('dblclick', (e) => {
    const compEl = e.target.closest('.comp');
    if (!compEl || previewMode) return;
    const comp = findComp(compEl.dataset.id);
    if (!comp) return;
    const t = prompt('修改文字：', comp.text || '');
    if (t != null) {
      doc = S.updateComponent(doc, comp.id, { text: t });
      markDirty(); renderCanvas(); renderInspector();
    }
  });
}

function findComp(id) {
  return S.activeScreen(doc).components.find((c) => c.id === id) || null;
}

// —— 属性面板 ——
function renderInspector() {
  const box = $('inspector');
  const comp = findComp(selId);
  if (!comp) {
    box.innerHTML = '<div class="empty">未选中组件</div>';
    $('sel-type').textContent = '';
    return;
  }
  const def = S.COMPONENT_TYPES[comp.type];
  $('sel-type').textContent = def ? def.label : comp.type;

  const rows = [];
  rows.push(field('文字', `<input data-k="text" value="${escAttr(comp.text || '')}">`));
  if (['card', 'list', 'dialog'].includes(comp.type)) {
    rows.push(field('说明', `<input data-k="desc" value="${escAttr(comp.desc || '')}">`));
  }
  if (comp.type === 'text') {
    rows.push(field('对齐', `<select data-k="align">
      <option value="left"${comp.align === 'left' ? ' selected' : ''}>左</option>
      <option value="center"${comp.align === 'center' ? ' selected' : ''}>中</option>
      <option value="right"${comp.align === 'right' ? ' selected' : ''}>右</option></select>`));
  }
  if (comp.type === 'slider') {
    rows.push(field('值', `<input type="range" data-k="value" min="0" max="100" value="${comp.value != null ? comp.value : 50}">`));
  }
  if (comp.type === 'switch' || comp.type === 'checkbox') {
    rows.push(field('选中', `<input type="checkbox" data-k="checked" ${comp.checked === false ? '' : 'checked'}>`));
  }
  rows.push(field('位置', `<span style="font-size:11px;color:var(--txt-dim)">x:${comp.x} y:${comp.y} · ${comp.w}×${comp.h}</span>`));
  rows.push(`<button id="btn-dup" class="btn ghost small">⧉ 复制</button>
             <button id="btn-del" class="btn ghost small">🗑 删除</button>`);
  box.innerHTML = rows.join('');

  box.querySelectorAll('[data-k]').forEach((el) => {
    const k = el.dataset.k;
    const handler = () => {
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'checked' && v === true) v = undefined; // checked 默认即为 true
      doc = S.updateComponent(doc, comp.id, k === 'checked' && v === undefined ? { checked: true } : { [k]: v });
      markDirty();
      if (k !== 'value' || true) renderCanvas();
    };
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'range' ? 'input' : 'change', handler);
    if (el.tagName === 'INPUT' && el.type === 'text') el.addEventListener('input', handler);
  });
  const dup = $('btn-dup'), del = $('btn-del');
  if (dup) dup.addEventListener('click', () => {
    const r = S.duplicateComponent(doc, comp.id);
    doc = r.doc; selId = r.newId; markDirty(); renderAll();
  });
  if (del) del.addEventListener('click', () => {
    doc = S.removeComponent(doc, comp.id);
    selId = null; markDirty(); renderAll();
  });
}

function field(label, html) {
  return `<div><label>${label}</label>${html}</div>`;
}

// —— 主题面板 ——
function renderSeedUI() {
  $('seed-color').value = doc.theme.seed;
  $('dark-mode').checked = !!doc.theme.dark;
  const box = $('seed-presets');
  box.innerHTML = '';
  SEED_PRESETS.forEach((p) => {
    const dot = document.createElement('div');
    dot.className = 'preset-dot' + (p.seed.toLowerCase() === doc.theme.seed.toLowerCase() ? ' active' : '');
    dot.style.background = p.seed;
    dot.title = p.name;
    dot.addEventListener('click', () => { doc = S.setTheme(doc, { seed: p.seed }); markDirty(); renderAll(); });
    box.appendChild(dot);
  });
}

function setupThemePanel() {
  $('seed-color').addEventListener('input', (e) => {
    doc = S.setTheme(doc, { seed: e.target.value });
    markDirty(); applyTheme(); renderSeedUI();
  });
  $('dark-mode').addEventListener('change', (e) => {
    doc = S.setTheme(doc, { dark: e.target.checked });
    markDirty(); renderAll();
  });
  $('screen-name').addEventListener('change', (e) => {
    doc = S.renameScreen(doc, S.activeScreen(doc).id, e.target.value || '未命名');
    markDirty(); renderTabs();
  });
  $('btn-add-screen').addEventListener('click', () => { doc = S.addScreen(doc); markDirty(); renderAll(); });
}

// —— 整理（Tidy，借鉴 M3E Canvas） ——
function tidy() {
  const scr = S.activeScreen(doc);
  const W = scr.size === 'phone' ? 412 : 1280;
  const EDGE = 16;
  let comps = [...scr.components];

  comps.sort((a, b) => a.y - b.y || a.x - b.x);
  let y = EDGE;
  for (const c of comps) {
    let x = c.x;
    // 全宽组件贴边
    if (c.w >= W - 32) x = 0;
    else if (Math.abs(c.x - EDGE) < 24) x = EDGE;
    else if (Math.abs(c.x + c.w - (W - EDGE)) < 24) x = W - EDGE - c.w;
    doc = S.moveComponent(doc, c.id, x, Math.max(EDGE, y));
    y = Math.max(EDGE, y) + c.h + 8;
  }
  markDirty(); renderCanvas();
  toast('✨ 已整理（贴边 + 纵向排列）');
}

// —— 预览模式 ——
function togglePreview() {
  previewMode = !previewMode;
  $('btn-preview').textContent = previewMode ? '✎ 编辑' : '▶ 预览';
  $('btn-preview').classList.toggle('primary', previewMode);
  $('hint').textContent = previewMode
    ? '预览模式：组件不可编辑，切回「编辑」继续调整'
    : '拖左边的组件进屏幕 · 点选后可拖动/改文字 · Delete 删除';
  renderCanvas();
}

// —— 导出 ——
function openExport() {
  $('prompt-out').value = buildPrompt(doc);
  $('modal-mask').classList.add('show');
}

// —— snackbar ——
let toastTimer = null;
function toast(msg) {
  const el = $('snackbar');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function escAttr(s) { return esc(s); }

// —— 键盘 ——
function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('modal-mask').classList.remove('show'); return; }
    if (previewMode || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selId) {
      doc = S.removeComponent(doc, selId);
      selId = null; markDirty(); renderAll();
    }
  });
}

// —— 启动 ——
function init() {
  applyTheme();
  setupDrop();
  setupCanvasInteraction();
  setupThemePanel();
  setupKeyboard();
  $('btn-tidy').addEventListener('click', tidy);
  $('btn-preview').addEventListener('click', togglePreview);
  $('btn-export').addEventListener('click', openExport);
  $('btn-close-modal').addEventListener('click', () => $('modal-mask').classList.remove('show'));
  $('modal-mask').addEventListener('click', (e) => {
    if (e.target === $('modal-mask')) $('modal-mask').classList.remove('show');
  });
  $('btn-copy').addEventListener('click', async () => {
    const ta = $('prompt-out');
    try { await navigator.clipboard.writeText(ta.value); toast('✓ 已复制到剪贴板'); }
    catch { ta.select(); document.execCommand('copy'); toast('✓ 已复制'); }
  });
  renderAll();
  // 首次进入放一个示例组件，避免白屏没方向
  if (S.activeScreen(doc).components.length === 0 && !S.loadDoc()) {
    doc = S.addComponent(doc, 'navbar', 0, 24);
    doc = S.updateComponent(doc, S.activeScreen(doc).components[0].id, { text: '我的应用' });
    doc = S.addComponent(doc, 'text', 24, 120);
    doc = S.addComponent(doc, 'card', 24, 170);
    doc = S.addComponent(doc, 'button', 148, 780);
    doc = S.addComponent(doc, 'bottomnav', 0, 820);
    markDirty(); renderAll();
  }
}

init();
