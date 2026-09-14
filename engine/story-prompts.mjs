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

export function compileStoryPrompt({ bible, scene, beat, inherited } = {}) {
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
    refs.length ? `## 参考资产\n${refs.map(id => `- ${id}`).join('\n')}` : '',
  ].filter(Boolean);
  return { text: blocks.join('\n\n'), referenceIds: refs };
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
