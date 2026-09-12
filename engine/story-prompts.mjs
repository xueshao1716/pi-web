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
