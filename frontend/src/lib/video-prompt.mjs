// 视频工坊提示词：镜头卡成稿。格子是摘要，标准档不再复印万能公式。
import { VIDEO_SCENES } from "./video-scenes.mjs";
export { VIDEO_SCENES };

function pick(...vals) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function defaultBeats({ subject, action, scene, camera }) {
  return [
    { t: "0-2", role: "起", shot: "中全景·第三人称·稳定器", text: `${subject}先出现在${scene}，看清衣服和地点，动作还没做完` },
    { t: "2-5", role: "承", shot: "中景·第三人称·跟拍", text: `开始${action}，${camera}跟着走，只推进不收` },
    { t: "5-8", role: "转", shot: "近景·第三人称·慢动作", text: `${action}到最清楚的一拍，这是记忆点` },
    { t: "8-10", role: "合", shot: "中景·第三人称·缓动定格", text: `动作收住，停在还能读的一帧，不另加人物` },
  ];
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
  if (card?.look) {
    let look = card.look;
    if (fields.subject && card.subject && fields.subject !== card.subject) {
      look = look.replaceAll(card.subject, fields.subject);
    }
    return look;
  }
  return `${fields.subject}站在${fields.scene}。${fields.lighting}。他/她正在${fields.action}。镜头${fields.camera}。${fields.style}。`;
}

export function buildVideoPrompt(input = {}) {
  const card = input.card || VIDEO_SCENES[input.sceneKey] || null;
  const fields = {
    subject: pick(input.subject, card?.subject, "一个人"),
    action: pick(input.action, card?.action, "做一个清楚的动作"),
    scene: pick(input.scene, card?.scene, "一个可辨认的地点"),
    lighting: pick(input.lighting, card?.lighting, "自然光"),
    camera: pick(input.camera, card?.camera, "固定机位"),
    style: pick(input.style, card?.style, "写实"),
  };
  const quality = pick(input.quality, card?.quality, "720P 清晰");
  const constraint = pick(input.constraint, card?.constraint, "无字幕无BGM无变形");
  const seconds = pick(input.seconds, card?.seconds, "10");
  const frame = pick(input.frame, card?.frame, "16:9");
  const memory = pick(input.memory, card?.memory, `${fields.action}最清楚的那一拍`);
  const look = composeLook(card, fields);
  const beats = pick(input.beats) || card?.beats || defaultBeats(fields);
  const physics = card?.physics;

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
