// pi-web 文件盒：临时签名下载 + 缩略图
// 借鉴：飞书 file_token / 钉钉 media_id / Slack 签名 URL
// 签名 URL 直接携带相对路径（签名防篡改 + 过期），重启不失效、不依赖内存映射
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { execFile } from "node:child_process";

// 签名密钥（进程随机，重启后旧链接自然过期——符合"临时链接"语义）
const SECRET = crypto.randomBytes(16).toString("hex");
const TTL_MS = 24 * 3600 * 1000; // 签名 24h 有效

// 生成带签名的下载 URL（相对路径，可下载可预览）
export function signedUrl(relPath, download = false) {
  const enc = encodeURIComponent(relPath);
  const exp = Date.now() + TTL_MS;
  // 注意：URLSearchParams.get 会自动解码，所以签名对象必须是原始路径
  const sig = crypto.createHmac("sha256", SECRET).update(`${relPath}:${exp}`).digest("hex").slice(0, 16);
  return `/api/ws/file?path=${enc}&exp=${exp}&sig=${sig}${download ? "&download=1" : ""}`;
}

// 校验签名 URL，返回相对路径或 null
export function verifySigned(req) {
  try {
    const u = new URL(req.url, "http://localhost");
    const rel = u.searchParams.get("path"); // 已自动解码
    const exp = parseInt(u.searchParams.get("exp") || "0", 10);
    const sig = u.searchParams.get("sig") || "";
    if (!rel || !exp || !sig) return { ok: false, reason: "缺参数" };
    if (Date.now() > exp) return { ok: false, reason: "链接已过期" };
    const expect = crypto.createHmac("sha256", SECRET).update(`${rel}:${exp}`).digest("hex").slice(0, 16);
    if (sig !== expect) return { ok: false, reason: "签名无效" };
    return { ok: true, rel };
  } catch { return { ok: false, reason: "解析失败" }; }
}

// 生成图片缩略图（用 Python PIL，Windows 兼容），返回相对路径
// 同步返回预期路径（异步生成），首次访问可能还没生成，前端可回退原图
export function makeThumb(relPath, wsRoot) {
  try {
    const abs = path.resolve(wsRoot, relPath);
    if (!fs.existsSync(abs)) return null;
    const ext = path.extname(abs).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(ext)) return null;
    const dir = path.join(wsRoot, ".thumbs");
    fs.mkdirSync(dir, { recursive: true });
    const thumbName = path.basename(abs, ext) + "-thumb.jpg";
    const thumbAbs = path.join(dir, thumbName);
    const rel = path.relative(wsRoot, thumbAbs).replace(/\\/g, "/");
    if (fs.existsSync(thumbAbs) && fs.statSync(thumbAbs).mtimeMs >= fs.statSync(abs).mtimeMs) {
      return rel;
    }
    const py = `from PIL import Image; im=Image.open(r"${abs}"); im.thumbnail((480,480)); im.convert("RGB").save(r"${thumbAbs}", quality=80)`;
    execFile("python", ["-c", py], { timeout: 15000, windowsHide: true }, (err) => {
      if (err) console.log(`[filebox] 缩略图生成失败: ${String(err.message||err).slice(0,60)}`);
      else console.log(`[filebox] 缩略图: ${thumbAbs}`);
    });
    return rel;
  } catch { return null; }
}
