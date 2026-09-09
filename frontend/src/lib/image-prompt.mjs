// 人像提示词：可拍的成句，不把五要素顿号串丢给模型
import { IMAGE_SCENES, IMAGE_GRAMMARS, IMAGE_EXAMPLES } from "./image-scenes.mjs";
import { composeImageShot } from "./image-compose.mjs";
export { IMAGE_SCENES, IMAGE_GRAMMARS, IMAGE_EXAMPLES, composeImageShot };
function pick(...vals) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

export function composeImagePrompt(f = {}) {
  const gender = pick(f.gender, "人");
  const age = f.age ? `${f.age}岁` : "";
  const ptype = pick(f.ptype);
  const typeBit = ptype && ptype !== "真人" ? ptype : "写实人像";
  const face = pick(f.face);
  const look = pick(f.look, "面容端正，五官协调");
  const skin = pick(f.skintone);
  const body = [f.height && `${f.height}cm`, f.weight && `${f.weight}kg`, f.body && `${f.body}身形`].filter(Boolean).join("，");
  const expression = pick(f.expression, "自然表情");
  const outfit = pick(f.outfit, "得体的衣服");
  const shot = pick(f.shot, "半身");
  const angle = pick(f.angle, "平视");
  const pose = pick(f.pose, "自然站姿");
  const lighting = pick(f.lighting, "自然光");
  const mood = pick(f.mood);
  const style = pick(f.style, "写实");
  const bg = pick(f.bg, "干净背景");
  const tech = Array.isArray(f.tech) ? f.tech.filter(Boolean).join("，") : pick(f.tech);

  const who = [age && `${age}${gender}`, !age && gender, typeBit, face].filter(Boolean).join("，");
  const sentences = [
    `${who}。${look}${skin ? `，肤色${skin}` : ""}。${body ? `${body}。` : ""}${expression}。`,
    `身着${outfit}。${shot}，${angle}，${pose}。`,
    `背景是${bg}。${lighting}${mood ? `，${mood}氛围` : ""}。${style}。`,
  ];
  if (tech) sentences.push(`${tech}。画面里不要字幕、水印、多余肢体或畸形手指。`);
  else sentences.push("画面里不要字幕、水印、多余肢体或畸形手指。");
  return sentences.join("");
}
