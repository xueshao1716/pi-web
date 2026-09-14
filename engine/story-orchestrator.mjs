import crypto from 'node:crypto';
import { createProject, listProjects, readProject, writeProject, validateProject, mergeBeatContext } from './story-store.mjs';
import { compileStoryPrompt, buildPortraitPrompt } from './story-prompts.mjs';
import { createImageAdapter, createNovelAdapter, createVideoAdapter } from './story-adapters.mjs';
import { buildStoryAssistPrompt, parseStoryAssist } from './story-assist.mjs';
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

// 出场角色 → 定妆照 URL。规则刻意保持可解释，不做玄学推断：
// 1) 角色名出现在编译后的提示词里 → 视为出场（compileStoryPrompt 会把每个角色的 name 写进提示词）；
// 2) 一个都没匹配上时，退回首张有定妆照的角色（通常是主角），最多 limit 张。
// 这张图会成为真实的图生图/视频 reference 输入，而不是只把 id 拼进提示词。
export function pickReferenceImages(project, promptText, limit = 2) {
  const chars = (project?.bible?.characters || []).filter(c => c && (c.refImage || c.ref));
  if (!chars.length) return [];
  const text = String(promptText || '');
  const mentioned = chars.filter(c => c.name && text.includes(String(c.name)));
  return (mentioned.length ? mentioned : chars).slice(0, limit).map(c => String(c.refImage || c.ref)).filter(Boolean);
}

function findScene(project, id) { return (project.scenes || []).find(s => s.id === id); }
function findBeat(scene, id) { return (scene?.beats || []).find(b => b.id === id); }

function pickCapableModel(models, kind) {
  const hits = (models || []).filter(m => m?.capabilities?.[kind] || (kind === 'novel' && m?.capabilities?.chat));
  const rank = m => { const id = String(m?.id || '').toLowerCase(); if (/3\.|latest|pro/.test(id)) return 0; if (/2\.5/.test(id)) return 1; if (/2\.1/.test(id)) return 2; if (/2\.0/.test(id)) return 3; return 4; };
  return hits.sort((a, b) => rank(a) - rank(b))[0] || null;
}

export function createStoryOrchestrator({ root, clock = {}, adapters = {}, generateImage = null, generateVideo = null, saveArtifact = null, directChat = null, getDefaultModel = null, getModelList = null }) {
  if (!root) throw new Error('story orchestrator 缺少 root');
  const withUpdated = project => ({ ...project, updatedAt: (clock.now || nowIso)() });
  const resolveModel = (explicit, kind, fallback) => {
    const isExplicit = explicit?.id && explicit.id !== 'auto' && explicit.provider !== 'auto';
    const candidates = typeof getModelList === 'function' ? getModelList() : [];
    return (isExplicit ? explicit : null) || pickCapableModel(candidates, kind) || (typeof getDefaultModel === 'function' ? getDefaultModel() : fallback);
  };
  const resolvedAdapters = {
    image: adapters.image || createImageAdapter({ generateImage, saveArtifact }),
    novel: adapters.novel || createNovelAdapter({ directChat }),
    video: adapters.video || createVideoAdapter({ generateVideo, saveArtifact }),
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
      const compiled = compileStoryPrompt({ bible: project.bible, scene, beat, inherited: context });
      return { project, run, context: { ...compiled, prompt: compiled.text } };
    },
    runGeneration: async (id, input = {}) => {
      const project = await readProject(root, id);
      const scene = findScene(project, input.sceneId);
      const beat = findBeat(scene, input.beatId);
      if (!scene || !beat) throw Object.assign(new Error('sceneId 或 beatId 不存在'), { statusCode: 400 });
      const kind = ['novel', 'image', 'video'].includes(input.kind) ? input.kind : beat.kind;
      const model = resolveModel(input.model, kind, input.model);
      const context = mergeBeatContext(project, scene, beat);
      const compiled = compileStoryPrompt({ bible: project.bible, scene, beat, inherited: context });
      const run = createGenerationRun({ ...input, kind, model, projectId: id, sceneId: scene.id, beatId: beat.id, inputAssets: input.inputAssets || compiled.referenceIds.map(assetId => ({ id: assetId, role: 'reference' })) }, clock);
      // 参考图只在模型声明支持时注入：不支持的模型塞图会 400，反而掩盖真实的降级原因。
      const referenceImages = run.capabilities.reference ? pickReferenceImages(project, compiled.text) : [];
      if (referenceImages.length) run.referenceImages = referenceImages;
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
      let result;
      try { result = await adapter.generate({ prompt: compiled.text, model, seed: run.seed, params: run.params, references: compiled.referenceIds, referenceImages }); }
      catch (error) { result = { status: 'failed', error: String(error?.message || error).slice(0, 300) }; }
      if (result?.output) run.outputAssets = [{ id: `${run.id}-output`, role: 'output', ...result.output }];
      if (result?.status === 'succeeded') run.status = run.degradation?.length ? 'degraded' : 'succeeded';
      else { run.status = 'failed'; run.degradation = [...(run.degradation || []), result?.error || '生成失败']; }
      run.finishedAt = (clock.now || nowIso)();
      await writeProject(root, project);
      return { project, run, context: compiled };
    },
    // 角色定妆照：按角色设定出一张可复用的形象参考图，写回 bible.characters[].refImage。
    // 这张图随后会被 runGeneration 当成真实参考图注入（图像走图生图、视频走 reference 模式），
    // 这是"锁定人物外貌"的入口——在此之前 story 层只有文字描述，产品自己也在界面上承认做不到。
    generatePortrait: async (id, input = {}) => {
      const project = await readProject(root, id);
      const characters = Array.isArray(project.bible?.characters) ? project.bible.characters : [];
      if (!characters.length) throw Object.assign(new Error('这个故事还没有角色：先让 AI 补一段设定，或到下方设定里加一个角色'), { statusCode: 400 });
      const character = characters.find(c => String(c?.id) === String(input.characterId)) || characters[0];
      const adapter = resolvedAdapters.image;
      if (!adapter?.generate) throw Object.assign(new Error('图像引擎未接入'), { statusCode: 503 });
      const model = resolveModel(input.model, 'image', null);
      const result = await adapter.generate({ prompt: buildPortraitPrompt({ bible: project.bible, character }), model, params: { size: input.size } });
      const url = result?.output?.url;
      if (!url) return { project, character, status: 'failed', error: result?.error || '定妆照生成失败', model: result?.model };
      const next = withUpdated({
        ...project,
        bible: { ...project.bible, characters: characters.map(c => (c === character ? { ...c, refImage: url } : c)) },
      });
      validateProject(next);
      await writeProject(root, next);
      return { project: next, character: { ...character, refImage: url }, image: url, status: result.status, model: result.model };
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

export async function handleStoryPortrait(ctx, res, id, body) {
  try {
    return json(res, 200, await createStoryOrchestrator(ctx).generatePortrait(id, bodyOrEmpty(body)));
  } catch (e) { return sendError(res, e); }
}

export async function handleStoryAssist(ctx, res, id, body) {  try {
    if (typeof ctx.directChat !== 'function' || typeof ctx.getDefaultModel !== 'function') throw Object.assign(new Error('智能填充引擎未接入'), { statusCode: 503 });
    const project = await readProject(ctx.root, id);
    const idea = String(bodyOrEmpty(body).idea || '').trim().slice(0, 2000);
    if (!idea) throw Object.assign(new Error('请输入想补充的故事想法'), { statusCode: 400 });
    const requested = body?.model?.id && body.model.id !== 'auto' ? body.model : null;
    const available = typeof ctx.getModelList === 'function' ? ctx.getModelList() : [];
    const fast = available.find(m => m?.capabilities?.chat && !m.reasoning && /agnes-3\.0-flash/i.test(m.id))
      || available.find(m => m?.capabilities?.chat && !m.reasoning)
      || ctx.getDefaultModel();
    const candidates = [requested, fast, ctx.getDefaultModel()].filter((m, i, all) => m?.id && all.findIndex(x => x?.provider === m.provider && x?.id === m.id) === i);
    let lastError = '智能填充模型没有返回内容';
    for (const model of candidates.slice(0, 2)) {
      try {
        const result = await ctx.directChat(model, buildStoryAssistPrompt({ title: project.title, logline: project.logline, idea, current: project.bible }), [], { maxTokens: 2200, timeout: 40000 });
        if (!result?.text) { lastError = `${model.provider}/${model.id} 没有返回内容`; continue; }
        try { return json(res, 200, { assist: parseStoryAssist(result.text), model: { provider: model.provider || '', id: model.id || '' } }); }
        catch (error) { lastError = String(error?.message || error); }
      } catch (error) { lastError = String(error?.message || error); }
    }
    throw new Error(lastError);
  } catch (e) { return sendError(res, e); }
}
