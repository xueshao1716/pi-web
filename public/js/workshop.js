// ===== workshop.js（专项工作台：PPT 工作室，文章/视频后续接入）=====
// ══ 打开/关闭 ══
$("workshop-btn").addEventListener("click", () => { $("workshop-modal").classList.add("show"); });
$("ws-close").addEventListener("click", () => $("workshop-modal").classList.remove("show"));
$("workshop-modal").addEventListener("click", (e) => { if (e.target === e.currentTarget) $("workshop-modal").classList.remove("show"); });

// ══ 生成过程渲染 ══
const wsLog = (text, cls = "") => {
  const box = $("ws-progress");
  if (!box) return;
  if (box.querySelector(".ws-empty")) box.innerHTML = "";
  const el = document.createElement("div");
  el.className = "ws-log" + (cls ? " " + cls : "");
  el.textContent = text;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
};

// ══ PPT 生成（SSE 流式）══
$("ws-ppt-go").addEventListener("click", async () => {
  const theme = $("ws-ppt-theme").value.trim();
  if (!theme) { $("ws-ppt-theme").focus(); return; }
  const body = {
    theme,
    pages: parseInt($("ws-ppt-pages").value, 10) || 10,
    style: $("ws-ppt-style").value,
    audience: $("ws-ppt-audience").value.trim(),
  };
  const go = $("ws-ppt-go");
  go.disabled = true;
  go.textContent = "⏳ 生成中…";
  $("ws-progress").innerHTML = "";
  $("ws-result").hidden = true;
  $("ws-result").innerHTML = "";
  let toolOpen = false;
  try {
    const r = await fetch("/api/workshop/ppt", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      wsLog("❌ " + (e.error || "请求失败"), "err");
      return;
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value || new Uint8Array(), { stream: !done });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const line = chunk.split("\n").find(l => l.startsWith("data: "));
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line.slice(6)); } catch { continue; }
        if (ev.text !== undefined) {
          // 工具开始：打开一个新工具行；文本：追加
          if (ev.text.startsWith("📊") || ev.text.startsWith("🧠")) wsLog(ev.text, "note");
          else if (ev.text.startsWith("✅") || ev.text.startsWith("⚠")) wsLog(ev.text, ev.text.startsWith("✅") ? "ok" : "warn");
        } else if (ev.name !== undefined && ev.args !== undefined && ev.id !== undefined) {
          // tool 事件：工具卡片
          const cmd = ev.args?.command || ev.args?.path || JSON.stringify(ev.args || "").slice(0, 60);
          const div = document.createElement("div");
          div.className = "ws-tool running";
          div.dataset.tid = ev.id;
          div.innerHTML = `<span class="ws-tool-ico">$</span><span class="ws-tool-name">${esc(ev.name)}</span><span class="ws-tool-cmd">${esc(String(cmd))}</span><span class="ws-tool-state">运行中</span>`;
          $("ws-progress").appendChild(div);
          toolOpen = true;
          $("ws-progress").scrollTop = $("ws-progress").scrollHeight;
        } else if (ev.id !== undefined && ev.name !== undefined && "isError" in ev) {
          // tool_end：更新状态
          const el = document.querySelector(`.ws-tool[data-tid="${ev.id}"]`);
          if (el) {
            el.classList.remove("running");
            el.classList.add(ev.isError ? "err" : "ok");
            el.querySelector(".ws-tool-state").textContent = ev.isError ? "✕ 失败" : "✓ 完成";
            el.querySelector(".ws-tool-state").style.color = ev.isError ? "var(--red)" : "var(--green)";
          }
        } else if (ev.file) {
          // 产物文件卡片
          const f = ev.file;
          const url = "/api/ws/file?path=" + encodeURIComponent(f.path) + "&download=1";
          const res = $("ws-result");
          res.hidden = false;
          res.innerHTML = `
            <div class="ws-result-card">
              <span class="ws-result-ico">📄</span>
              <span class="ws-result-info"><span class="ws-result-name">${esc(f.name)}</span><span class="ws-result-meta">${(f.size / 1024).toFixed(0)} KB</span></span>
              <a class="ws-result-dl" href="${url}" download>⬇ 下载</a>
            </div>`;
        } else if (ev.ok !== undefined && "file" in ev) {
          wsLog(ev.ok ? "🎉 完成" : "⚠️ 未检测到产物", ev.ok ? "ok" : "warn");
        } else if (ev.message !== undefined) {
          wsLog("❌ " + ev.message, "err");
        }
      }
    }
  } catch (e) {
    wsLog("❌ 连接中断: " + (e.message || e), "err");
  } finally {
    go.disabled = false;
    go.textContent = "✨ 开始生成";
  }
});
