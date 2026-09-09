// 视频工坊提示词：镜头卡成稿。格子是摘要，标准档不再复印万能公式。
import { VIDEO_SCENES, VIDEO_GRAMMARS, VIDEO_EXAMPLES } from "./video-scenes.mjs";
import { composeVideoShot, composeVideoScript } from "./video-compose.mjs";
export { VIDEO_SCENES, VIDEO_GRAMMARS, VIDEO_EXAMPLES, composeVideoShot, composeVideoScript };

function interpolate(tpl, fields) {
  return String(tpl || "").replace(/\{(\w+)\}/g, (_, k) => fields[k] ?? "");
}

function pick(...vals) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function fillBeats(beats, fields) {
  if (typeof beats === "string") return interpolate(beats, fields);
  return (beats || []).map((b) => ({
    ...b,
    shot: interpolate(b.shot, fields),
    text: interpolate(b.text, fields),
  }));
}

function formatBeats(beats) {
  if (typeof beats === "string") return beats;
  return (beats || []).map((b) => `[${b.t}秒 ${b.role}] ${b.shot} | ${b.text}`).join("\n");
}

function formatPhysics(physics) {
  if (!physics) return "";
  return [
    `- 主体运动：${physics.motion}`,
    `- 环境交互：${physics.env}`,
    `- 材质：${physics.material}`,
    `- 光学：${physics.optical}`,
  ].join("\n");
}

function composeLook(card, fields) {
  if (card?.lookHint) return interpolate(card.lookHint, fields);
  if (card?.look) {
    let look = card.look;
    if (fields.subject && card.subject && fields.subject !== card.subject) {
      look = look.replaceAll(card.subject, fields.subject);
    }
    return look;
  }
  return `${fields.subject}在${fields.scene}${fields.action}。${fields.lighting}。镜头${fields.camera}。${fields.style}。能看清衣服料子、光的方向和地点质感。`;
}

function storyLocked(card) {
  if (!card) return false;
  return ["subject", "action", "scene"].some((k) => String(card[k] || "").trim());
}

function storyChanged(card, input) {
  if (!storyLocked(card)) return false;
  return ["subject", "action", "scene"].some((k) => {
    const v = String(input[k] ?? "").trim();
    return v && v !== String(card[k] || "").trim();
  });
}

export function buildVideoPrompt(input = {}) {
  const card = input.card || VIDEO_SCENES[input.sceneKey] || null;
  const changed = storyChanged(card, input);
  const subject = pick(input.subject, card?.subject, "一个人");
  const action = pick(input.action, card?.action, "做一个清楚的动作");
  const scene = pick(input.scene, card?.scene, "一个可辨认的地点");
  const lightingLocked = Boolean(String(input.lighting ?? "").trim());
  const script = composeVideoScript(card, {
    subject, action, scene, lighting: input.lighting, camera: input.camera, style: input.style,
    lightingLocked, memory: input.memory,
  });
  const fields = {
    subject,
    action,
    scene,
    lighting: lightingLocked ? pick(input.lighting) : pick(script.lighting, card?.lighting, "自然光"),
    camera: pick(input.camera, script.camera, card?.camera, "固定机位"),
    style: pick(input.style, script.style, card?.style, "写实"),
  };
  const quality = pick(input.quality, card?.quality, "720P 清晰");
  const constraint = pick(input.constraint, card?.constraint, "无字幕无BGM无变形");
  const seconds = pick(input.seconds, card?.seconds, "10");
  const frame = pick(input.frame, card?.frame, "16:9");
  const keepExample = storyLocked(card) && !changed;
  const memoryUser = pick(input.memory);
  const memoryStale = changed && (!memoryUser || memoryUser === card?.memory);
  const memory = memoryStale
    ? script.memory
    : pick(memoryUser, keepExample ? card?.memory : script.memory, script.memory);
  const look = keepExample ? composeLook(card, fields) : script.look;
  const rawBeats = pick(input.beats) || (keepExample ? (card?.beats || script.beats) : script.beats);
  const beats = fillBeats(rawBeats, fields);
  const physics = keepExample ? card?.physics : script.physics;

  if (input.richness === "lite") {
    return `${look} ${fields.action}。${fields.lighting}。镜头${fields.camera}。核心记忆点：${memory}。${constraint}。时长${seconds}秒，画幅${frame}，${quality}。`;
  }

  const lines = [
    `【总览】${look}`,
    `【记忆点】${memory}`,
    `【时间轴】\n${formatBeats(beats)}`,
  ];
  const phys = formatPhysics(physics);
  if (phys) lines.push(`【物理】\n${phys}`);
  lines.push(`【锁定】${constraint}；身份与服装不漂移；一次一个主要运镜。`);
  lines.push(`【规格】时长${seconds}秒，画幅${frame}，${quality}。`);
  return lines.join("\n");
}
