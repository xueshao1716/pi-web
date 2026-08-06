// ===== workshop.js（专项工作台：入口跳转独立页）=====
// 专项工作台已升级为独立页面（可直达 URL），这里只负责主界面入口跳转：
// - /workshop        工作台首页（三专项卡片）
// - /workshop/ppt    PPT 工作室独立页
// - /workshop/article、/workshop/video 即将上线
$("workshop-btn").addEventListener("click", () => {
  const t = new URLSearchParams(location.search).get("token") || localStorage.getItem("pi_web_token") || "";
  const sep = t ? "?token=" + encodeURIComponent(t) : "";
  location.href = "/workshop" + sep;
});
