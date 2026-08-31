// ===== panels.js —— Gateway 2.0 引擎面板 + 代码模式面板（dsh 设计沉淀）=====
// 引擎面板：显示组件实现、插件列表、动态注册/卸载
// 代码模式面板：编辑器 + 运行 + 让模型写（PTC/Code Mode：模型写程序编排工具）
// 注意：用 core.js 的全局 api()（自动带 Authorization header + 超时），不要重复定义

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// ────────────────────────────────────────────────
// 🧩 引擎面板
// ────────────────────────────────────────────────
async function loadEngineStatus() {
  const box = document.getElementById("eng-status");
  if (!box) return;
  box.innerHTML = '<div class="eng-loading">引擎状态加载中…</div>';
  try {
    const st = await api("/api/engine/status");
    box.innerHTML = "";
    const comp = st.components || {};

    // ══ 1. 组件实现：2×2 网格卡片 ══
    const compGrid = el("div", "eng-block");
    compGrid.appendChild(el("div", "eng-sec-title", "组件实现 · 全部可替换"));
    const grid = el("div", "eng-grid");
    const comps = [
      { icon: "brain", name: "模型适配器", value: comp.modelAdapter?.name || "—", note: "ModelAdapter" },
      { icon: "tool", name: "工具注册表", value: comp.toolRegistry?.name || "—", note: "ToolRegistry" },
      { icon: "edit", name: "会话存储", value: comp.sessionStore?.name || "—", note: "SessionStore" },
      { icon: "sync", name: "Agent 循环", value: comp.agentLoop?.name || "—", note: "AgentLoop" },
    ];
    for (const c of comps) {
      const card = el("div", "eng-card");
      const head = el("div", "eng-card-head");
      const iconSpan = document.createElement("span");
      iconSpan.innerHTML = ICON(c.icon, 16);
      head.appendChild(iconSpan);
      head.appendChild(el("span", "eng-card-name", c.name));
      card.appendChild(head);
      card.appendChild(el("div", "eng-card-value", c.value));
      card.appendChild(el("div", "eng-card-note", c.note));
      grid.appendChild(card);
    }
    compGrid.appendChild(grid);
    // 可用工具 chips
    const toolsRow = el("div", "eng-tools-row");
    toolsRow.appendChild(el("span", "eng-tools-label", "可用工具"));
    const tspan = el("span", null);
    (comp.toolRegistry?.tools || []).forEach((t) => tspan.appendChild(el("span", "eng-tag ok", t)));
    toolsRow.appendChild(tspan);
    compGrid.appendChild(toolsRow);
    box.appendChild(compGrid);

    // ══ 2. 插件列表 ══
    const pl = el("div", "eng-block");
    pl.appendChild(el("div", "eng-sec-title", `已注册插件 · ${st.plugins?.length || 0} 个`));
    const plist = el("div", "eng-plugin-list");
    (st.plugins || []).forEach((p) => {
      const row = el("div", "eng-plugin");
      // 左：名称 + 依赖
      const left = el("div", "eng-plugin-left");
      const nameRow = el("div", "eng-plugin-name");
      nameRow.appendChild(el("span", null, p.name));
      if (p.version) nameRow.appendChild(el("span", "eng-plugin-ver", "v" + p.version));
      left.appendChild(nameRow);
      if (p.deps?.length) {
        const d = el("div", "eng-plugin-deps");
        d.appendChild(el("span", "eng-deps-label", "依赖 "));
        p.deps.forEach((dp) => d.appendChild(el("span", "eng-tag", dp)));
        left.appendChild(d);
      }
      row.appendChild(left);
      // 右：状态 + 卸载
      const right = el("div", "eng-plugin-right");
      right.appendChild(el("span", p.mounted ? "eng-badge ok" : "eng-badge off", p.mounted ? "● 已挂载" : "○ 未挂载"));
      const del = el("button", "btn-mini eng-unload", "卸载");
      del.title = "卸载该插件（演示可替换性）";
      del.addEventListener("click", async () => {
        try {
          await api("/api/engine/plugins/unregister", { method: "POST", body: { id: p.id } });
          loadEngineStatus();
        } catch (e) { alert("卸载失败: " + e.message); }
      });
      right.appendChild(del);
      row.appendChild(right);
      plist.appendChild(row);
    });
    pl.appendChild(plist);
    box.appendChild(pl);

    // ══ 3. 动态注册 ══
    const reg = el("div", "eng-block");
    reg.appendChild(el("div", "eng-sec-title", "动态注册插件"));
    const hint = el("div", "eng-hint", "粘贴插件定义 JSON（mount 可写函数体字符串，如 return { hello: () => \"world\" }）");
    reg.appendChild(hint);
    const inp = document.createElement("textarea");
    inp.rows = 3;
    inp.className = "eng-reg-input";
    inp.placeholder = '{"id":"my-plugin","deps":[],"mount":"return { hello: () => \"world\" }"}';
    const regRow = el("div", "eng-reg-row");
    const btn = el("button", "btn-mini eng-reg-btn", "注册");
    btn.addEventListener("click", async () => {
      try {
        const obj = JSON.parse(inp.value || "{}");
        if (typeof obj.mount === "string") {
          const body = obj.mount;
          obj.mount = () => eval(`(${body})`);
        }
        const r = await api("/api/engine/plugins/register", { method: "POST", body: obj });
        alert("已注册: " + r.id + (r.mounted ? "（已挂载）" : ""));
        loadEngineStatus();
      } catch (e) { alert("注册失败: " + e.message); }
    });
    regRow.appendChild(btn);
    reg.appendChild(inp);
    reg.appendChild(regRow);
    box.appendChild(reg);
  } catch (e) {
    box.innerHTML = "";
    box.appendChild(el("div", "err", "❌ " + e.message));
  }
}

// ────────────────────────────────────────────────
// 💻 代码模式面板（PTC/Code Mode）
// ────────────────────────────────────────────────
const CODE_SAMPLE = `// 示例：一次运行组合多个工具
const files = await $tools.bash('dir /b D:\\\\pi-workspace');
console.log('工作区文件:', files.text);
const info = await $tools.read('README.md');
console.log('README 前 80 字:', info.text.slice(0, 80));
return { 文件数: files.text.split('\\n').length, 有README: !!info.text };`;

async function loadCodeTools() {
  const box = document.getElementById("code-tools");
  if (!box) return;
  try {
    const st = await api("/api/code/tools");
    box.innerHTML = "";
    (st.bindings || []).forEach((b) => {
      const chip = el("span", "code-tool-chip", `$tools.${b.name}(${b.args})`);
      chip.title = b.description || "";
      box.appendChild(chip);
    });
    const editor = document.getElementById("code-editor");
    if (editor && !editor.value.trim()) editor.value = CODE_SAMPLE;
  } catch (e) {
    box.innerHTML = "";
    box.appendChild(el("span", "err", "❌ " + e.message));
  }
}

function renderCodeOut(container, r) {
  container.innerHTML = "";
  if (r.error) {
    container.appendChild(el("div", "err", `✖ [${r.error.kind}] ${r.error.message}`));
    return;
  }
  (r.logs || []).forEach((l) => container.appendChild(el("div", "log-line", l)));
  if (r.value !== undefined) {
    const v = typeof r.value === "string" ? r.value : JSON.stringify(r.value, null, 2);
    container.appendChild(el("div", null, "→ " + v));
  }
  if (!r.logs?.length && r.value === undefined) container.appendChild(el("div", "log-line", "(程序无输出)"));
}

function setCodeMsg(msg, isErr) {
  const m = document.getElementById("code-msg");
  if (m) { m.textContent = msg; m.style.color = isErr ? "#f85149" : "var(--muted)"; }
}

function initCodePanel() {
  const runBtn = document.getElementById("code-run");
  const modelBtn = document.getElementById("code-model");
  const out = document.getElementById("code-out");
  const editor = document.getElementById("code-editor");
  if (!runBtn || !editor) return;

  runBtn.addEventListener("click", async () => {
    out.innerHTML = "运行中…";
    setCodeMsg("");
    try {
      const r = await api("/api/code/run", { method: "POST", timeoutMs: 120000, body: { program: editor.value } });
      renderCodeOut(out, r);
      setCodeMsg(r.error ? "运行失败" : `✔ 完成（${(r.logs || []).length} 条日志）`, !!r.error);
    } catch (e) {
      out.innerHTML = "";
      out.appendChild(el("div", "err", "❌ " + e.message));
      setCodeMsg("请求失败", true);
    }
  });

  modelBtn.addEventListener("click", async () => {
    const task = prompt("想让模型做什么？（它会写程序并用工具执行）", "列出 D:/pi-workspace 目录下的文件，统计每个子目录的文件数");
    if (!task) return;
    out.innerHTML = "🤖 模型写程序中…";
    setCodeMsg("");
    try {
      // 让模型生成程序（不直接执行，先给用户看）→ 自动填充编辑器
      const r = await api("/api/engine/chat", {
        method: "POST",
        timeoutMs: 300000, // 模型写程序可能多轮思考，给足 5 分钟
        body: {
          message: `请为以下任务编写一段 JavaScript 程序（用 run_code 工具的格式：顶层 await 可用，工具通过 $tools.<name>() 调用，console.log 输出日志，return 返回结果）。只输出程序代码本身，不要解释。\n任务：${task}`,
          tools: false,
          system: "你是代码模式助手。工具绑定：bash(command)、read(path)、write(path,content)、edit(path,oldText,newText)、web_search(query)。每个绑定返回 { text, isError }。",
        },
      });
      const code = String(r.text || "").replace(/^```(?:js|javascript)?\s*|\s*```$/g, "").trim();
      editor.value = code;
      out.innerHTML = "";
      out.appendChild(el("div", null, "已生成程序，点「▶ 运行」执行"));
    } catch (e) {
      out.innerHTML = "";
      out.appendChild(el("div", "err", "❌ " + e.message));
      setCodeMsg("生成失败", true);
    }
  });

  // Ctrl+Enter 运行
  editor.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") runBtn.click();
  });
}

// 视图切换时按需初始化
window.initEnginePanel = loadEngineStatus;
window.initCodePanel = () => { loadCodeTools(); initCodePanel(); };
