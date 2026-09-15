import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const BIBLE = () => ({ characters: [], locations: [], props: [], wardrobe: [], style: {}, rules: [] });
const makeId = () => crypto.randomUUID();

export function createProject(input = {}, clock = {}) {
  const now = (clock.now || (() => new Date().toISOString()))();
  return {
    id: (clock.id || makeId)(),
    title: String(input.title || '未命名故事').trim() || '未命名故事',
    logline: input.logline ? String(input.logline) : '',
    bible: { ...BIBLE(), ...(input.bible || {}) },
    scenes: Array.isArray(input.scenes) ? input.scenes : [],
    // 成片历史。assembleFilm 之前只把文件存进产物库就返回，项目里没有任何记录——
    // 刷新页面后「成片」链接就丢了，用户以为合成失败。产物是历史，必须落回项目。
    films: Array.isArray(input.films) ? input.films : [],
    activeSceneId: input.activeSceneId,
    createdAt: now,
    updatedAt: now,
  };
}

export function validateProject(project) {
  if (!project || typeof project !== 'object') throw new Error('项目必须是对象');
  if (!project.id || !String(project.title || '').trim()) throw new Error('项目缺少 id 或 title');
  const scenes = Array.isArray(project.scenes) ? project.scenes : [];
  const sceneIds = new Set();
  const indexes = new Set();
  const beatIds = new Set();
  for (const scene of scenes) {
    if (!scene?.id) throw new Error('镜头缺少 id');
    if (sceneIds.has(scene.id)) throw new Error('镜头 id 重复');
    sceneIds.add(scene.id);
    if (scene.index != null) {
      if (indexes.has(scene.index)) throw new Error('scene index 重复');
      indexes.add(scene.index);
    }
    for (const beat of (Array.isArray(scene.beats) ? scene.beats : [])) {
      if (!beat?.id) throw new Error('beat 缺少 id');
      if (beatIds.has(beat.id)) throw new Error('beat id 重复');
      beatIds.add(beat.id);
    }
  }
  // 继承链校验：2026-09-14 起允许**跨场景**继承。
  // 原先只在本场景内查 id，于是"一键分镜"产出的多场景分镜（第 2 场第 1 段承接第 1 场末段）
  // 会被校验直接拒掉。跨场景续写本来就该成立，这里按全项目收集。
  const allBeatIds = new Set();
  for (const scene of scenes) for (const beat of (Array.isArray(scene.beats) ? scene.beats : [])) {
    if (beat?.id) allBeatIds.add(beat.id);
  }
  for (const scene of scenes) {
    for (const beat of (scene.beats || [])) {
      if (beat.inheritFromBeatId && !allBeatIds.has(beat.inheritFromBeatId)) throw new Error(`继承 beat 不存在: ${beat.inheritFromBeatId}`);
    }
  }
  return project;
}

function findBeat(scene, id) {
  return (scene.beats || []).find(b => b.id === id);
}

// 跨场景解析：先在本场景找，再在全项目找。返回 { beat, scene } 以便读对 owning scene 的产出。
export function findBeatAnywhere(project, scene, id) {
  const inScene = findBeat(scene, id);
  if (inScene) return { beat: inScene, scene };
  for (const other of (project?.scenes || [])) {
    const hit = findBeat(other, id);
    if (hit) return { beat: hit, scene: other };
  }
  return null;
}

// 挂载素材的形状（beat.inputs）。别的工作台产出的图/视频/文本挂到某一段上时用这个结构。
// 刻意和 `references`（指向 bible 实体的 id）分开：references 靠名字/id 去设定里查，
// inputs 是**已经存在的成品文件**，自带地址，不需要在设定里登记。
// 文本素材把内容直接存在这里（选材时截断到 4000 字）：项目因此是自足的，
// 素材源文件被移走/删掉也不影响已经挂好的这一段。
export const INPUT_TYPES = ['image', 'video', 'text'];
export function normalizeBeatInputs(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    const type = INPUT_TYPES.includes(item.type) ? item.type : '';
    if (!type) continue;
    const url = String(item.url || '').trim();
    const text = String(item.text || '').trim().slice(0, 4000);
    if (type !== 'text' && !url) continue;
    if (type === 'text' && !text) continue;
    out.push({
      id: String(item.id || `in-${out.length + 1}`),
      type,
      name: String(item.name || '').trim().slice(0, 200),
      ...(url ? { url } : {}),
      ...(text ? { text } : {}),
      ...(item.path ? { path: String(item.path).trim().slice(0, 400) } : {}),
    });
  }
  return out;
}

export function mergeBeatContext(project, scene, beat) {
  const prompts = [];
  const references = [];
  const materials = [];
  const visited = new Set();
  const previousOutputs = [];
  let current = beat;
  while (current) {
    if (visited.has(current.id)) throw new Error('beat 继承链存在循环');
    visited.add(current.id);
    if (current.prompt) prompts.unshift(String(current.prompt).trim());
    if (current.id !== beat.id) {
      // 产出存在 owning scene 上：跨场景续写时前文在别的场景里，必须按 owning scene 找。
      const output = [...(current.scene?.outputs || scene.outputs || [])].reverse().find(run => run.beatId === current.id && ['succeeded', 'degraded'].includes(run.status) && run.outputAssets?.length);
      const prose = output?.outputAssets.filter(asset => asset.type === 'text' && asset.text).map(asset => asset.text).join('\n');
      if (prose) previousOutputs.unshift(prose.slice(-12000));
    }
    // 挂载素材同样沿继承链累积：续写要看得见上一段挂的素材，否则"承接"只是接了个句子，
    // 画面和人物的依据在下一段就断了。
    // 顺序与 referenceIds 保持一致（先祖先后自己）：unshift 传数组会把整组放到最前，
    // 组内顺序仍是各自 beat 里的顺序。
    const own = normalizeBeatInputs(current.inputs).filter(input => !materials.some(m => `${m.type}:${m.url || m.name}` === `${input.type}:${input.url || input.name}`));
    if (own.length) materials.unshift(...own);
    for (const ref of (current.references || [])) {
      const id = typeof ref === 'string' ? ref : ref?.id;
      if (id && !references.includes(id)) references.unshift(id);
    }
    if (!current.inheritFromBeatId) break;
    const next = findBeatAnywhere(project, scene, current.inheritFromBeatId);
    if (!next) break;
    // 把 owning scene 挂在节点上，下一轮读产出时用得到。
    current = { ...next.beat, scene: next.scene };
  }
  return { prompt: [...prompts.filter(Boolean), ...(previousOutputs.length ? ['## 已生成前文（承接结尾，推进新情节，不重复开场）', ...previousOutputs.slice(-3)] : [])].join('\n'), referenceIds: references, materials, bible: project?.bible || BIBLE() };
}

function projectRoot(root) { return path.join(root, 'story-projects'); }
function projectPath(root, id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('非法项目 id');
  return path.join(projectRoot(root), `${id}.json`);
}

export async function writeProject(root, project) {
  validateProject(project);
  const dir = projectRoot(root);
  await fs.mkdir(dir, { recursive: true });
  const file = projectPath(root, project.id);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(project, null, 2), 'utf8');
  await fs.rename(tmp, file);
  return project;
}

export async function readProject(root, id) {
  const raw = await fs.readFile(projectPath(root, id), 'utf8');
  return validateProject(JSON.parse(raw));
}

export async function listProjects(root) {
  const dir = projectRoot(root);
  let names = [];
  try { names = await fs.readdir(dir); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const out = [];
  for (const name of names.filter(n => n.endsWith('.json'))) {
    try { out.push(await readProject(root, name.slice(0, -5))); } catch { /* ignore corrupt entries in list */ }
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
