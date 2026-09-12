import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('frontend/src/pages/StoryWorkbench.tsx', 'utf8');
test('story workbench exposes timeline and node sidebar labels', () => {
  assert.match(source, /分镜时间线/);
  assert.match(source, /节点侧栏/);
  assert.match(source, /从此处继续/);
  assert.match(source, /版本对比/);
});
