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

test('台词与跨工作台素材必须留在界面上（这是台前的入口，掉了就等于功能没了）', () => {
  assert.match(source, /aria-label="本段台词"/, '台词要有独立的可编辑字段');
  assert.match(source, /StoryMaterials/, '素材挂载面板要挂在制作台里');
  assert.match(source, /dialogue:dialogueDraft/, '台词要跟着段一起存盘');
  assert.match(source, /inputs:inputDrafts/, '素材要跟着段一起存盘');
  const materials = fs.readFileSync('frontend/src/components/story/StoryMaterials.tsx', 'utf8');
  assert.match(materials, /WsApi\.artifacts/, '素材来源之一：别的工作台的产物（生成物）');
  assert.match(materials, /NovelApi\.chapter/, '素材来源之二：小说工坊的正文');
  assert.match(materials, /text: '文本'/, '文本素材要能挂进来');
  const types = fs.readFileSync('frontend/src/types.ts', 'utf8');
  assert.match(types, /dialogue\?: string/);
  assert.match(types, /inputs\?: StoryBeatInput\[\]/);
});

test('产线参数必须留在界面上：负向 / seed / 变体数 / 执行链 / 同参重跑', () => {
  assert.match(source, /aria-label="本段负向提示词"/, '负向提示词要有输入框');
  assert.match(source, /aria-label="seed"/, 'seed 要能填（留空=现掷并记下）');
  assert.match(source, /aria-label="变体数量"/, '一次出几版要有选择');
  assert.match(source, /seed:negativeDraft|negative:negativeDraft/, '负向要跟着段一起存盘');
  assert.match(source, /StoryApi\.previewRun\([^)]*runExtras/, '预览必须带上和实跑同一套参数');
  assert.match(source, /setPlan\(r\.plan/, '执行链要显示出来');
  const results = fs.readFileSync('frontend/src/components/story/StoryResults.tsx', 'utf8');
  assert.match(results, /照这版重跑/, '同参重跑要有入口');
  assert.match(results, /onRerun/, '重跑要接回编排层');
  const types = fs.readFileSync('frontend/src/types.ts', 'utf8');
  assert.match(types, /negative\?: string/);
  assert.match(types, /StoryPlanStep/);
});

test('作品列表：段号取生成时的定格值、失败可见、成片落回项目', () => {  const products = fs.readFileSync('frontend/src/components/story/StoryProducts.tsx', 'utf8');
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
