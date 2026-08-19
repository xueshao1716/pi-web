// ===== http.mjs —— 统一 HTTP 客户端（原生 fetch，替代早期 python 子进程方案）=====
// 语义与旧版 httpJsonFetch 完全对齐：
//   - 非 2xx（4xx/5xx）也 resolve，返回 {status, ok:false, json(), text()}——调用方依赖此行为走 endpoint fallback 链
//   - 仅网络错误 / 超时 reject；超时错误文案为 "timeout"（调用方按 /timeout/i 识别）
//   - headers 未带 User-Agent 时补浏览器 UA（web_search 抓取等依赖）
//   - 自动走系统代理（旧 python/urllib 的核心行为）：env 代理变量 → Windows 注册表系统代理 → 直连。
//     代理通过 undici ProxyAgent 实现（动态导入；未安装 undici 时退回直连）。

import { execFile } from "node:child_process";

let proxyResolved = false;
let proxyUrl = null; // null = 无代理，直连

function readEnvProxy() {
  return (
    process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy ||
    process.env.ALL_PROXY || process.env.all_proxy || ""
  ).trim() || null;
}

// Windows 系统代理（Internet Options / Clash / v2rayN 写入的注册表项），urllib 的 getproxies 在 Windows 上优先读这里
function readWindowsRegistryProxy() {
  if (process.platform !== "win32") return Promise.resolve(null);
  return new Promise((resolve) => {
    const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
    execFile("reg", ["query", key, "/v", "ProxyServer"], { timeout: 3000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const m = stdout.match(/ProxyServer\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)/i);
      if (!m) return resolve(null);
      let val = m[1].trim();
      if (!val) return resolve(null);
      // 两种格式："host:port" 或 "http=host:port;https=host:port;..."
      if (val.includes("=")) {
        const parts = Object.fromEntries(val.split(";").map((s) => s.split("=")));
        val = parts["https"] || parts["http"] || "";
      }
      if (!val) return resolve(null);
      resolve(/^https?:\/\//i.test(val) ? val : `http://${val}`);
    });
  });
}

async function ensureProxyResolved() {
  if (proxyResolved) return;
  proxyUrl = readEnvProxy() || (process.platform === "win32" ? await readWindowsRegistryProxy() : null);
  // ProxyEnable=0 时注册表值是残留的，仅当存在 enabled 标记才信任注册表结果（env 代理不受此限）
  if (proxyUrl && !readEnvProxy() && process.platform === "win32") {
    const enabled = await new Promise((resolve) => {
      execFile("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyEnable"],
        { timeout: 3000, windowsHide: true }, (err, stdout) => {
          resolve(!err && /ProxyEnable\s+REG_DWORD\s+0x1/i.test(stdout));
        });
    });
    if (!enabled) proxyUrl = null;
  }
  proxyResolved = true;
}

let dispatcherCache = null;
async function getProxyDispatcher(urlObj) {
  // 回环/内网地址永远直连（no_proxy 基本语义；也保证本地服务调用不被系统代理劫持）
  const host = urlObj?.hostname || "";
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return null;
  const noProxy = (process.env.NO_PROXY || process.env.no_proxy || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (noProxy.some((p) => host === p || host.endsWith(p.startsWith(".") ? p : "." + p))) return null;
  await ensureProxyResolved();
  if (!proxyUrl) return null;
  if (dispatcherCache) return dispatcherCache;
  try {
    const undici = await import("undici");
    dispatcherCache = new undici.ProxyAgent(proxyUrl);
  } catch {
    // undici 未安装：退回直连（与无代理环境一致），不阻塞请求
    return null;
  }
  return dispatcherCache;
}

async function rawFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = options.timeout || 60000;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const headers = { ...options.headers };
    if (!headers["User-Agent"] && !headers["user-agent"]) {
      headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0";
    }
    const init = {
      method: options.method || "GET",
      headers,
      signal: controller.signal,
    };
    if (options.body) init.body = options.body;
    const dispatcher = await getProxyDispatcher(new URL(url));
    if (dispatcher) init.dispatcher = dispatcher; // undici 扩展字段：代理隧道
    return await fetch(url, init);
  } catch (err) {
    if (err?.name === "AbortError" || controller.signal.aborted) throw new Error("timeout");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function httpJsonFetch(url, options = {}) {
  const r = await rawFetch(url, options);
  // body 只读一次后缓存——与旧 python 版语义一致（json()/text() 可重复调用，互不冲突）
  const text = await r.text();
  return {
    status: r.status,
    ok: r.status >= 200 && r.status < 300,
    json: async () => { try { return JSON.parse(text); } catch { return null; } },
    text: async () => text,
  };
}

// 二进制版：直接返回 Buffer（替代旧 python 子进程 base64 中转方案）
export async function httpBufferFetch(url, options = {}) {
  const r = await rawFetch(url, options);
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, ok: r.ok, buffer: () => buf };
}

export default httpJsonFetch;
