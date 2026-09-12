import test from 'node:test';
import assert from 'node:assert/strict';
import { negotiateCapabilities, createGenerationRun, appendRun, createStoryOrchestrator } from '../../engine/story-orchestrator.mjs';
import { createProject, writeProject } from '../../engine/story-store.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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
