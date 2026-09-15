// 视频「创建 + 短轮询」契约（2026-09-15）
//
// 起因是用户真实项目里的一次失败：`视频生成超时（180s）`，seed 48494449。
// 查下来是两个真问题叠在一起：
//   1) `generateVideo` 的轮询是 36×5s = **180 秒硬上限**，Agnes 排队常常比这久；
//   2) 更关键：**视频工坊早就改成了「创建 + 短轮询」**（躲 Cloudflare 100s/524），
//      而连续创作还是"一条请求干等三分钟"——同一条上游、两种姿势，后者正是仓库自己警告过的写法。
// 修法：连续创作的视频也走两段式；超窗不再等于失败。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStoryOrchestrator, videoPollWindowMs } from '../../engine/story-orchestrator.mjs';
import { createVideoAdapter } from '../../engine/story-adapters.mjs';
import { videoPollPlan } from '../../engine/media-api.mjs';
import { createProject, writeProject, sweepInterruptedRuns, sweepInterruptedRunsInProject } from '../../engine/story-store.mjs';

const VIDEO_CAPS = { video: true, reference: true, keyframe: true, seed: true };

async function projectWithVideoBeat(root) {
  const project = createProject({
    title: '异步视频',
    scenes: [{ id: 's1', index: 1, title: '一', summary: '', beats: [{ id: 'b1', kind: 'video', prompt: '站台', references: [] }], outputs: [] }],
  }, { id: () => 'pv' });
  await writeProject(root, project);
  return project;
}

const readProjectFile = async (root, id) => JSON.parse(await fs.readFile(path.join(root, 'story-projects', `${id}.json`), 'utf8'));

test('只创建、不等待：start 拿到任务号就回来，绝不在这里干等', async () => {
  let settleCalled = 0;
  const adapter = createVideoAdapter({
    startVideoJob: async () => ({ task_id: 'task-1', status: 'pending' }),
    checkVideoJob: async () => { settleCalled += 1; return { status: 'pending', task_id: 'task-1' }; },
    saveArtifact: async () => ({ url: '/saved.mp4', local: true, reason: '' }),
  });
  const r = await adapter.start({ prompt: '站台', model: { provider: 'agnes', id: 'v' }, seed: 7 });
  assert.equal(r.status, 'running');
  assert.equal(r.taskId, 'task-1');
  assert.equal(settleCalled, 0, 'start 里绝不能有轮询——那正是 180 秒超时的来源');
  // settle 也只查一次，不循环
  const again = await adapter.settle({ taskId: 'task-1', model: { provider: 'agnes', id: 'v' }, promptText: 'x' });
  assert.equal(again.status, 'running');
  assert.equal(settleCalled, 1, 'settle 只查一次，等多久由调用方决定');
});

test('连续创作的视频：runGeneration 立刻返回 running + 任务号，收尾交给 checkRun', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yuanshu-story-async-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await projectWithVideoBeat(root);
  let upstream = { status: 'pending' };
  const api = createStoryOrchestrator({
    root,
    getModelList: () => [{ provider: 'agnes', id: 'vid-1', capabilities: VIDEO_CAPS }],
    startVideoJob: async () => ({ task_id: 't-42' }),
    checkVideoJob: async () => upstream,
    saveArtifact: async ({ url }) => ({ url: `/local${url}`, local: true, reason: '' }),
  });
  const started = await api.runGeneration('pv', { sceneId: 's1', beatId: 'b1', kind: 'video', model: { provider: 'agnes', id: 'vid-1' }, seed: 11 });
  assert.equal(started.run.status, 'running', '创建成功只是"排上队了"，不是"出片了"');
  assert.equal(started.run.taskId, 't-42');
  assert.ok(started.run.queuedAt, '要记下排队时刻，界面才能算"等了多久"');
  assert.equal(started.run.outputAssets.length, 0);
  assert.ok(started.run.promptText, '当时发的提示词要留住——异步收尾时还得用它给产物留痕');
  assert.equal(typeof started.pollWindowMs, 'number', '轮询窗口由后端给，前端不自己写一套常量');

  // 还在排队：什么都不改
  const pending = await api.checkRun('pv', { sceneId: 's1', runId: started.run.id });
  assert.equal(pending.settled, false);
  assert.equal(pending.status, 'running');
  assert.equal((await api.get('pv')).scenes[0].outputs[0].status, 'running', '排队中不该被改成别的状态');

  // 出片：落盘 + 收尾
  upstream = { status: 'succeeded', video: 'https://up/v.mp4' };
  const done = await api.checkRun('pv', { sceneId: 's1', runId: started.run.id });
  assert.equal(done.settled, true);
  assert.equal(done.status, 'succeeded');
  const stored = (await api.get('pv')).scenes[0].outputs[0];
  assert.equal(stored.status, 'succeeded');
  assert.equal(stored.outputAssets[0].url, '/localhttps://up/v.mp4', '外站片子必须落回本地');
  assert.ok(stored.finishedAt);
  assert.equal(stored.taskId, 't-42', '任务号留着，事后可追溯');

  // 已经收尾的再查一次是幂等的
  const again = await api.checkRun('pv', { sceneId: 's1', runId: started.run.id });
  assert.equal(again.settled, false);
  assert.equal(again.status, 'succeeded');
});

test('上游真失败 vs 还在排队：两种结果要分得开', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yuanshu-story-async2-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await projectWithVideoBeat(root);
  const upstream = { status: 'failed', error: '上游说这个 prompt 违规' };
  const api = createStoryOrchestrator({
    root,
    getModelList: () => [{ provider: 'a', id: 'v', capabilities: VIDEO_CAPS }],
    startVideoJob: async () => ({ task_id: 't-9' }),
    checkVideoJob: async () => upstream,
    saveArtifact: async () => ({ url: '/x', local: true, reason: '' }),
  });
  const s = await api.runGeneration('pv', { sceneId: 's1', beatId: 'b1', kind: 'video', model: { provider: 'a', id: 'v' } });
  const bad = await api.checkRun('pv', { sceneId: 's1', runId: s.run.id });
  assert.equal(bad.settled, true);
  assert.equal(bad.status, 'failed');
  assert.match(bad.run.degradation.join(''), /违规/, '上游说什么就写什么，别换成含糊的"超时"');

  // 另一版：没有任务号的 running 是"创建阶段就断了"，如实标失败而不是永远挂着
  const p2 = await api.get('pv');
  p2.scenes[0].outputs.push({ id: 'no-task', beatId: 'b1', kind: 'video', status: 'running', createdAt: '2026-09-15T01:00:00.000Z' });
  await writeProject(root, p2);
  const noTask = await api.checkRun('pv', { sceneId: 's1', runId: 'no-task' });
  assert.equal(noTask.status, 'failed');
  assert.match(noTask.run.degradation.join(''), /没有任务号/);
});

test('轮询窗口可配；默认 10 分钟；非法值回落', () => {
  assert.equal(videoPollWindowMs({}), 600000);
  assert.equal(videoPollWindowMs({ STORY_VIDEO_POLL_MS: '30000' }), 30000);
  assert.equal(videoPollWindowMs({ STORY_VIDEO_POLL_MS: 'abc' }), 600000, '乱填不该把窗口变成 NaN');
  assert.equal(videoPollWindowMs({ STORY_VIDEO_POLL_MS: '100' }), 600000, '太小的值（<5s）当没设');
  // 同步路径的轮询也可配（聊天旁路仍走它）
  assert.deepEqual(videoPollPlan({}), { attempts: 36, intervalMs: 5000 });
  assert.deepEqual(videoPollPlan({ VIDEO_POLL_ATTEMPTS: '120', VIDEO_POLL_INTERVAL_MS: '3000' }), { attempts: 120, intervalMs: 3000 });
  assert.deepEqual(videoPollPlan({ VIDEO_POLL_ATTEMPTS: '9999' }), { attempts: 36, intervalMs: 5000 });
});

// 孤儿清扫的例外：带任务号的 running **不能**被标失败——任务还在上游跑着，
// 我们随时能拿号问一次；标成失败才是真的丢东西。
test('启动清扫：纯孤儿标失败，带任务号的留着可续查', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yuanshu-story-async3-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = createProject({
    title: '清扫',
    scenes: [{
      id: 's1', index: 1, title: '一', summary: '',
      beats: [{ id: 'b1', kind: 'video', prompt: 'x', references: [] }],
      outputs: [
        { id: 'orphan', beatId: 'b1', kind: 'video', status: 'running', createdAt: '2026-09-15T01:00:00.000Z' },
        { id: 'resumable', beatId: 'b1', kind: 'video', status: 'running', taskId: 't-keep', queuedAt: '2026-09-15T01:00:00.000Z', createdAt: '2026-09-15T01:00:00.000Z' },
      ],
    }],
  }, { id: () => 'ps' });
  await writeProject(root, project);

  // 单元级：先看扫到了什么
  const dry = sweepInterruptedRunsInProject(JSON.parse(JSON.stringify(project)), '2026-09-15T09:00:00.000Z');
  assert.deepEqual(dry, { swept: 1, resumable: 1 });

  const r = await sweepInterruptedRuns(root, { now: () => '2026-09-15T09:00:00.000Z' });
  assert.equal(r.swept, 1);
  assert.equal(r.resumable, 1);
  const runs = (await readProjectFile(root, 'ps')).scenes[0].outputs;
  assert.equal(runs.find(x => x.id === 'orphan').status, 'failed');
  const keep = runs.find(x => x.id === 'resumable');
  assert.equal(keep.status, 'running', '带上游任务号的不动：它不是孤儿，是可续查');
  assert.equal(keep.taskId, 't-keep');
  assert.equal(keep.degradation, undefined);
});
