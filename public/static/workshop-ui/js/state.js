// 界面工坊 · 状态管理（单一真源）
// 灵感来源 M3E Canvas：整个设计 = 一个 JSON 状态树，所有操作都是对状态的操作，
// 渲染层只读状态。localStorage 持久化，URL hash 分享（二期）。

export const COMPONENT_TYPES = {
  button:    { label: '按钮',       w: 96,  h: 40,  category: '基础' },
  fab:       { label: '悬浮钮',     w: 56,  h: 56,  category: '基础' },
  input:     { label: '输入框',     w: 200, h: 48,  category: '基础' },
  switch:    { label: '开关',       w: 52,  h: 32,  category: '基础' },
  checkbox:  { label: '复选框',     w: 32,  h: 32,  category: '基础' },
  chip:      { label: '筛选片',     w: 88,  h: 32,  category: '基础' },
  slider:    { label: '滑条',       w: 200, h: 40,  category: '基础' },
  text:      { label: '文字',       w: 120, h: 28,  category: '基础' },
  card:      { label: '卡片',       w: 200, h: 120, category: '容器' },
  list:      { label: '列表项',     w: 240, h: 56,  category: '容器' },
  navbar:    { label: '顶部导航',   w: 412, h: 64,  category: '导航' },
  navrail:   { label: '导航轨',     w: 80,  h: 400, category: '导航' },
  bottomnav: { label: '底部导航',   w: 412, h: 72,  category: '导航' },
  dialog:    { label: '对话框',     w: 280, h: 160, category: '反馈' },
  snackbar:  { label: '提示条',     w: 280, h: 48,  category: '反馈' },
  progress:  { label: '加载指示器', w: 60,  h: 60,  category: '反馈' },
  image:     { label: '图片占位',   w: 160, h: 120, category: '媒体' },
};

// 屏幕画布规格（对齐 M3E：手机 + 桌面两种）
export const SCREEN_SIZES = {
  phone:   { w: 412,  h: 892, label: '手机' },
  desktop: { w: 1280, h: 800, label: '桌面' },
};

let uidCounter = 0;
export function uid(prefix = 'id') {
  uidCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidCounter.toString(36)}`;
}

export function createScreen(name = '屏幕 1', size = 'phone') {
  const s = SCREEN_SIZES[size] || SCREEN_SIZES.phone;
  return { id: uid('scr'), name, size, components: [] };
}

export function createDoc() {
  const first = createScreen('首页', 'phone');
  return {
    version: 1,
    theme: { seed: '#6750A4', dark: false },
    screens: [first],
    links: [], // { from: {screen, comp}, to: screenId } 组件跳转连线（二期）
    activeScreenId: first.id,
  };
}

const STORAGE_KEY = 'ui-forge-doc';

export function loadDoc() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const doc = JSON.parse(raw);
    if (!doc || !Array.isArray(doc.screens) || doc.screens.length === 0) return null;
    return doc;
  } catch (e) {
    return null;
  }
}

export function saveDoc(doc) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    return true;
  } catch (e) {
    return false;
  }
}

export function activeScreen(doc) {
  return doc.screens.find((s) => s.id === doc.activeScreenId) || doc.screens[0];
}

// —— 不可变操作（每次返回新 doc） ——

export function addComponent(doc, type, x, y) {
  const def = COMPONENT_TYPES[type];
  if (!def) return doc;
  const comp = {
    id: uid('cmp'),
    type,
    x: Math.round(x),
    y: Math.round(y),
    w: def.w,
    h: def.h,
    label: def.label,
    text: defaultText(type),
  };
  const screen = activeScreen(doc);
  return {
    ...doc,
    screens: doc.screens.map((s) =>
      s.id === screen.id ? { ...s, components: [...s.components, comp] } : s
    ),
  };
}

function defaultText(type) {
  switch (type) {
    case 'text': return '文字内容';
    case 'button': return '按钮';
    case 'chip': return '筛选片';
    case 'input': return '请输入…';
    case 'card': return '卡片标题';
    case 'list': return '列表项';
    default: return '';
  }
}

export function moveComponent(doc, compId, x, y) {
  return mapActiveComponents(doc, (comps) =>
    comps.map((c) => (c.id === compId ? { ...c, x: Math.round(x), y: Math.round(y) } : c))
  );
}

export function resizeComponent(doc, compId, w, h) {
  return mapActiveComponents(doc, (comps) =>
    comps.map((c) => (c.id === compId ? { ...c, w: Math.max(24, Math.round(w)), h: Math.max(24, Math.round(h)) } : c))
  );
}

export function updateComponent(doc, compId, patch) {
  return mapActiveComponents(doc, (comps) =>
    comps.map((c) => (c.id === compId ? { ...c, ...patch } : c))
  );
}

export function removeComponent(doc, compId) {
  return mapActiveComponents(doc, (comps) => comps.filter((c) => c.id !== compId));
}

export function duplicateComponent(doc, compId) {
  let newId = null;
  const next = mapActiveComponents(doc, (comps) => {
    const src = comps.find((c) => c.id === compId);
    if (!src) return comps;
    newId = uid('cmp');
    return [...comps, { ...src, id: newId, x: src.x + 16, y: src.y + 16 }];
  });
  return { doc: next, newId };
}

function mapActiveComponents(doc, fn) {
  const screen = activeScreen(doc);
  return {
    ...doc,
    screens: doc.screens.map((s) =>
      s.id === screen.id ? { ...s, components: fn(s.components) } : s
    ),
  };
}

// —— 屏幕级操作 ——

export function addScreen(doc, size = 'phone') {
  const n = doc.screens.length + 1;
  const scr = createScreen(`屏幕 ${n}`, size);
  return { ...doc, screens: [...doc.screens, scr], activeScreenId: scr.id };
}

export function renameScreen(doc, screenId, name) {
  return { ...doc, screens: doc.screens.map((s) => (s.id === screenId ? { ...s, name } : s)) };
}

export function removeScreen(doc, screenId) {
  if (doc.screens.length <= 1) return doc;
  const screens = doc.screens.filter((s) => s.id !== screenId);
  const activeScreenId = doc.activeScreenId === screenId ? screens[0].id : doc.activeScreenId;
  return { ...doc, screens, activeScreenId };
}

export function selectScreen(doc, screenId) {
  return { ...doc, activeScreenId: screenId };
}

export function setTheme(doc, patch) {
  return { ...doc, theme: { ...doc.theme, ...patch } };
}
