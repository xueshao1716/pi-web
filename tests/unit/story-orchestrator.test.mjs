import test from 'node:test';
import assert from 'node:assert/strict';
import { negotiateCapabilities, createGenerationRun, appendRun, createStoryOrchestrator } from '../../engine/story-orchestrator.mjs';
import { createProject, writeProject } from '../../engine/story-store.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('preview is read-only and a continuing novel receives the actual previous prose', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yuanshu-continuity-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = createProject({title:'连续测试',scenes:[{id:'s',beats:[{id:'b1',kind:'novel',prompt:'开端',references:[]},{id:'b2',kind:'novel',prompt:'继续',inheritFromBeatId:'b1',references:[]}],outputs:[{id:'r0',beatId:'b1',status:'succeeded',outputAssets:[{id:'text0',type:'text',text:'她把钥匙藏进蓝色信封。'}]}]}]}, {id:()=> 'p'});
  await writeProject(root, project);
  let prompt;
  const api=createStoryOrchestrator({root,adapters:{novel:{generate:async input=>{prompt=input.prompt;return {status:'succeeded',output:{type:'text',text:'续文'}}}}}});
  await api.previewRun('p',{sceneId:'s',beatId:'b2',kind:'novel'});
  assert.equal((await api.get('p')).scenes[0].outputs.length,1,'preview must not create fake queued jobs');
  await api.runGeneration('p',{sceneId:'s',beatId:'b2',kind:'novel'});
  assert.match(prompt,/她把钥匙藏进蓝色信封/);
});

test('negotiateCapabilities reports unsupported reference and seed', () => {
  const r = negotiateCapabilities({ reference: true, keyframe: false, seed: true }, { reference: false, keyframe: false, seed: false });
  assert.deepEqual(r.degradation, ['reference: 当前模型不支持参考资产', 'seed: 当前模型不支持固定 seed']);
});

test('createGenerationRun records immutable parent and normalized status', () => {
  const r = createGenerationRun({ projectId: 'p1', sceneId: 's1', beatId: 'b1', kind: 'image', model: { provider: 'local', id: 'flux' }, params: { width: 1024 }, seed: 42, inputAssets: [{ id: 'a1', role: 'character' }], parentRunId: 'old' }, { id: () => 'run1', now: () => '2026-09-12T08:00:00.000Z' });
  assert.equal(r.id, 'run1');
  assert.equal(r.status, 'queued');
  assert.equal(r.parentRunId, 'old');
  assert.equal(r.seed, 42);
});

test('appendRun keeps previous runs and updates active run', () => {
  const scene = { outputs: [] };
  appendRun(scene, { id: 'r1', status: 'succeeded' });
  assert.equal(scene.outputs.length, 1);
  assert.equal(scene.activeRunId, 'r1');
});

test('runGeneration executes adapter and persists output with status', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yuanshu-story-'));
  const project = createProject({ title: '测试故事', scenes: [{ id: 's1', index: 1, title: '一', summary: '', beats: [{ id: 'b1', kind: 'novel', prompt: '写一段', references: [] }], outputs: [] }] }, { id: () => 'p1', now: () => '2026-09-12T08:00:00.000Z' });
  await writeProject(root, project);
  const api = createStoryOrchestrator({ root, clock: { id: () => 'r1', now: () => '2026-09-12T08:01:00.000Z' }, adapters: { novel: { generate: async () => ({ status: 'succeeded', output: { type: 'text', text: '正文' } }) } } });
  const result = await api.runGeneration('p1', { sceneId: 's1', beatId: 'b1', kind: 'novel', model: { provider: 'p', id: 'm' } });
  assert.equal(result.run.status, 'succeeded');
  assert.equal(result.run.outputAssets[0].type, 'text');
  assert.equal(result.project.scenes[0].outputs[0].status, 'succeeded');
});

test('unexpected adapter failure finishes and records a failed run instead of leaving it running', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yuanshu-story-error-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const api=createStoryOrchestrator({root,adapters:{novel:{generate:async()=>{throw new Error('通道中断')}}}});
  const p=await api.create({title:'临时错误测试',scenes:[{id:'s',beats:[{id:'b',kind:'novel',prompt:'开场',references:[]}],outputs:[]}]});
  const result=await api.runGeneration(p.id,{sceneId:'s',beatId:'b',kind:'novel'});
  assert.equal(result.run.status,'failed');
  assert.ok(result.run.finishedAt);
  assert.ok(result.run.degradation.includes('通道中断'));
  assert.equal((await api.get(p.id)).scenes[0].outputs[0].status,'failed');
});

test('runGeneration selects a capable image model when auto is requested', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yuanshu-story-image-'));
  const project = createProject({ title: '图像故事', scenes: [{ id: 's1', index: 1, title: '一', summary: '', beats: [{ id: 'b1', kind: 'image', prompt: '画面', references: [] }], outputs: [] }] }, { id: () => 'p2', now: () => '2026-09-12T08:00:00.000Z' });
  await writeProject(root, project);
  let used;
  const api = createStoryOrchestrator({ root, getDefaultModel: () => ({ provider: 'text', id: 'chat' }), getModelList: () => [{ provider: 'img', id: 'image-1', capabilities: { image: true } }], adapters: { image: { generate: async ({ model }) => { used = model; return { status: 'succeeded', output: { type: 'image', url: '/x' } }; } } }, clock: { id: () => 'r2', now: () => '2026-09-12T08:01:00.000Z' } });
  await api.runGeneration('p2', { sceneId: 's1', beatId: 'b1', kind: 'image', model: { provider: 'auto', id: 'auto' } });
  assert.deepEqual(used, { provider: 'img', id: 'image-1', capabilities: { image: true } });
});

// 段号是**产物**的一部分：重排分镜之后，历史产物卡上的"第 N 段"不能跟着变。
// 否则用户昨天导出的"第 3 段"今天就指向别的内容，产物就不再是历史了。
test('runGeneration stamps beatNo and sceneTitle at generation time, and reordering does not rewrite them', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yuanshu-story-beatno-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = createProject({
    title: '段号测试',
    scenes: [
      { id: 's1', index: 1, title: '第一场', summary: '', beats: [{ id: 'b1', kind: 'novel', prompt: '一', references: [] }, { id: 'b2', kind: 'novel', prompt: '二', references: [] }], outputs: [] },
      { id: 's2', index: 2, title: '第二场', summary: '', beats: [{ id: 'b3', kind: 'novel', prompt: '三', references: [] }], outputs: [] },
    ],
  }, { id: () => 'p3' });
  await writeProject(root, project);
  const api = createStoryOrchestrator({ root, adapters: { novel: { generate: async () => ({ status: 'succeeded', output: { type: 'text', text: '正文' } }) } } });
  const result = await api.runGeneration('p3', { sceneId: 's2', beatId: 'b3', kind: 'novel' });
  assert.equal(result.run.beatNo, 3, '段号跨场景连续编号');
  assert.equal(result.run.sceneTitle, '第二场');

  // 把第二场挪到最前：当前顺序下 b3 变成第 1 段，但已生成的那次运行仍应写着第 3 段
  const stored = await api.get('p3');
  await api.patch('p3', { scenes: [stored.scenes[1], stored.scenes[0]] });
  const after = await api.get('p3');
  const run = after.scenes[0].outputs[0];
  assert.equal(run.beatNo, 3, '重排分镜不得改写已落盘产物的段号');
  assert.equal(run.sceneTitle, '第二场');
});

// 成片此前只存进产物库就返回，项目里没有任何记录——刷新页面链接就没了。
test('assembleFilm records the film in project.films and persists it', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yuanshu-story-film-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'clip.mp4'), 'not-really-mp4');
  const project = createProject({
    title: '成片测试',
    scenes: [{
      id: 's1', index: 1, title: '一', summary: '',
      beats: [{ id: 'b1', kind: 'video', prompt: '镜头', references: [] }],
      outputs: [{ id: 'r1', beatId: 'b1', status: 'succeeded', outputAssets: [{ id: 'a1', type: 'video', url: '/api/ws/file?path=clip.mp4' }] }],
    }],
  }, { id: () => 'p4' });
  await writeProject(root, project);
  const api = createStoryOrchestrator({
    root,
    clock: { id: () => 'f1', now: () => '2026-09-15T10:00:00.000Z' },
    saveArtifactFromFile: async () => '/api/ws/file?path=films%2Ffilm-1.mp4',
  });
  const result = await api.assembleFilm('p4');
  assert.equal(result.film.clipCount, 1);
  assert.equal(result.film.method, 'copy');
  assert.deepEqual(result.film.beatIds, ['b1']);
  assert.equal(result.film.createdAt, '2026-09-15T10:00:00.000Z');
  assert.equal(result.project.films.length, 1, '返回值里带上了写回后的项目');
  // 真正的证据是**磁盘上**的项目；只改内存对象不算落地
  const reread = await api.get('p4');
  assert.equal(reread.films.length, 1);
  assert.equal(reread.films[0].url, '/api/ws/file?path=films%2Ffilm-1.mp4');
});
