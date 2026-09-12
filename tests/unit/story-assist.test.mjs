import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStoryAssistPrompt, parseStoryAssist } from '../../engine/story-assist.mjs';

test('story assist prompt clearly assigns AI draft and human approval', () => {
  const prompt = buildStoryAssistPrompt({ title: '雾海列车', idea: '一场跨海追逐' });
  assert.match(prompt, /人类确认/);
  assert.match(prompt, /雾海列车/);
  assert.match(prompt, /characters/);
});

test('story assist parses fenced JSON and keeps only editable fields', () => {
  const result = parseStoryAssist('```json\n{"characters":[{"name":"阿宁"}],"style":{"visual":"电影感"},"rules":[{"text":"左手戴表"}],"scene":{"title":"车站","summary":"雨夜"},"beat":{"kind":"image","prompt":"回头"}}\n```');
  assert.equal(result.characters[0].name, '阿宁');
  assert.equal(result.style.visual, '电影感');
  assert.equal(result.scene.title, '车站');
  assert.equal(result.beat.kind, 'image');
});
