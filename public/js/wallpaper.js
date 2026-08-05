// ===== wallpaper.js（从 app.js 拆分，全局作用域，保持原逻辑不变）=====
// ══ 背景壁纸（借鉴 Codex Dream Skin）══
let wallpaper = null;
try { wallpaper = JSON.parse(localStorage.getItem("pi_wallpaper") || "null"); } catch {}
function applyWallpaper() {
  const r = document.documentElement.style;
  if (wallpaper && wallpaper.url) {
    r.setProperty("--wallpaper", `url("${wallpaper.url}")`);
    r.setProperty("--wallpaper-opacity", String(wallpaper.opacity ?? 0.55));
    r.setProperty("--wallpaper-blur", (wallpaper.blur ?? 6) + "px");
    r.setProperty("--wallpaper-dim", String(0.45));
    document.body.classList.add("has-wallpaper");
  } else {
    r.removeProperty("--wallpaper");
    r.removeProperty("--wallpaper-opacity");
    r.removeProperty("--wallpaper-blur");
    r.removeProperty("--wallpaper-dim");
    document.body.classList.remove("has-wallpaper");
  }
  if (wallpaper && wallpaper.url) {
    $("wp-opacity").value = wallpaper.opacity ?? 0.55;
    $("wp-blur").value = wallpaper.blur ?? 6;
    $("wp-status").textContent = "✓ 壁纸生效";
  } else {
    $("wp-status").textContent = "";
  }
}
function saveWallpaper() {
  try { localStorage.setItem("pi_wallpaper", JSON.stringify(wallpaper)); } catch { toast("壁纸太大，存储失败"); }
  applyWallpaper();
}
$("wp-upload").addEventListener("click", () => $("wp-file").click());
$("wp-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1920 / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      wallpaper = { url: canvas.toDataURL("image/jpeg", 0.82), opacity: 0.55, blur: 6 };
      saveWallpaper();
      toast("壁纸已应用 ✨");
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  e.target.value = "";
});
$("wp-url-apply").addEventListener("click", () => {
  const url = $("wp-url").value.trim();
  if (!url) return toast("请输入图片 URL");
  wallpaper = { url, opacity: parseFloat($("wp-opacity").value), blur: parseInt($("wp-blur").value) };
  saveWallpaper();
  toast("壁纸已应用 ✨");
});
$("wp-opacity").addEventListener("input", () => {
  if (!wallpaper || !wallpaper.url) return;
  wallpaper.opacity = parseFloat($("wp-opacity").value);
  applyWallpaper();
});
$("wp-blur").addEventListener("input", () => {
  if (!wallpaper || !wallpaper.url) return;
  wallpaper.blur = parseInt($("wp-blur").value);
  applyWallpaper();
});
$("wp-remove").addEventListener("click", () => {
  wallpaper = null;
  localStorage.removeItem("pi_wallpaper");
  applyWallpaper();
  toast("壁纸已移除");
});
applyWallpaper();

