import crypto from 'node:crypto';
import { createProject, listProjects, readProject, writeProject, validateProject, mergeBeatContext } from './story-store.mjs';
import { compileStoryPrompt } from './story-prompts.mjs';
import { createImageAdapter, createNovelAdapter } from './story-adapters.mjs';
import { json } from './http-utils.mjs';

const makeId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

export function negotiateCapabilities(required = {}, supported = {}) {
  const degradation = [];
  const labels = { reference: '参考资产', keyframe: '关键帧', seed: '固定 seed' };
  for (const key of ['reference', 'keyframe', 'seed']) {
    if (required[key] && !supported[key]) degradation.push(`${key}: 当前模型不支持${labels[key]}`);
  }
  return { supported: { reference: !!supported.reference, keyframe: !!supported.keyframe, seed: !!supported.seed }, degradation };
}

export function createGenerationRun(input, clock = {}) {
  const now = (clock.now || nowIso)();
  const kind = ['novel', 'image', 'video'].includes(input?.kind) ? input.kind : 'image';
  const required = { reference: kind !== 'novel', keyframe: kind === 'video', seed: kind !== 'novel' };
  const capabilities = negotiateCapabilities(required, input?.model?.capabilities || {});
  return {
    id: (clock.id || makeId)(),
    projectId: input.projectId,
    sceneId: input.sceneId,
    beatId: input.beatId,
    kind,
    model: { provider: String(input?.model?.provider || ''), id: String(input?.model?.id || '') },
    capabilities: capabilities.supported,
    params: input?.params && typeof input.params === 'object' ? input.params : {},
    seed: Number.isFinite(input?.seed) ? input.seed : undefined,
    inputAssets: Array.isArray(input?.inputAssets) ? input.inputAssets : [],
    outputAssets: [],
    status: 'queued',
    degradation: capabilities.degradation.length ? capabilities.degradation : undefined,
    parentRunId: input?.parentRunId || undefined,
    createdAt: now,
  };
}

export function appendRun(scene, run) {
  if (!Array.isArray(scene.outputs)) scene.outputs = [];
  scene.outputs.push(run);
  scene.activeRunId = run.id;
  return scene;
}

function findScene(project, id) { return (project.scenes || []).find(s => s.id === id); }
function findBeat(scene, id) { return (scene?.beats || []).find(b => b.id === id); }

export function createStoryOrchestrator({ root, clock = {}, adapters = {}, generateImage = null, saveArtifact = null, directChat = null, getDefaultModel = null }) {
  if (!root) throw new Error('story orchestrator 缺少 root');
  const withUpdated = project => ({ ...project, updatedAt: (clock.now || nowIso)() });
  const resolvedAdapters = {
    image: adapters.image || createImageAdapter({ generateImage, saveArtifact }),
    novel: adapters.novel || createNovelAdapter({ directChat }),
    video: adapters.video,
  };
  return {
    list: () => listProjects(root),
    create: async input => { const project = createProject(input, clock); await writeProject(root, project); return project; },
    get: id => readProject(root, id),
    patch: async (id, changes) => {
      const current = await readProject(root, id);
      const next = withUpdated({ ...current, ...changes, bible: changes?.bible ? { ...current.bible, ...changes.bible } : current.bible, scenes: changes?.scenes || current.scenes });
      validateProject(next);
      await writeProject(root, next);
      return next;
    },
    previewRun: async (id, input) => {
      const project = await readProject(root, id);
      const scene = findScene(project, input?.sceneId);
      const beat = findBeat(scene, input?.beatId);
      if (!scene || !beat) throw Object.assign(new Error('sceneId 或 beatId 不存在'), { statusCode: 400 });
      const context = mergeBeatContext(project, scene, beat);
      const run = createGenerationRun({ ...input, projectId: id, sceneId: scene.id, beatId: beat.id, inputAssets: input?.inputAssets || context.referenceIds.map(assetId => ({ id: assetId, role: 'reference' })) }, clock);
      appendRun(scene, run);
      project.updatedAt = (clock.now || nowIso)();
      await writeProject(root, project);
      return { project, run, context };
    },
    runGeneration: async (id, input = {}) => {
      const project = await readProject(root, id);
      const scene = findScene(project, input.sceneId);
      const beat = findBeat(scene, input.beatId);
      if (!scene || !beat) throw Object.assign(new Error('sceneId 或 beatId 不存在'), { statusCode: 400 });
      const kind = ['novel', 'image', 'video'].includes(input.kind) ? input.kind : beat.kind;
      const model = input.model?.id ? input.model : (typeof getDefaultModel === 'function' ? getDefaultModel() : input.model);
      const context = mergeBeatContext(project, scene, beat);
      const compiled = compileStoryPrompt({ bible: project.bible, scene, beat, inherited: context });
      const run = createGenerationRun({ ...input, kind, model, projectId: id, sceneId: scene.id, beatId: beat.id, inputAssets: input.inputAssets || compiled.referenceIds.map(assetId => ({ id: assetId, role: 'reference' })) }, clock);
      run.status = 'running';
      appendRun(scene, run);
      project.updatedAt = (clock.now || nowIso)();
      await writeProject(root, project);
      const adapter = resolvedAdapters[kind];
      if (!adapter?.generate) {
        run.status = 'failed'; run.degradation = [...(run.degradation || []), `${kind}: 当前未接入生成适配器`];
        await writeProject(root, project);
        return { project, run, context: compiled };
      }
      const result = await adapter.generate({ prompt: compiled.text, model, seed: run.seed, params: run.params, references: compiled.referenceIds });
      if (result?.output) run.outputAssets = [{ id: `${run.id}-output`, role: 'output', ...result.output }];
      if (result?.status === 'succeeded') run.status = run.degradation?.length ? 'degraded' : 'succeeded';
      else { run.status = 'failed'; run.degradation = [...(run.degradation || []), result?.error || '生成失败']; }
      run.finishedAt = (clock.now || nowIso)();
      await writeProject(root, project);
      return { project, run, context: compiled };
    },
  };
}

function bodyOrEmpty(body) { return body && typeof body === 'object' ? body : {}; }
function sendError(res, error) { const status = Number(error?.statusCode) || (error?.code === 'ENOENT' ? 404 : 400); return json(res, status, { error: String(error?.message || error) }); }

export async function handleStoryProjects(ctx, res, body) {
  try {
    const api = createStoryOrchestrator(ctx);
    if (body === undefined) return json(res, 200, { projects: await api.list() });
    return json(res, 201, { project: await api.create(bodyOrEmpty(body)) });
  } catch (e) { return sendError(res, e); }
}

export async function handleStoryProject(ctx, res, id) {
  try { return json(res, 200, { project: await createStoryOrchestrator(ctx).get(id) }); } catch (e) { return sendError(res, e); }
}

export async function handleStoryProjectPatch(ctx, res, id, body) {
  try { return json(res, 200, { project: await createStoryOrchestrator(ctx).patch(id, bodyOrEmpty(body)) }); } catch (e) { return sendError(res, e); }
}

export async function handleStoryRunPreview(ctx, res, id, body) {
  try { return json(res, 200, await createStoryOrchestrator(ctx).previewRun(id, bodyOrEmpty(body))); } catch (e) { return sendError(res, e); }
}

export async function handleStoryRun(ctx, res, id, body) {
  try {
    return json(res, 200, await createStoryOrchestrator(ctx).runGeneration(id, bodyOrEmpty(body)));
  } catch (e) { return sendError(res, e); }
}
