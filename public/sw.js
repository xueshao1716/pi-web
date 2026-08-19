// pi-web Service Worker —— 静态资源缓存，API 不缓存
const CACHE = "pi-web-v27"; // v22: Beautiful-UI 风格工具卡片（t-dot 状态圆点/chip）；v21: 双向同步
const STATIC = ["/", "/index.html", "/static/app.css", "/static/css/quantum.css",
  "/static/js/core.js", "/static/js/theme.js", "/static/js/chat.js",
  "/static/js/wallpaper.js", "/static/js/model.js", "/static/js/ui.js",
  "/static/js/workspace.js", "/static/js/designer.js", "/static/js/input.js",
  "/static/js/registry.js", "/static/js/panels.js",
  "/static/vendor/highlight.min.js", "/static/vendor/github-dark.min.css",
  "/static/icon-192.png", "/static/icon-512.png", "/static/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // API 请求一律不走缓存（需要鉴权头）
  if (e.request.method !== "GET" || url.pathname.startsWith("/api")) return;

  // network-first：在线时总是拿最新，离线时回退缓存
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(e.request).then((cached) => cached || Response.error()))
  );
});
