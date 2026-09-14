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

// 设定块清洗：assist（补一段）与 storyboard（一键分镜）共用，避免两处形状判断漂移。
export function cleanBible(source) {
  const src = source && typeof source === 'object' ? source : {};
  const list = key => Array.isArray(src[key]) ? src[key].map(cleanEntry).filter(Boolean).slice(0, 30) : [];
  const style = src.style && typeof src.style === 'object' ? Object.fromEntries(Object.entries(src.style).slice(0, 12).map(([k, v]) => [String(k), String(v).trim()]).filter(([, v]) => v)) : {};
  return { characters: list('characters'), locations: list('locations'), props: list('props'), wardrobe: list('wardrobe'), style, rules: list('rules') };
}

export function parseStoryAssist(raw) {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('智能填充返回的内容不是有效 JSON'); }
  const scene = parsed.scene && typeof parsed.scene === 'object' ? { title: String(parsed.scene.title || '').trim(), summary: String(parsed.scene.summary || '').trim() } : {};
  const beat = parsed.beat && typeof parsed.beat === 'object' ? { kind: ['novel', 'image', 'video'].includes(parsed.beat.kind) ? parsed.beat.kind : 'image', prompt: String(parsed.beat.prompt || '').trim() } : {};
  return { ...cleanBible(parsed), scene, beat };
}

// ── 一键分镜：从梗概一次生成整场分镜表（多段），而不是只给一段 ──
// 之前 assist 只产出 1 个 beat，用户得一段一段点「从此处继续」。
// 2026-09-14：分镜同时登记设定（characters/locations/props/wardrobe）。
// 只出段落不建角色库的话，「定妆照」和「参考图锁定」都拿不到数据——功能在界面上存在却用不了。
export function buildStoryboardPrompt({ title = '', logline = '', idea = '', current = {}, count = 6 } = {}) {
  const n = Math.max(2, Math.min(12, Number(count) || 6));
  return `你是元枢连续创作的**分镜师**。请把故事拆成 ${n} 段可直接生成的分镜，并登记其中出现的人物与场景。

项目：${String(title).trim() || '未命名故事'}
梗概：${String(logline).trim() || '暂无'}
用户想法：${String(idea).trim() || '请补齐一个可拍摄的开场'}
已有设定：${JSON.stringify(current).slice(0, 4000)}

要求：
1. 每段都要是**可执行的生成指令**（写清动作、构图、镜头、光线），不要写文学评论。
2. 段与段之间必须接得上：第 2 段起承接上一段结尾，推进新事件，不重复开场。
3. kind 只能是 novel（文字段落）/ image（画面）/ video（视频片段）；整场同一种 kind 更连贯。
4. bible 里登记**本片真正出场**的人物与场景：characters 的 appearance 要写清年龄、体型、发型、服装、辨识特征（供后续生成定妆照锁定长相）；已在「已有设定」里的角色按原名原样重复一遍，不要改名，也不要凭空新增没出场的角色。
5. 段落提示词里要**写出角色姓名**，后续靠姓名把定妆照挂到对应段落上。

只返回 JSON，不要 Markdown：
{"bible":{"characters":[{"name":"","appearance":""}],"locations":[{"name":"","description":""}],"props":[{"name":"","description":""}],"style":{"visual":"","tone":""}},"scenes":[{"title":"","summary":"","beats":[{"kind":"video","prompt":""}]}]}`;
}

// 收集文本里**所有**配平的 JSON 对象。
// 只取第一个是不够的：模型常常先复述一段上下文（例如我提示词里的「已有设定」JSON），
// 再给答案；取第一个就会把复述当成结果（2026-09-14 真实调用即踩到，
// 报出来的顶层键正是设定形状 characters/locations/props/…）。
export function extractJsonObjects(raw) {
  const s = String(raw || '');
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{') continue;
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < s.length; j++) {
      const ch = s[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        // 只有配平到 0 才算一个完整对象；之前把 break 写在了这个分支里，
        // 于是遇到第一个嵌套 } 就跳出，外层对象永远抓不到（2026-09-14 自测抓到）。
        if (depth === 0) {
          try { out.push(JSON.parse(s.slice(i, j + 1))); } catch { /* 不完整就跳过 */ }
          i = j;
          break;
        }
      }
    }
  }
  return out;
}

export function extractJsonObject(raw) {
  return extractJsonObjects(raw)[0] || null;
}

// 真实模型不照理想形状出牌：可能包一层 storyboard/data/result、scenes 给成对象而不是数组、
// 段落提示词叫 content/description/shot 而不是 prompt。这里全部宽容处理，
// 因为「解析不出来」对用户来说就是功能不可用（2026-09-14 首次真实调用即踩到）。
const BEAT_KEYS = ['beats', 'shots', 'segments'];
const PROMPT_KEYS = ['prompt', 'content', 'description', 'text', 'shot', 'action'];
const KIND_HINT = [[/video|视频|镜头运动|运镜/i, 'video'], [/image|画面|分镜图|静帧/i, 'image']];

function firstString(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return '';
}

const cleanBeat = (item) => {
  if (typeof item === 'string') return item.trim() ? { kind: 'image', prompt: item.trim() } : null;
  if (!item || typeof item !== 'object') return null;
  const prompt = firstString(item, PROMPT_KEYS);
  if (!prompt) return null;
  let kind = ['novel', 'image', 'video'].includes(item.kind) ? item.kind
    : ['novel', 'image', 'video'].includes(item.type) ? item.type : '';
  if (!kind) {
    const hit = KIND_HINT.find(([re]) => re.test(String(item.kind || item.type || '')));
    kind = hit ? hit[1] : 'image';
  }
  return { kind, prompt };
};

function beatsOf(scene) {
  for (const key of BEAT_KEYS) {
    const value = scene?.[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

export function parseStoryboard(raw) {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const candidates = [];
  try { candidates.push(JSON.parse(text)); } catch { /* 落到逐个抠对象 */ }
  candidates.push(...extractJsonObjects(text));
  if (!candidates.length) {
    throw new Error(`分镜返回的内容不是有效 JSON（开头：${text.slice(0, 80) || '(空)'}）`);
  }
  const seen = new Set();
  const failures = [];
  // 逐个候选试：取第一个真能解析出段落的（模型可能先复述上下文再给答案）
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) continue;
    seen.add(candidate);
    const root = candidate.storyboard || candidate.data || candidate.result || candidate;
    let scenes = root.scenes ?? root.shots ?? root.episodes ?? root;
    if (!Array.isArray(scenes)) scenes = [scenes];
    const out = scenes
      .map(scene => ({
        title: firstString(scene, ['title', 'name']),
        summary: firstString(scene, ['summary', 'description', 'synopsis']),
        beats: beatsOf(scene).map(cleanBeat).filter(Boolean),
      }))
      .filter(scene => scene.beats.length)
      .slice(0, 12);
    const beatCount = out.reduce((n, scene) => n + scene.beats.length, 0);
    if (beatCount) return { scenes: out, beatCount, bible: cleanBible(candidate.bible || root.bible) };
    failures.push(Object.keys(candidate).slice(0, 8).join('/') || '无键');
  }
  throw new Error(`分镜里没有任何可生成的段落（试过 ${candidates.length} 个 JSON，顶层键：${failures.join(' | ').slice(0, 120)}；原文开头：${text.slice(0, 120)}）`);
}
