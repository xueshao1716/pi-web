export function buildStoryAssistPrompt({ title = '', logline = '', idea = '', current = {} } = {}) {
  return `你是元枢连续创作的故事设定助手。请根据用户想法生成一份“可编辑草稿”，由人类确认后才会保存。不要改写既有设定，只补充空缺。\n\n项目：${String(title).trim() || '未命名故事'}\n梗概：${String(logline).trim() || '暂无'}\n用户想法：${String(idea).trim() || '请补齐一个可拍摄的开端'}\n已有状态：${JSON.stringify(current).slice(0, 5000)}\n\n只返回 JSON，不要 Markdown：{"characters":[{"name":"","appearance":""}],"locations":[{"name":"","description":""}],"props":[{"name":"","description":""}],"wardrobe":[{"name":"","description":""}],"style":{"visual":"","tone":""},"rules":[{"text":""}],"scene":{"title":"","summary":""},"beat":{"kind":"image","prompt":""}}。内容要具体、可执行；kind 只能是 novel/image/video。`;
}

function cleanEntry(item) {
  if (!item || typeof item !== 'object') return null;
  const allowed = ['id', 'name', 'text', 'appearance', 'description'];
  const out = {};
  for (const key of allowed) if (item[key] != null && String(item[key]).trim()) out[key] = String(item[key]).trim();
  return Object.keys(out).length ? out : null;
}

export function parseStoryAssist(raw) {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('智能填充返回的内容不是有效 JSON'); }
  const list = key => Array.isArray(parsed[key]) ? parsed[key].map(cleanEntry).filter(Boolean).slice(0, 30) : [];
  const style = parsed.style && typeof parsed.style === 'object' ? Object.fromEntries(Object.entries(parsed.style).slice(0, 12).map(([k, v]) => [String(k), String(v).trim()]).filter(([, v]) => v)) : {};
  const scene = parsed.scene && typeof parsed.scene === 'object' ? { title: String(parsed.scene.title || '').trim(), summary: String(parsed.scene.summary || '').trim() } : {};
  const beat = parsed.beat && typeof parsed.beat === 'object' ? { kind: ['novel', 'image', 'video'].includes(parsed.beat.kind) ? parsed.beat.kind : 'image', prompt: String(parsed.beat.prompt || '').trim() } : {};
  return { characters: list('characters'), locations: list('locations'), props: list('props'), wardrobe: list('wardrobe'), style, rules: list('rules'), scene, beat };
}
