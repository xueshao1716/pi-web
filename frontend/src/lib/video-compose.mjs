// 镜头卡格子：按「当前人、地点 × 这套拍法」现写光影风格，不拷芯片原句。

const LIGHT_FROM_PLACE = [
  { re: /地铁|车厢/, src: "冷白顶灯" },
  { re: /月|夜色|空山|山道|仙/, src: "冷月光" },
  { re: /孤灯|豆油|茶馆|油灯/, src: "暖油灯" },
  { re: /雨巷|青石|油纸|阴天/, src: "阴天漫射" },
  { re: /雨街|霓虹|湿街/, src: "霓虹倒影" },
  { re: /路灯|江堤|夜跑/, src: "暖黄路灯" },
  { re: /窗|书房|桌面|原木/, src: "窗边柔光" },
];

const KNOWN_SOURCES = [
  "硬顶光", "冷白顶灯", "冷月光", "暖油灯", "暖黄路灯", "霓虹倒影",
  "阴天漫射", "窗边柔光", "侧窗柔光", "环境光", "脸前柔光", "逆光", "冷环境光",
];

export function inferLightSource(scene = "", extra = "") {
  const t = `${scene} ${extra}`;
  for (const { re, src } of LIGHT_FROM_PLACE) {
    if (re.test(t)) return src;
  }
  return "";
}

export function splitLighting(lighting) {
  const s = String(lighting || "").trim();
  if (!s) return { source: "", shape: "" };
  if (/主光|说话|听的人|被访者/.test(s)) return { source: "", shape: s };
  for (const src of KNOWN_SOURCES) {
    if (s.startsWith(src)) {
      return { source: src, shape: s.slice(src.length).replace(/^[，,\s]+/, "").trim() };
    }
  }
  return { source: s, shape: "" };
}

function joinLight(source, shape, original) {
  if (!source && !shape) return original || "光线有方向";
  if (!shape) return source;
  if (!source) return shape;
  if (shape.startsWith("切开")) return `${source}${shape}`;
  const rest = shape.replace(/^有/, "");
  return `${source}，${rest}`;
}

function placeCue(scene = "", subject = "") {
  const t = `${scene} ${subject}`;
  if (/山道|空山|仙|青衣|古装/.test(t)) return "古装布料和山道要能认";
  if (/地铁|车厢/.test(t)) return "车厢顶灯和人群肩膀要能认";
  if (/雨巷|青石|油纸/.test(t)) return "湿石板和伞面要能认";
  if (/茶馆/.test(t)) return "茶馆桌椅和衣袖要能认";
  return "";
}

export function composeVideoShot(card, story = {}) {
  if (!card) {
    return { lighting: "", camera: "", style: "", constraint: "", seconds: "10", frame: "16:9" };
  }
  const camera = card.camera || "一次一个运镜";
  const constraint = card.constraint || "无字幕无BGM无变形";
  const seconds = card.seconds || "10";
  const frame = card.frame || "16:9";
  if (story.lightingLocked && String(story.lighting || "").trim()) {
    return { lighting: story.lighting, camera, style: card.style || "写实", constraint, seconds, frame };
  }
  const split = splitLighting(card.lighting);
  const source = inferLightSource(story.scene, story.subject) || split.source;
  const lighting = joinLight(source, split.shape, card.lighting);
  const cue = placeCue(story.scene, story.subject);
  const baseStyle = card.style || "写实";
  const style = cue && !baseStyle.includes(cue.slice(0, 2)) ? `${baseStyle}，${cue}` : baseStyle;
  return { lighting, camera, style, constraint, seconds, frame };
}

function peakAction(action) {
  return String(action || "").split(/[，,]/)[0].trim() || action;
}

function isLeaveAction(action) {
  return /遁|离开|走远|离场|只剩/.test(action);
}

function isTalkAction(card, action) {
  const blob = `${card?.name || ""}${JSON.stringify(card?.beats || [])}${action || ""}`;
  return /对白|口播|采访|一问一答|正反打|过肩/.test(blob);
}

function inferEnv(scene, fallback) {
  if (/山道|空山|雾|孤灯/.test(scene)) return "雾贴地，脚下碎石起细土，远处灯焰被风吹歪";
  if (/地铁|车厢/.test(scene)) return "车厢横向微晃，窗外光斑横扫";
  if (/雨巷|青石|油纸/.test(scene)) return "雨丝连续，石板缝积水反光";
  if (/茶馆/.test(scene)) return "座位或桌面有接触，蒸汽可见";
  if (/雨街|霓虹|湿/.test(scene)) return "积水揭起一层水膜，霓虹在水里碎开";
  return fallback || "环境和人有接触";
}

function composeLookLine(f) {
  const bits = [
    `${f.subject}在${f.scene}。正在${f.action}。`,
    `${f.lighting}。`,
    /急推|先藏正脸/.test(f.camera) ? "先不给正脸。" : "",
    `镜头${f.camera}。`,
    /急推/.test(f.camera) ? "眼睛里要有高光。" : "",
    `${f.style}。能看清衣服料子、光的方向和地点质感。`,
  ];
  return bits.filter(Boolean).join("");
}

function composeBeats(card, f) {
  const src = Array.isArray(card?.beats) && card.beats.length ? card.beats : [
    { t: "0-2", role: "起", shot: "中全景·稳定器" },
    { t: "2-5", role: "承", shot: "中景·跟拍" },
    { t: "5-8", role: "转", shot: "近景" },
    { t: "8-10", role: "合", shot: "中景·缓收" },
  ];
  if (isTalkAction(card, f.action)) {
    return src.map((b) => ({
      ...b,
      shot: String(b.shot || "").replace(/\{(\w+)\}/g, (_, k) => f[k] ?? ""),
      text: String(b.text || "").replace(/\{(\w+)\}/g, (_, k) => f[k] ?? ""),
    }));
  }
  const peak = peakAction(f.action);
  const leave = isLeaveAction(f.action);
  const hook = /急推|先藏正脸/.test(f.camera);
  return src.map((b, i) => {
    let text;
    if (i === 0) {
      text = hook
        ? `先不给正脸，只给${f.subject}的衣袖和${f.scene}，${peak}还没做完`
        : `先看清${f.subject}和${f.scene}，${peak}还没做完，衣服料子清楚`;
    } else if (i === 1) {
      text = hook
        ? `0.5秒推到眼睛，开始${f.action}`
        : `${f.action}展开，镜头按${f.camera}走`;
    } else if (i === 2) {
      text = leave ? `${peak}做到最清楚，人影被环境吞掉` : `${peak}做到最清楚的一拍，这是记忆点`;
    } else {
      text = leave ? `${f.scene}还在，人不在了` : `动作收住，停在还能读的一帧，不另加人物`;
    }
    return { ...b, text };
  });
}

function composePhysics(card, f) {
  const src = card?.physics || {};
  const peak = peakAction(f.action);
  let motion = `${peak}一次做完，衣摆因惯性晚半拍`;
  if (src.motion && !/抬头或转脸|帽檐/.test(src.motion)) motion = `${motion}。${src.motion}`;
  return {
    motion,
    env: inferEnv(f.scene, src.env),
    material: src.material && !/帽檐/.test(src.material) ? src.material : "衣服有重量和褶皱，不要塑料光",
    optical: f.lighting,
  };
}

function composeMemory(card, f, userMemory) {
  if (String(userMemory || "").trim()) return String(userMemory).trim();
  const peak = peakAction(f.action);
  if (isLeaveAction(f.action)) return `${peak}最清楚的那一拍`;
  if (card?.memory && !/眼睛|镜头/.test(card.memory)) return String(card.memory).replace(/\{(\w+)\}/g, (_, k) => f[k] ?? "");
  return `${peak}最清楚的那一拍`;
}

export function composeVideoScript(card, story = {}) {
  const shot = composeVideoShot(card, story);
  const subject = String(story.subject || "").trim() || "一个人";
  const action = String(story.action || "").trim() || "做一个清楚的动作";
  const scene = String(story.scene || "").trim() || "一个可辨认的地点";
  const lighting = String(story.lighting || "").trim() || shot.lighting;
  const camera = String(story.camera || "").trim() || shot.camera;
  const style = String(story.style || "").trim() || shot.style;
  const f = { subject, action, scene, lighting, camera, style };
  return {
    ...shot,
    lighting,
    camera,
    style,
    look: composeLookLine(f),
    beats: composeBeats(card, f),
    physics: composePhysics(card, f),
    memory: composeMemory(card, f, story.memory),
  };
}

