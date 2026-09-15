// 台前入口的契约（分集 / 原著改编 / 批量生成 / 风格预设）。
//
// 这一层测试只锁一件事：**功能在界面上真的存在，并且接到了真正的通路上**。
// 后端算得再对，界面上没有入口 = 这个功能不存在（这套项目里已经发生过三次）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const workbench = read('frontend/src/pages/StoryWorkbench.tsx');
const adapt = read('frontend/src/components/story/StoryAdapt.tsx');
const batch = read('frontend/src/components/story/StoryBatch.tsx');
const episodes = read('frontend/src/components/story/StoryEpisodes.tsx');
const api = read('frontend/src/api.ts');
const types = read('frontend/src/types.ts');
const styles = read('frontend/src/lib/story-styles.ts');
const settings = read('frontend/src/components/story/StorySettings.tsx');
const css = read('frontend/src/components/story/story.css');
const server = read('server.mjs');
const orchestrator = read('engine/story-orchestrator.mjs');

test('分集：面板挂在制作台，点某一场要真的跳到那一场', () => {
  assert.match(workbench, /StoryEpisodes/, '分集面板要挂在制作台里');
  assert.match(episodes, /StoryApi\.addEpisode/);
  assert.match(episodes, /StoryApi\.updateEpisode/);
  assert.match(episodes, /StoryApi\.removeEpisode/);
  assert.match(episodes, /StoryApi\.assignScene/);
  assert.match(episodes, /未分集/, '要允许"未分集"，不能强迫每场都归集');
  assert.match(episodes, /里\S{0,4}的场回到「未分集」，一个都没丢/, '删集只解绑不删场，界面上要说清');
  assert.match(api, /\/episodes\/remove/);
  assert.match(api, /scene-assign/);
  assert.match(types, /StoryEpisodeGroup/);
  // selected 可能是场 id（分集面板点进来）也可能是段 id，两种都要能定位到那一场，
  // 否则从分集面板点「第 3 场」会被静默落到第 1 场，看起来像跳转失灵
  assert.match(workbench, /s\.id === selected \|\| s\.beats\.some\(b => b\.id === selected\)/);
  assert.match(css, /\.story-episode-group/);
});

test('原著改编：入口、预览不花钱、字数上限说清、改编记录看得见', () => {
  assert.match(workbench, /StoryAdapt/, '改编面板要挂在制作台里');
  assert.match(adapt, /StoryApi\.adapt/);
  assert.match(adapt, /NovelApi\.detail/, '要能从小说工坊按书导入');
  assert.match(adapt, /NovelApi\.books/);
  assert.match(adapt, /preview: true|preview,/, '「预览」走的必须是 preview 通路');
  assert.match(adapt, /预览（不调模型）/, '预览要写明它不调模型（不然用户不敢点）');
  assert.match(adapt, /SOURCE_CAP = 60000/);
  assert.match(adapt, /只取前 \$\{SOURCE_CAP\} 字/, '原文被截断必须说清，不能让人以为整本都改编了');
  assert.match(adapt, /不选 = 改编整本/);
  assert.match(adapt, /改编记录/, '改编史要在界面上看得见（刷新后仍能回答"从哪本书改的"）');
  assert.match(adapt, /未解析出来/, '哪几集没解析出来要如实显示');
  assert.match(adapt, /模型第一次给的集数不够/, '自动重试要告诉用户，不能默默替他做决定');
  assert.match(adapt, /aria-label="小说原文"/);
  assert.match(adapt, /aria-label="集数"/);
  assert.match(adapt, /aria-label="单集秒数"/);
  assert.match(adapt, /aria-label="改编要求"/);
  // 通路的每一段都要在
  assert.match(api, /\/adapt`/);
  assert.match(api, /StoryAdaptResult/);
  assert.match(server, /\/adapt\$/);
  assert.match(server, /readStoryNovelBook/);
  assert.match(server, /readNovelBook: readStoryNovelBook/);
  assert.match(orchestrator, /adapt: async \(id, input = \{\}\)/);
  assert.match(types, /adaptations\?: StoryAdaptation\[\]/);
  assert.match(css, /\.story-adapt/);
});

test('改编：段落类型不能被项目默认配方抹平（这是改编结果本身，不是工艺）', () => {
  // 一键分镜会盖默认配方的 kind；改编**不能**——novel/image/video 的分工是改编结果
  const inAdapt = orchestrator.slice(orchestrator.indexOf('adapt: async (id, input = {})'), orchestrator.indexOf('assembleFilm: async'));
  assert.match(inAdapt, /kind: \['novel', 'image', 'video'\]\.includes\(beat\.kind\) \? beat\.kind : \(stampRecipe\?\.kind \|\| 'image'\)/);
  assert.match(inAdapt, /stampRecipe\?\.negative/, '负向是工艺，照旧套用');
  assert.match(inAdapt, /collectAdaptSource\(input, readNovelBook\)/);
  assert.match(orchestrator, /preview: true, source: sourceBrief, episodeWish, secondsPerEpisode/);
});

test('批量生成：逐段串行提交 + 统一等上游；超窗不算失败；每段成败都列出来', () => {
  assert.match(workbench, /StoryBatch/, '批量面板要挂在制作台里');
  assert.match(workbench, /selectedSceneId=\{scene\?\.id\}/, '批量要拿到真正的场 id');
  assert.match(batch, /for \(const \[i, t\] of list\.entries\(\)\)/, '必须逐段串行提交');
  assert.ok(!/Promise\.all/.test(batch), '不能并发轰炸上游：视频任务本来就要排队，并发只会一起超窗');
  assert.match(batch, /StoryApi\.checkRun/);
  assert.match(batch, /逐段串行提交/, '界面上要说清它是串行的');
  assert.match(batch, /这不是失败/, '超窗必须说清不是失败（任务号还在）');
  assert.match(batch, /只算「排上队」/, '创建成功只是排队，不能报成"出片了"');
  assert.match(batch, /停止/);
  assert.match(batch, /失败/);
  assert.match(batch, /aria-label|当前场|当前集/, '范围要能选：这一场 / 这一集 / 全项目');
  assert.match(batch, /scope === 'episode'/, '要能"这一集全部生成"');
  assert.match(css, /\.story-batch/);
});

test('风格预设：是可选的统一画风，不是又一句自由发挥', () => {
  const ids = [...styles.matchAll(/^    id: '([a-z0-9-]+)'/gm)].map(m => m[1]);
  assert.equal(ids.length, 10, '预置 10 种画风');
  assert.equal(new Set(ids).size, ids.length, 'id 不能重复');
  assert.match(styles, /export function stylePresetById/);
  assert.match(styles, /fill.*bible\.style|bible\.style/);
  assert.match(settings, /STYLE_PRESETS/);
  assert.match(settings, /aria-label="风格预设"/);
  assert.match(settings, /style: `\$\{p\.visual\}；\$\{p\.tone\}（\$\{p\.name\}）`/, '选完要写进 bible.style，而且仍可手改');
  assert.match(css, /\.story-style-presets/);
});
