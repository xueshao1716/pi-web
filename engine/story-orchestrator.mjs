import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProject, listProjects, readProject, writeProject, validateProject, mergeBeatContext } from './story-store.mjs';
import { compileStoryPrompt, buildPortraitPrompt } from './story-prompts.mjs';
import { createImageAdapter, createNovelAdapter, createVideoAdapter } from './story-adapters.mjs';
import { buildStoryAssistPrompt, parseStoryAssist, buildStoryboardPrompt, parseStoryboard } from './story-assist.mjs';
import { lintStoryProject } from './story-lint.mjs';
import { collectFilmClips, concatClips } from './story-film.mjs';
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
    // 段号在**生成时刻**定下来。作品列表原先按当前分镜顺序现算，一旦重排分镜，
    // 旧产物卡上的"第 N 段"就跟着变——产物是历史，不该被后来的重排改写。
    beatNo: Number.isFinite(input?.beatNo) ? input.beatNo : undefined,
    sceneTitle: input?.sceneTitle ? String(input.sceneTitle) : undefined,
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

const BIBLE_LISTS = { characters: 'char', locations: 'loc', props: 'prop', wardrobe: 'ward' };

// 把分镜登记的人物/场景并进设定：**只补空缺，不改写已登记的实体**（与智能填充同一约定）。
// 名字相同（忽略大小写与空白）就算同一个，否则每次分镜都会堆出一串重复角色。
export function mergeStoryboardBible(bible, incoming) {
  const base = { characters: [], locations: [], props: [], wardrobe: [], style: {}, rules: [], ...(bible || {}) };
  const norm = value => String(value || '').trim().toLowerCase();
  const next = { ...base };
  for (const [key, prefix] of Object.entries(BIBLE_LISTS)) {
    const existing = Array.isArray(base[key]) ? [...base[key]] : [];
    const seen = new Set(existing.map(item => norm(item?.name || item?.text)));
    for (const item of (Array.isArray(incoming?.[key]) ? incoming[key] : [])) {
      const name = norm(item?.name || item?.text);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      existing.push({ id: `${prefix}-${makeId()}`, ...item });
    }
    next[key] = existing;
  }
  // 已有风格优先：分镜不该把人工调好的视觉基调冲掉。
  next.style = { ...(incoming?.style || {}), ...(base.style || {}) };
  const rules = Array.isArray(base.rules) ? [...base.rules] : [];
  const ruleTexts = new Set(rules.map(r => norm(r?.text)));
  for (const rule of (Array.isArray(incoming?.rules) ? incoming.rules : [])) {
    if (!norm(rule?.text) || ruleTexts.has(norm(rule.text))) continue;
    ruleTexts.add(norm(rule.text));
    rules.push({ ...rule, id: `rule-${makeId()}` });
  }
  next.rules = rules;
  return next;
}

// 给分镜段落挂参考角色：提示词里点到名就挂谁（最多 limit 个）；一个都没点到
// （模型用英文写镜头、角色名是中文）就挂主角（第 1 个）。
// 兜底只挂一个而不是全挂：compileStoryPrompt 会把引用到的角色名写进提示词，
// 全挂会让 pickReferenceImages 把多张脸一起塞给图生图，反而破坏一致性。
export function pickBeatReferences(characters, promptText, limit = 3) {
  const chars = (characters || []).filter(c => c?.id);
  if (!chars.length) return [];
  const text = String(promptText || '');
  const mentioned = chars.filter(c => c.name && text.includes(String(c.name)));
  return (mentioned.length ? mentioned.slice(0, limit) : chars.slice(0, 1)).map(c => ({ id: String(c.id), role: 'character' }));
}

function pickCapableModel(models, kind) {
  const hits = (models || []).filter(m => m?.capabilities?.[kind] || (kind === 'novel' && m?.capabilities?.chat));
  const rank = m => { const id = String(m?.id || '').toLowerCase(); if (/3\.|latest|pro/.test(id)) return 0; if (/2\.5/.test(id)) return 1; if (/2\.1/.test(id)) return 2; if (/2\.0/.test(id)) return 3; return 4; };
  return hits.sort((a, b) => rank(a) - rank(b))[0] || null;
}

export function createStoryOrchestrator({ root, clock = {}, adapters = {}, generateImage = null, generateVideo = null, saveArtifact = null, saveArtifactFromFile = null, directChat = null, getDefaultModel = null, getModelList = null }) {
  if (!root) throw new Error('story orchestrator 缺少 root');
  const withUpdated = project => ({ ...project, updatedAt: (clock.now || nowIso)() });
  const resolveModel = (explicit, kind, fallback) => {
    const isExplicit = explicit?.id && explicit.id !== 'auto' && explicit.provider !== 'auto';
    const candidates = typeof getModelList === 'function' ? getModelList() : [];
    return (isExplicit ? explicit : null) || pickCapableModel(candidates, kind) || (typeof getDefaultModel === 'function' ? getDefaultModel() : fallback);
  };
  // 结构化 JSON 任务优先用**非推理**模型：推理模型的思考会混进 content，把 JSON 淹没。
  // handleStoryAssist 早就这么做，storyboard 一开始漏了 —— 2026-09-14 真实调用即踩到：
  // 返回的 content 是"我们需要回答用户。要求只返回 JSON…"的思路，解析自然失败。
  const pickJsonModel = (explicit) => {
    const isExplicit = explicit?.id && explicit.id !== 'auto' && explicit.provider !== 'auto';
    if (isExplicit) return explicit;
    const available = typeof getModelList === 'function' ? getModelList() : [];
    return available.find(m => m?.capabilities?.chat && !m.reasoning && /agnes-3\.0-flash/i.test(m.id))
      || available.find(m => m?.capabilities?.chat && !m.reasoning)
      || (typeof getDefaultModel === 'function' ? getDefaultModel() : null);
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
      // 段号（跨场景连续）在生成时定格，随产物一起存下来——见 createGenerationRun 里的说明
      const beatNo = (() => {
        let n = 0;
        for (const s of project.scenes || []) for (const b of s.beats || []) { n += 1; if (b.id === beat.id) return n; }
        return undefined;
      })();
      const run = createGenerationRun({ ...input, kind, model, projectId: id, sceneId: scene.id, beatId: beat.id, beatNo, sceneTitle: scene.title, inputAssets: input.inputAssets || compiled.referenceIds.map(assetId => ({ id: assetId, role: 'reference' })) }, clock);
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
    // 连续性体检：只读，不落盘。把"这次生成能不能保住人物一致性"的条件提前摊开。
    lint: async (id, input = {}) => {
      const project = await readProject(root, id);
      return lintStoryProject(project, { kind: input.kind || 'image', capabilities: input.capabilities || null });
    },
    // 一键分镜：一次生成整场分镜表并追加进项目，自动串好 inheritFromBeatId 继承链。
    // 之前 assist 只产出 1 段，用户得一段一段点「从此处继续」。
    storyboard: async (id, input = {}) => {
      const project = await readProject(root, id);
      if (typeof directChat !== 'function') throw Object.assign(new Error('智能填充引擎未接入'), { statusCode: 503 });
      const idea = String(input.idea || '').trim().slice(0, 2000);
      const count = Math.max(2, Math.min(12, Number(input.count) || 6));
      const model = pickJsonModel(input.model);
      const prompt = buildStoryboardPrompt({ title: project.title, logline: project.logline, idea, current: project.bible, count });
      const result = await directChat(model, prompt, [], { maxTokens: 3000, timeout: 90000 });
      if (!result?.text) throw new Error('分镜模型没有返回内容');
      let storyboard;
      try { storyboard = parseStoryboard(result.text); }
      catch (error) {
        // 解析失败时把模型原文留在服务端日志里：不然只能看到"解析不出来"，无从判断是形状不符还是模型跑偏
        console.log(`[story] 分镜解析失败（模型 ${model?.provider}/${model?.id}，原文 ${String(result.text).length} 字）：${String(result.text).replace(/\s+/g, ' ').slice(0, 1200)}`);
        throw error;
      }
      const scenes = [...(project.scenes || [])];
      // 先并设定：段落引用要按**合并后**的角色 id 挂，否则引用指向的是不存在的 id。
      const bible = mergeStoryboardBible(project.bible, storyboard.bible);
      const cast = Array.isArray(bible.characters) ? bible.characters : [];
      let previousId = scenes.flatMap(s => s.beats || []).slice(-1)[0]?.id || '';
      const stamp = Date.now().toString(36);
      storyboard.scenes.forEach((scene, index) => {
        const beats = scene.beats.map((beat, beatIndex) => {
          const id = `beat-${stamp}-${index}-${beatIndex}`;
          const item = { id, kind: beat.kind, prompt: beat.prompt, references: pickBeatReferences(cast, beat.prompt), ...(previousId ? { inheritFromBeatId: previousId } : {}) };
          previousId = id;
          return item;
        });
        scenes.push({
          id: `scene-${stamp}-${index}`, index: scenes.length + 1,
          title: scene.title || `第 ${scenes.length + 1} 场`, summary: scene.summary, beats, outputs: [],
        });
      });
      const next = withUpdated({ ...project, bible, scenes });
      validateProject(next);
      await writeProject(root, next);
      return {
        project: next, beatCount: storyboard.beatCount, sceneCount: storyboard.scenes.length,
        characters: cast.length,
        characterNames: cast.map(c => String(c.name || '')).filter(Boolean),
        model: { provider: model?.provider || '', id: model?.id || '' },
      };
    },
    // 成片合成：按分镜顺序把**成功**的视频片段拼成一条长片，并落盘为正式产物。
    // 界面此前明确写着「暂不自动拼成长片」，这里把它做掉。
    assembleFilm: async (id, input = {}) => {
      const project = await readProject(root, id);
      const clips = collectFilmClips(project, root);
      if (!clips.length) throw Object.assign(new Error('还没有成功的视频片段可合成：先在某个段落里生成视频'), { statusCode: 400 });
      if (typeof saveArtifactFromFile !== 'function') throw Object.assign(new Error('产物入库未接入'), { statusCode: 503 });
      const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'story-film-'));
      try {
        const outFile = path.join(dir, 'film.mp4');
        const result = await concatClips({ clips, outFile, workDir: dir });
        const url = await saveArtifactFromFile({ filePath: result.outFile, type: 'video', prompt: `${project.title} 成片 ${result.clipCount} 段` });
        const film = {
          id: `film-${(clock.id || makeId)()}`,
          url,
          clipCount: result.clipCount,
          method: result.method,
          // 记下这一版成片用了哪些段：重排分镜后仍能还原"这版成片是什么时候、由哪些片段拼的"
          beatIds: clips.map(c => c.beatId),
          createdAt: (clock.now || nowIso)(),
        };
        const next = withUpdated({ ...project, films: [...(project.films || []), film] });
        await writeProject(root, next);
        return { project: next, film, url, clipCount: result.clipCount, method: result.method, beatIds: film.beatIds };
      } finally {
        try { await fsp.rm(dir, { recursive: true, force: true }); } catch {}
      }
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

export async function handleStoryLint(ctx, res, id, body) {
  try { return json(res, 200, await createStoryOrchestrator(ctx).lint(id, bodyOrEmpty(body))); } catch (e) { return sendError(res, e); }
}

export async function handleStoryStoryboard(ctx, res, id, body) {
  try { return json(res, 200, await createStoryOrchestrator(ctx).storyboard(id, bodyOrEmpty(body))); } catch (e) { return sendError(res, e); }
}

export async function handleStoryFilm(ctx, res, id, body) {
  try { return json(res, 200, await createStoryOrchestrator(ctx).assembleFilm(id, bodyOrEmpty(body))); } catch (e) { return sendError(res, e); }
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
