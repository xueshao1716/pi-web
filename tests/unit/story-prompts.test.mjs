import test from 'node:test';
import assert from 'node:assert/strict';
import { compileStoryPrompt, normalizeBible } from '../../engine/story-prompts.mjs';

test('normalizeBible keeps editable Story Bible fields safe and deterministic', () => {
  const bible = normalizeBible({ characters: [{ name: '阿宁' }], style: { visual: '胶片' }, rules: ['左手戴表'] });
  assert.equal(bible.characters[0].name, '阿宁');
  assert.equal(bible.style.visual, '胶片');
  assert.deepEqual(bible.rules, [{ text: '左手戴表' }]);
  assert.ok(Array.isArray(bible.locations));
});

test('compileStoryPrompt merges bible, scene, beat and inherited context', () => {
  const prompt = compileStoryPrompt({
    bible: { characters: [{ name: '阿宁', appearance: '短发' }], style: { visual: '电影感' }, rules: [{ text: '保持左手戴表' }] },
    scene: { title: '车站', summary: '雨夜告别' },
    beat: { prompt: '她回头看向站台', references: [{ id: 'ref-1' }] },
    inherited: { prompt: '镜头延续暖色轮廓光', referenceIds: ['ref-0', 'ref-1'] },
  });
  assert.match(prompt.text, /阿宁/);
  assert.match(prompt.text, /车站/);
  assert.match(prompt.text, /雨夜告别/);
  assert.match(prompt.text, /暖色轮廓光/);
  assert.deepEqual(prompt.referenceIds, ['ref-0', 'ref-1']);
});
