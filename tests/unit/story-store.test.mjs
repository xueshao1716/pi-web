import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, mergeBeatContext, validateProject } from '../../engine/story-store.mjs';

test('createProject returns stable bible and empty scenes', () => {
  const p = createProject({ title: '黄河边的夏天' }, { now: () => '2026-09-12T08:00:00.000Z', id: () => 'p1' });
  assert.equal(p.id, 'p1');
  assert.equal(p.title, '黄河边的夏天');
  assert.deepEqual(p.bible, { characters: [], locations: [], props: [], wardrobe: [], style: {}, rules: [] });
  assert.deepEqual(p.scenes, []);
});

test('mergeBeatContext keeps ordered inherited entities and rejects cycles', () => {
  const project = { bible: { characters: [{ id: 'c1', name: '阿宁' }], locations: [], props: [], wardrobe: [], style: { tone: '电影感' }, rules: [] } };
  const scene = { beats: [
    { id: 'b1', references: [{ id: 'c1', role: 'character' }], prompt: '站在河边' },
    { id: 'b2', references: [], inheritFromBeatId: 'b1', prompt: '回头' },
  ] };
  const result = mergeBeatContext(project, scene, scene.beats[1]);
  assert.deepEqual(result.referenceIds, ['c1']);
  assert.equal(result.prompt, '站在河边\n回头');
  assert.throws(() => mergeBeatContext(project, { beats: [{ id: 'a', inheritFromBeatId: 'b' }, { id: 'b', inheritFromBeatId: 'a' }] }, { id: 'a', inheritFromBeatId: 'b' }), /循环/);
});

test('validateProject rejects duplicate scene indexes', () => {
  assert.throws(() => validateProject({ id: 'p1', title: 'x', scenes: [{ id: 's1', index: 1 }, { id: 's2', index: 1 }] }), /index/);
});
