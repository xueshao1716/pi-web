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
  for (const scene of scenes) {
    const ids = new Set((scene.beats || []).map(b => b.id));
    for (const beat of (scene.beats || [])) {
      if (beat.inheritFromBeatId && !ids.has(beat.inheritFromBeatId)) throw new Error(`继承 beat 不存在: ${beat.inheritFromBeatId}`);
    }
  }
  return project;
}

function findBeat(scene, id) {
  return (scene.beats || []).find(b => b.id === id);
}

export function mergeBeatContext(project, scene, beat) {
  const prompts = [];
  const references = [];
  const visited = new Set();
  let current = beat;
  while (current) {
    if (visited.has(current.id)) throw new Error('beat 继承链存在循环');
    visited.add(current.id);
    if (current.prompt) prompts.unshift(String(current.prompt).trim());
    for (const ref of (current.references || [])) {
      const id = typeof ref === 'string' ? ref : ref?.id;
      if (id && !references.includes(id)) references.unshift(id);
    }
    current = current.inheritFromBeatId ? findBeat(scene, current.inheritFromBeatId) : null;
  }
  return { prompt: prompts.filter(Boolean).join('\n'), referenceIds: references, bible: project?.bible || BIBLE() };
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
