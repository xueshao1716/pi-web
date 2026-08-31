// ===== registry.js —— 消息渲染注册表（借鉴官方 pi-web-ui 插件式渲染）=====
// 设计：新消息类型 = registerMessageRenderer(type, handler) 注册一行，不动核心分发逻辑
// 用法：
//   registerMessageRenderer("mytype", (ctx) => { ...处理 obj... });
//   dispatchRenderer("mytype", ctx)  // 核心分发统一调用

// 渲染器注册表：type -> handler(ctx)
// ctx = { ev, obj, key, sid } 事件上下文
const rendererRegistry = new Map();

// 注册一个消息类型渲染器
// handler(ctx): 处理该类型事件，返回 true 表示已处理
function registerMessageRenderer(type, handler) {
  if (typeof handler !== "function") return false;
  rendererRegistry.set(type, handler);
  return true;
}

// 分发：按类型调用渲染器，返回 true 表示有渲染器处理了
function dispatchRenderer(type, ctx) {
  const handler = rendererRegistry.get(type);
  if (!handler) return false;
  try {
    return handler(ctx) === true;
  } catch (e) {
    console.error(`[registry] 渲染器 ${type} 出错:`, e);
    return false;
  }
}

// 列出已注册的类型（调试用）
function listRenderers() {
  return [...rendererRegistry.keys()];
}

// 移除渲染器（动态开关）
function unregisterMessageRenderer(type) {
  return rendererRegistry.delete(type);
}

// 全局挂载（普通 script 无 module，需挂 window 供 chat.js 使用）
window.registerMessageRenderer = registerMessageRenderer;
window.dispatchRenderer = dispatchRenderer;
window.listRenderers = listRenderers;
window.unregisterMessageRenderer = unregisterMessageRenderer;
