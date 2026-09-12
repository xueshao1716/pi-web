import test from 'node:test';
import assert from 'node:assert/strict';
import { negotiateCapabilities, createGenerationRun, appendRun } from '../../engine/story-orchestrator.mjs';

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
