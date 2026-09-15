const list = (value) => Array.isArray(value) ? value : [];

export function normalizeBible(input = {}) {
  const normalizeEntry = (item) => {
    if (typeof item === 'string') return { text: item.trim() };
    if (!item || typeof item !== 'object') return null;
    const out = { ...item };
    if (out.id != null) out.id = String(out.id);
    if (out.name != null) out.name = String(out.name);
    return out;
  };
  const entries = key => list(input[key]).map(normalizeEntry).filter(Boolean);
  const style = input.style && typeof input.style === 'object' && !Array.isArray(input.style) ? { ...input.style } : {};
  return {
    characters: entries('characters'),
    locations: entries('locations'),
    props: entries('props'),
    wardrobe: entries('wardrobe'),
    style,
    rules: entries('rules'),
  };
}

function entryText(item) {
  if (!item || typeof item !== 'object') return '';
  const values = Object.entries(item)
    .filter(([key, value]) => key !== 'id' && value != null && String(value).trim())
    .map(([key, value]) => `${key}: ${String(value).trim()}`);
  return values.join('，');
}

function section(label, values) {
  const lines = values.map(entryText).filter(Boolean);
  return lines.length ? `## ${label}\n${lines.map(v => `- ${v}`).join('\n')}` : '';
}

// 对话优先：台词单独成块，**不混进画面描述**。
// 为什么较这个真：`prompt` 会整段发给生成模型。台词写进画面描述，生图模型会试着把字画出来
// （或者把真正的视觉指令稀释掉）；而台词本身是这个故事真正的骨头——
// 一段戏站着不站着，看的是人物说了什么，不是镜头怎么推。
// 所以：文字段落（novel）以对白推进；画面（image）不出现在提示词里；视频（video）作为台词上送。
export function dialogueBlock(beat, kind) {
  const raw = String(beat?.dialogue || '').trim();
  if (!raw) return '';
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 40).map(l => `- ${l}`).join('\n');
  if (!lines) return '';
  if (kind === 'image') return '';
  const head = kind === 'video' ? '## 本段台词（画外/口播，不要当成画面内容去画）' : '## 本段台词（必须按这些台词写成戏，不要改写成旁白）';
  return `${head}\n${lines}`;
}

// 负向提示词（ComfyUI 里 negative 是一等公民，元枢此前完全没有）。
// 这里先落成**提示词块**：任何生图/生视频通道都吃文本，也不会因为某家上游不认
// `negative_prompt` 字段而整单失败。同时编排层还会把它作为 negative 传给图像通道
// （见 story-orchestrator 的 buildRunPlan），两处都看得见。
export function negativeBlock(negative) {
  const text = String(negative || '').trim();
  if (!text) return '';
  const lines = text.split(/[\n；;]+/).map(l => l.trim()).filter(Boolean).slice(0, 20).map(l => `- ${l}`).join('\n');
  return lines ? `## 必须避免\n- 以下内容**不要**出现在这一段的成品里：\n${lines}` : '';
}

export function compileStoryPrompt({ bible, scene, beat, inherited, negative } = {}) {
  const b = normalizeBible(bible);
  const refs = [];
  for (const item of [...(inherited?.referenceIds || []), ...(beat?.references || [])]) {
    const id = typeof item === 'string' ? item : item?.id;
    if (id && !refs.includes(id)) refs.push(id);
  }
  const style = Object.entries(b.style).filter(([, value]) => value != null && String(value).trim()).map(([k, v]) => `${k}: ${String(v).trim()}`).join('，');
  const blocks = [
    '你正在执行元枢连续创作，请严格保持故事状态一致。',
    section('角色', b.characters),
    section('场景资产', b.locations),
    section('道具', b.props),
    section('服装', b.wardrobe),
    style ? `## 视觉与叙事风格\n- ${style}` : '',
    section('连续性规则', b.rules),
    scene?.title ? `## 当前场景\n- 标题: ${scene.title}\n- 摘要: ${scene.summary || '无'}` : '',
    inherited?.prompt ? `## 继承镜头上下文\n${inherited.prompt}` : '',
    beat?.prompt ? `## 当前镜头要求\n${beat.prompt}` : '',
    dialogueBlock(beat, beat?.kind),
    negativeBlock(negative ?? beat?.negative),
    // 素材：别的工作台产出的图/视频/文本被挂到这一段上时，正文里要能看见它们是什么，
    // 否则模型只知道"有素材"，写出来的东西对不上。
    materialBlock(inherited?.materials),
    refs.length ? `## 参考资产\n${refs.map(id => `- ${id}`).join('\n')}` : '',
  ].filter(Boolean);
  return { text: blocks.join('\n\n'), referenceIds: refs };
}

// 挂载素材的文本说明。图/视频只说"有什么"，正文素材直接把内容给模型看（截断）。
export function materialBlock(materials) {
  const list = Array.isArray(materials) ? materials.filter(m => m && (m.text || m.name || m.url)) : [];
  if (!list.length) return '';
  const lines = [];
  for (const m of list) {
    const kind = m.type === 'image' ? '画面' : m.type === 'video' ? '视频' : '文本';
    if (m.type === 'text' && m.text) lines.push(`### 素材（文本）：${m.name || '未命名'}\n${String(m.text).trim().slice(0, 4000)}`);
    else lines.push(`- ${kind}素材：${m.name || m.url}`);
  }
  return `## 本段已挂载素材\n- 这些素材是创作依据，请与之保持一致（人物长相、场景、已发生的事）。\n${lines.join('\n')}`;
}

// 角色定妆照提示词：产出「后续所有镜头可复用的形象参考」，不是一张插画。
// 因此限定单人/正面/中性表情/纯色背景/均匀柔光，并禁止文字与多人。
export function buildPortraitPrompt({ bible, character } = {}) {
  const b = normalizeBible(bible);
  const style = Object.entries(b.style).filter(([, value]) => value != null && String(value).trim()).map(([k, v]) => `${k}: ${String(v).trim()}`).join('，');
  const self = entryText(character);
  const blocks = [
    '生成一张角色定妆照（character sheet）。它的用途是作为后续所有镜头的人物形象参考，因此必须稳定、可复用，而不是一张有情绪有场景的插画。',
    self ? `## 角色设定\n- ${self}` : '',
    style ? `## 统一视觉风格\n- ${style}` : '',
    '## 硬性要求\n- 单人、正面半身、中性表情、纯色背景、均匀柔光，无强投影。\n- 服装与外貌严格按设定，不要自由发挥或美化。\n- 画面里不要出现任何文字、水印、分镜格、多人。',
  ].filter(Boolean);
  return blocks.join('\n\n');
}
