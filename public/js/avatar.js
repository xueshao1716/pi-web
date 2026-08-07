// ===== avatar.js — 小语虚拟形象（canvas 自绘，情绪联动）=====
// 设计：Q 版半身人物，纯代码绘制零外部依赖
// 表情由 window.emoState（chat.js refreshEmotion 写入）驱动：
//   valence（愉悦度）→ 嘴角/眼神弯度/腮红
//   arousal（唤醒度）→ 眉毛/眼睛开合/光环亮度
//   tags（语义线索）→ 覆盖式表情（警觉/安抚/兴奋）
// 平滑过渡：每帧 lerp 当前参数 → 目标参数，避免表情跳变
(function () {
  if (window.__avatarLoaded) return;
  window.__avatarLoaded = true;

  // ── 容器（右下角，替代原 Live2D 位）──
  const wrap = document.createElement("div");
  wrap.id = "xy-avatar";
  wrap.style.cssText = [
    "position:fixed", "right:16px", "bottom:0", "z-index:60",
    "width:170px", "height:230px", "pointer-events:none",
    "user-select:none", "-webkit-user-select:none",
  ].join(";");
  const canvas = document.createElement("canvas");
  canvas.width = 170; canvas.height = 230;
  canvas.style.width = "100%"; canvas.style.height = "100%";
  canvas.style.pointerEvents = "auto"; // 点击可互动
  wrap.appendChild(canvas);
  document.body.appendChild(wrap);

  const ctx = canvas.getContext("2d");
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = 170 * DPR; canvas.height = 230 * DPR;
  ctx.scale(DPR, DPR);

  // ── 情绪 → 表情参数 ──
  // 目标参数结构：
  //   eyeOpen 0~1（睁眼程度）、eyeArc -1~1（负=垂眼 正=弯眼笑）
  //   brow -1~1（负=皱眉 正=挑眉）、mouth -1~1（负=撇嘴 正=大笑开合）
  //   blush 0~1（腮红浓度）、halo 0.5~1.2（光环亮度）
  const cur = { eyeOpen: 0.85, eyeArc: 0.1, brow: 0.05, mouth: 0.3, blush: 0.15, halo: 0.75 };
  const tgt = { ...cur };

  function computeTarget(s) {
    const v = s.valence || 0, a = s.arousal || 0;
    const tags = s.tags || [];
    const T = { eyeOpen: 0.85, eyeArc: 0.1, brow: 0.05, mouth: 0.3, blush: 0.15, halo: 0.75 };
    // 语义覆盖（优先级最高）
    if (tags.includes("alert_risk")) {
      T.eyeOpen = 0.95; T.eyeArc = -0.2; T.brow = -0.75; T.mouth = 0.1; T.blush = 0; T.halo = 1.25;
    } else if (tags.includes("user_frustrated")) {
      T.eyeArc = 0.25; T.brow = -0.2; T.mouth = 0.45; T.blush = 0.35; T.halo = 0.85; // 安抚微笑
    } else if (tags.includes("user_urgent")) {
      T.eyeOpen = 1; T.eyeArc = -0.1; T.brow = -0.5; T.mouth = 0.15; T.blush = 0; T.halo = 1.1;
    } else if (tags.includes("task_accomplish")) {
      T.eyeArc = 0.6; T.brow = 0.35; T.mouth = 0.85; T.blush = 0.8; T.halo = 1.1; // 交付达成
    } else {
      // 连续映射：愉悦度→笑，唤醒度→紧张
      T.eyeArc = Math.max(-0.35, Math.min(0.7, v * 0.9));
      T.mouth = Math.max(-0.3, Math.min(0.9, 0.35 + v * 0.9));
      T.brow = Math.max(-0.6, Math.min(0.35, 0.05 - a * 0.55));
      T.blush = Math.max(0, Math.min(0.85, v * 0.9 + (a > 0.6 ? 0.15 : 0)));
      T.eyeOpen = a > 0.55 ? 1 : (v < -0.2 ? 0.55 : 0.85);
      T.halo = 0.65 + Math.max(0, v) * 0.4 - Math.max(0, -v) * 0.25;
    }
    return T;
  }

  // ── 眨眼 ──
  let blinkTimer = 2000 + Math.random() * 3000;
  let blinkUntil = 0;
  const blinkDur = 130;

  // ── 主循环 ──
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(50, now - last); last = now;

    // 平滑过渡（每帧 8% 趋近，表情变化柔和）
    const k = 1 - Math.pow(0.0008, dt / 1000); // 时间归一化 lerp
    for (const key of Object.keys(tgt)) cur[key] += (tgt[key] - cur[key]) * k;

    // 读情绪（每秒最多一次）
    const es = window.emoState;
    if (es && es.state && (!es._t || now - es._t > 900)) {
      Object.assign(tgt, computeTarget(es.state));
      es._t = now;
    }

    // 眨眼
    blinkTimer -= dt;
    if (blinkTimer <= 0) { blinkUntil = now + blinkDur; blinkTimer = 2000 + Math.random() * 3500; }
    const blinkAmt = now < blinkUntil ? Math.sin((now - blinkUntil + blinkDur) / blinkDur * Math.PI) : 0;

    draw(now, blinkAmt);
    requestAnimationFrame(tick);
  }

  // ── 绘制 ──
  function draw(now, blinkAmt) {
    const W = 170, H = 230;
    ctx.clearRect(0, 0, W, H);

    const breath = Math.sin(now / 900) * 1.6; // 呼吸浮动
    const cx = 85, baseY = 128 + breath;

    // ── 光环（品牌金色，情绪越亮越亮）──
    const haloA = (cur.halo * 0.16);
    if (haloA > 0.01) {
      const hg = ctx.createRadialGradient(cx, baseY - 8, 10, cx, baseY - 8, 78);
      hg.addColorStop(0, `rgba(200,164,74,${haloA})`);
      hg.addColorStop(1, "rgba(200,164,74,0)");
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(cx, baseY - 8, 78, 0, Math.PI * 2); ctx.fill();
    }

    // ── 身体（小斗篷）──
    ctx.fillStyle = "#23263a";
    ctx.beginPath();
    ctx.moveTo(cx - 30, baseY + 42);
    ctx.quadraticCurveTo(cx - 52, baseY + 18, cx - 44, baseY - 26);
    ctx.lineTo(cx + 44, baseY - 26);
    ctx.quadraticCurveTo(cx + 52, baseY + 18, cx + 30, baseY + 42);
    ctx.closePath(); ctx.fill();
    // 金色领结
    ctx.fillStyle = "#c8a44a";
    ctx.beginPath();
    ctx.moveTo(cx, baseY - 24); ctx.lineTo(cx - 11, baseY - 12); ctx.lineTo(cx, baseY - 16); ctx.lineTo(cx + 11, baseY - 12);
    ctx.closePath(); ctx.fill();

    // ── 头 ──
    const faceY = baseY - 58, faceR = 40;
    ctx.fillStyle = "#f4e3d0";
    ctx.beginPath(); ctx.arc(cx, faceY, faceR, 0, Math.PI * 2); ctx.fill();

    // ── 头发（后发 + 刘海 + 双马尾）──
    ctx.fillStyle = "#3a2f4d";
    // 后发（半圆罩）
    ctx.beginPath(); ctx.arc(cx, faceY - 6, faceR + 7, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
    // 双马尾（左右各一束，轻微摆动）
    const swing = Math.sin(now / 700) * 3;
    ctx.beginPath();
    ctx.moveTo(cx - faceR + 2, faceY - 12);
    ctx.quadraticCurveTo(cx - faceR - 14, faceY + 6 + swing, cx - faceR - 4, faceY + 26 + swing);
    ctx.quadraticCurveTo(cx - faceR + 2, faceY + 20 + swing, cx - faceR + 8, faceY + 2);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + faceR - 2, faceY - 12);
    ctx.quadraticCurveTo(cx + faceR + 14, faceY + 6 - swing, cx + faceR + 4, faceY + 26 - swing);
    ctx.quadraticCurveTo(cx + faceR - 2, faceY + 20 - swing, cx + faceR - 8, faceY + 2);
    ctx.closePath(); ctx.fill();
    // 刘海（三瓣）
    ctx.fillStyle = "#3a2f4d";
    ctx.beginPath();
    ctx.arc(cx, faceY - 10, faceR + 4, Math.PI * 1.05, Math.PI * 1.6);
    ctx.quadraticCurveTo(cx - 6, faceY + 2, cx - 14, faceY - 14);
    ctx.quadraticCurveTo(cx, faceY - 8, cx + 2, faceY - 22);
    ctx.fill();
    // 金发饰
    ctx.fillStyle = "#c8a44a";
    ctx.beginPath(); ctx.arc(cx, faceY - faceR + 4, 4.5, 0, Math.PI * 2); ctx.fill();

    // ── 眼睛（情绪核心）──
    const eyeY = faceY + 2, eyeDX = 15, eyeW = 11;
    const open = Math.max(0.08, cur.eyeOpen * (1 - blinkAmt * 0.9));
    const arc = cur.eyeArc;
    for (const side of [-1, 1]) {
      const ex = cx + side * eyeDX;
      // 眼白（上弧弯度由 arc 决定）
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, eyeW, 7.5 * open, 0, 0, Math.PI * 2);
      ctx.fill();
      // 上眼睑（弯眼笑时形成∩）
      ctx.fillStyle = "#3a2f4d";
      ctx.beginPath();
      ctx.ellipse(ex, eyeY - 1 - arc * 6, eyeW + 0.5, 4, 0, Math.PI, 0);
      ctx.fill();
      // 虹膜
      const irisR = 4.6 * Math.max(0.4, open);
      ctx.fillStyle = "#5b6ea8";
      ctx.beginPath(); ctx.arc(ex, eyeY + 1, irisR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2c3552";
      ctx.beginPath(); ctx.arc(ex, eyeY + 1, irisR * 0.55, 0, Math.PI * 2); ctx.fill();
      // 高光
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.beginPath(); ctx.arc(ex - irisR * 0.35, eyeY - irisR * 0.35, irisR * 0.32, 0, Math.PI * 2); ctx.fill();
    }

    // ── 眉毛 ──
    ctx.strokeStyle = "#3a2f4d"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      const bx = cx + side * eyeDX, by = eyeY - 15 - cur.brow * 3;
      ctx.beginPath();
      ctx.moveTo(bx - 7, by + (side === -1 ? cur.brow * 2.5 : -cur.brow * 2.5));
      ctx.lineTo(bx + 7, by + (side === -1 ? -cur.brow * 2.5 : cur.brow * 2.5));
      ctx.stroke();
    }

    // ── 嘴巴 ──
    const my = faceY + 22;
    ctx.strokeStyle = "#b96a5a"; ctx.lineWidth = 2.6; ctx.lineCap = "round";
    const m = cur.mouth;
    if (m > 0.5) {
      // 大笑（张嘴）
      ctx.fillStyle = "#9e4f43";
      ctx.beginPath(); ctx.ellipse(cx, my + 1, 8 + m * 4, 6 + m * 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#f4e3d0";
      ctx.beginPath(); ctx.arc(cx, my + 3, 2.2, 0, Math.PI * 2); ctx.fill();
    } else if (m > -0.15) {
      // 微笑弧
      ctx.beginPath();
      ctx.arc(cx, my - 2, 7 + m * 5, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    } else {
      // 撇嘴
      ctx.beginPath();
      ctx.arc(cx, my + 4, 6, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }

    // ── 腮红 ──
    if (cur.blush > 0.02) {
      ctx.fillStyle = `rgba(240,130,120,${cur.blush * 0.42})`;
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.arc(cx + side * 26, faceY + 14, 6.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    // ── 状态标签（情绪名，跟随鼠标悬停显示）──
    const es = window.emoState;
    if (es && es.meta && es.meta.label) {
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(200,164,74,.75)";
      ctx.fillText(es.meta.label, cx, H - 8);
    }
  }

  // 点击互动：给个反馈（跳动）
  canvas.addEventListener("pointerdown", () => {
    wrap.animate([
      { transform: "translateY(0)" },
      { transform: "translateY(-10px)" },
      { transform: "translateY(0)" },
    ], { duration: 350, easing: "ease-out" });
  });

  // 移动端隐藏（省空间）
  if (window.innerWidth <= 768) { wrap.style.display = "none"; return; }

  requestAnimationFrame(tick);
})();
