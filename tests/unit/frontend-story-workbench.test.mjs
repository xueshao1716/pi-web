import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('frontend/src/pages/StoryWorkbench.tsx', 'utf8');
const apiSource = fs.readFileSync('frontend/src/api.ts', 'utf8');
test('story workbench exposes timeline and a guided primary flow', () => {
  assert.match(source, /分镜时间线/);
  assert.match(source, /StoryStart/);
  assert.match(source, /生成当前/);
  assert.match(source, /从此处继续/);
  assert.ok(fs.readFileSync('frontend/src/components/story/StoryResults.tsx', 'utf8').includes('版本对比'));
});

test('story workbench exposes model selection and forwards it to generation', () => {
  assert.match(source, /ModelsApi/);
  assert.match(source, /自动选择模型/);
  assert.match(source, /模型/);
  assert.match(source, /selectedModel/);
  assert.match(source, /model:/);
  assert.match(apiSource, /assist:.*model\?/);
  assert.match(apiSource, /body: \{ idea, model \}/);
});

test('story workbench renders generated media in an inline preview surface', () => {
  assert.match(source, /StoryResults/);
});

test('story workbench lets the current shot choose output type and edit its prompt', () => {
  assert.match(source, /selectedKind/);
  assert.match(source, /输出类型/);
  assert.match(source, /本段内容/);
  assert.match(source, /setGenerationKind/);
  assert.match(source, /kind: selectedKind/);
});

test('story smart fill applies bible, scene and shot in one save', () => {
  assert.match(source, /applyStoryDraft/);
  assert.match(source, /hydrateBible/);
  assert.ok(!source.includes('fixed inset-x-3 bottom-20'));
});
