/* ══ WebGL 等离子波浪背景（vanilla，无 three.js 依赖）══════
   借鉴 APEX-UI 的 ShaderBackground 思路，但纯手写 WebGL + GLSL。
   波浪主色读取 CSS 变量跟随主题；改主题即时变。
   - prefers-reduced-motion: reduce → 降级为静态渐变（不渲染动画）
   - 通过 opts.onVisibilityChange / opts.watch 控制启停（省电）
   暴露 window.initPlasmaBg(canvas, opts) 供任意页面复用；
   登录页自启动（#plasma-bg 存在即初始化）。
*/
(function () {
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function cssColor(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function hexToRgb(hex) {
    const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
    if (!m) return [0.5, 0.5, 0.6];
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  const vsSource = "attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.0,1.0);}";
  const fsSource = `
  precision highp float;
  uniform vec2  iResolution;
  uniform float iTime;
  uniform vec3  uAccent;
  uniform vec3  uAccent2;
  uniform vec3  uDeep;
  uniform float uAlpha;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0,0.0)), c = hash(i + vec2(0.0,1.0)), d = hash(i + vec2(1.0,1.0));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  }
  float fbm(vec2 p){
    float v = 0.0, amp = 0.5;
    for(int i=0;i<5;i++){ v += amp * noise(p); p *= 2.03; amp *= 0.5; }
    return v;
  }
  void main(){
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
    float t = iTime * 0.12;
    float n = fbm(p * 2.4 + vec2(t, -t * 0.7));
    float n2 = fbm(p * 3.2 - vec2(t * 0.6, t * 0.9) + 3.0);
    float wave = fbm(p * 2.0 + vec2(n * 0.9, n2 * 0.9) + t * 0.8);
    vec3 col = mix(uAccent, uAccent2, smoothstep(0.2, 0.8, wave));
    col = mix(col, uDeep, smoothstep(0.6, 1.0, n2) * 0.6);
    float vig = smoothstep(0.75, 0.2, length(p));
    float glow = 0.35 + 0.65 * smoothstep(0.3, 0.9, wave);
    col *= glow * (0.55 + 0.45 * vig);
    col += uAccent * pow(wave, 3.0) * 0.35;
    float alpha = uAlpha * (0.35 + 0.4 * smoothstep(0.2, 0.95, wave));
    gl_FragColor = vec4(col, alpha);
  }`;

  // initPlasmaBg(canvas, opts) → 返回 { start, stop, resize }
  // opts = { alpha (默认 0.9), onVisibilityChange(visible) 可选回调 }
  function initPlasmaBg(canvas, opts) {
    if (!canvas) return null;
    const ctx = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!ctx) return null;
    const alpha = (opts && typeof opts.alpha === "number") ? opts.alpha : 0.9;
    const onVis = opts && opts.onVisibilityChange;

    function compile(type, src) {
      const s = ctx.createShader(type);
      ctx.shaderSource(s, src);
      ctx.compileShader(s);
      if (!ctx.getShaderParameter(s, ctx.COMPILE_STATUS)) { console.error(ctx.getShaderInfoLog(s)); return null; }
      return s;
    }
    const vs = compile(ctx.VERTEX_SHADER, vsSource);
    const fs = compile(ctx.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;
    const prog = ctx.createProgram();
    ctx.attachShader(prog, vs); ctx.attachShader(prog, fs); ctx.linkProgram(prog);
    if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) { console.error(ctx.getProgramInfoLog(prog)); return null; }
    ctx.useProgram(prog);

    const buf = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), ctx.STATIC_DRAW);
    const aPos = ctx.getAttribLocation(prog, "aPos");
    ctx.enableVertexAttribArray(aPos);
    ctx.vertexAttribPointer(aPos, 2, ctx.FLOAT, false, 0, 0);

    const uRes = ctx.getUniformLocation(prog, "iResolution");
    const uTime = ctx.getUniformLocation(prog, "iTime");
    const uAccent = ctx.getUniformLocation(prog, "uAccent");
    const uAccent2 = ctx.getUniformLocation(prog, "uAccent2");
    const uDeep = ctx.getUniformLocation(prog, "uDeep");
    const uAlpha = ctx.getUniformLocation(prog, "uAlpha");

    let raf = 0, running = false, t0 = performance.now();
    function frame(now) {
      const t = (now - t0) / 1000;
      ctx.uniform2f(uRes, canvas.width, canvas.height);
      ctx.uniform1f(uTime, t);
      ctx.uniform3f(uAccent, ...hexToRgb(cssColor("--accent", "#8b7cf6")));
      ctx.uniform3f(uAccent2, ...hexToRgb(cssColor("--accent-2", "#a394ff")));
      ctx.uniform3f(uDeep, ...hexToRgb(cssColor("--accent-deep", "#6d5ce7")));
      ctx.uniform1f(uAlpha, alpha);
      ctx.drawArrays(ctx.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(frame);
    }
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener("resize", resize);
    resize();
    function start() { if (!running && !reduced) { running = true; raf = requestAnimationFrame(frame); if (onVis) onVis(true); } }
    function stop() { running = false; cancelAnimationFrame(raf); if (onVis) onVis(false); }

    if (reduced) { frame(performance.now()); running = false; }
    else start();
    return { start, stop, resize };
  }

  window.initPlasmaBg = initPlasmaBg;

  // ── 登录页自启动：存在 #plasma-bg 即初始化，登录成功后自动停止 ──
  const loginCanvas = document.getElementById("plasma-bg");
  if (loginCanvas) {
    const bg = initPlasmaBg(loginCanvas, {
      alpha: 0.9,
      onVisibilityChange: () => {},
    });
    const loginEl = document.getElementById("login");
    const obs = new MutationObserver(() => {
      const visible = loginEl && getComputedStyle(loginEl).display !== "none";
      if (visible) bg && bg.start(); else bg && bg.stop();
    });
    obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["style"] });
    document.addEventListener("visibilitychange", () => { document.hidden ? (bg && bg.stop()) : (bg && bg.start()); });
  }
})();
