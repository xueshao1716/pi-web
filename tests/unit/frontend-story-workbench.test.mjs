import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('frontend/src/pages/StoryWorkbench.tsx', 'utf8');
const apiSource = fs.readFileSync('frontend/src/api.ts', 'utf8');
test('story workbench exposes timeline and node sidebar labels', () => {
  assert.match(source, /分镜时间线/);
  assert.match(source, /节点侧栏/);
  assert.match(source, /开始第一个故事/);
  assert.match(source, /从此处继续/);
  assert.match(source, /版本对比/);
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
