// 壁纸 CSS：渐变是 background-image 函数，图片才包 url()。一律 url() 会让预设点了没效果。
export function wallpaperCssImage(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (/^(linear|radial|conic)-gradient\(/i.test(v)) return v;
  if (/^url\(/i.test(v)) return v;
  return `url(${JSON.stringify(v)})`;
}

export function applyWallpaper(value) {
  if (typeof document === "undefined") return;
  const img = wallpaperCssImage(value);
  const wp = document.getElementById("pi-wallpaper");
  if (wp) {
    if (img) {
      wp.style.backgroundImage = img;
      wp.style.backgroundSize = "cover";
      wp.style.backgroundPosition = "center";
      wp.style.backgroundRepeat = "no-repeat";
    } else {
      wp.style.backgroundImage = "";
      wp.style.backgroundSize = "";
      wp.style.backgroundPosition = "";
      wp.style.backgroundRepeat = "";
    }
  }
  document.body.classList.toggle("has-wallpaper", !!img);
}

export function persistWallpaper(value) {
  const v = String(value || "");
  try { localStorage.setItem("pi_wallpaper", v); } catch (e) {
    return { ok: false, error: e };
  }
  applyWallpaper(v);
  try { window.dispatchEvent(new CustomEvent("pi-wallpaper-changed")); } catch {}
  return { ok: true };
}

export function currentWallpaper() {
  try { return localStorage.getItem("pi_wallpaper") || ""; } catch { return ""; }
}
