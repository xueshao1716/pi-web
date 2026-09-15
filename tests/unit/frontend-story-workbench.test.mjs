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
  // 旧契约断言的是「版本对比」——那是一个 <select> 版本下拉。
  // 意图（旧版本必须看得见）没变，呈现方式变了：2026-09 起所有版本平铺，新的在最上面，
  // 下拉被删掉了，所以这里锁"平铺 + 不再有隐藏版本的下拉"，而不是锁那个词。
  const results = fs.readFileSync('frontend/src/components/story/StoryResults.tsx', 'utf8');
  assert.match(results, /全部保留/);
  // 只看代码行：注释里还留着"此前藏在 <select> 里"的说明，不该被当成代码证据
  const resultsCode = results.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
  assert.ok(!/<select/.test(resultsCode), '版本不能再藏进下拉里');
});

test('作品列表：段号取生成时的定格值、失败可见、成片落回项目', () => {
  const products = fs.readFileSync('frontend/src/components/story/StoryProducts.tsx', 'utf8');
  // 段号优先用 run.beatNo（生成时刻定格），只在旧数据上按当前分镜顺序回退
  assert.match(products, /run\.beatNo/);
  assert.match(products, /run\.sceneTitle/);
  // 没有产物的运行默认折叠但不丢弃：失败的必须看得见
  assert.match(products, /只看有产物的/);
  assert.match(products, /degradation/);
  // 成片是作品，写在项目里而不是一次性的本地状态
  assert.match(products, /project\.films/);
  assert.match(fs.readFileSync('frontend/src/types.ts', 'utf8'), /films\?: StoryFilm\[\]/);
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
