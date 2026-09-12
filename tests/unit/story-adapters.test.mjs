import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageAdapter, createNovelAdapter } from '../../engine/story-adapters.mjs';

test('image adapter returns a normalized artifact result', async () => {
  const adapter = createImageAdapter({ generateImage: async () => 'data:image/png;base64,aGk=', saveArtifact: async () => '/signed/image.png' });
  const result = await adapter.generate({ prompt: '电影感车站', model: { provider: 'p', id: 'm' }, seed: 42 });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.output.url, '/signed/image.png');
  assert.equal(result.output.type, 'image');
});

test('novel adapter preserves draft text as a controllable artifact', async () => {
  const adapter = createNovelAdapter({ directChat: async () => ({ text: '她在雨里停下。' }) });
  const result = await adapter.generate({ prompt: '写一段告别', model: { provider: 'p', id: 'm' } });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.output.text, '她在雨里停下。');
  assert.equal(result.output.type, 'text');
});
