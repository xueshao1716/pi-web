// 「挑片段合成」与「删掉不要的那几版」契约。
//
// 起因是用户的一句话：「有些剧情片段我生成了好几个镜头了」。
// 两个功能都碰**不可逆**的东西，所以这里锁的不是"能不能删/能不能拼"，而是边界：
// - 删记录必成功，但**删文件必须克制**：还在别处被引用就不删，排队中的版本默认不删，外链永不碰磁盘；
// - 挑片段凑不齐时**逐条说明原因**，不能静默少拼一段（少一段比报错难查得多）；
// - 挑出来的成片要记住"用的是哪一版的镜头"，否则事后分不清。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { filmPlan, videoFileOf, localPathFromArtifactUrl } from '../../engine/story-film.mjs';
import { createStoryOrchestrator } from '../../engine/story-orchestrator.mjs';
import { createProject, writeProject } from '../../engine/story-store.mjs';

// 造一个真实存在的文件 + 指向它的签名地址（删文件这条路必须走真磁盘，否则测的是假的）
async function makeMedia(root, name) {
  const rel = path.join('生成物', '视频', name);
  const abs = path.join(root, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, 'probe-bytes');
  return { abs, url: `/api/ws/file?path=${encodeURIComponent(rel)}` };
}

async function setup(t, { beats = 2 } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yuanshu-film-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = createProject({
    title: '挑片段',
    scenes: [{
      id: 's1', index: 1, title: '一场', summary: '',
      beats: Array.from({ length: beats }, (_, i) => ({ id: `b${i + 1}`, kind: 'video', prompt: `镜头${i + 1}`, references: [] })),
      outputs: [],
    }],
  }, { id: () => 'p1' });
  await writeProject(root, project);
  const api = createStoryOrchestrator({
    root, clock: { id: () => 'run-x', now: () => '2026-09-16T10:00:00.000Z' },
    saveArtifactFromFile: async ({ filePath }) => `/saved/${path.basename(filePath)}`,
  });
  return { root, api, project };
}

async function addRun(api, root, { runId, beatId, url, status = 'succeeded', createdAt, taskId }) {
  const project = await api.get('p1');
  const scene = project.scenes[0];
  scene.outputs.push({
    id: runId, beatId, kind: 'video', status, taskId, createdAt: createdAt || '2026-09-16T01:00:00.000Z', seed: runId.length,
    ...(url ? { outputAssets: [{ id: `${runId}-a`, type: 'video', url }] } : {}),
  });
  await writeProject(root, { ...project, scenes: [scene] });
}

test('候选清单：只认真有本地文件的版本，并如实标出文件不在的', async t => {
  const { root, api } = await setup(t);
  const a = await makeMedia(root, 'a.mp4');
  const gone = await makeMedia(root, 'gone.mp4');
  await addRun(api, root, { runId: 'r1', beatId: 'b1', url: a.url, createdAt: '2026-09-16T01:00:00.000Z' });
  await addRun(api, root, { runId: 'r2', beatId: 'b1', url: gone.url, createdAt: '2026-09-16T02:00:00.000Z' });
  await fs.rm(gone.abs); // 文件被移走：记录还在，但拼不进去
  await addRun(api, root, { runId: 'r3', beatId: 'b2', url: 'https://cdn.example/x.mp4', createdAt: '2026-09-16T03:00:00.000Z' });

  const plan = await api.filmPlan('p1');
  assert.equal(plan.total, 2);
  assert.equal(plan.usable, 1, '只有 b1 的那一版能拼');
  const b1 = plan.beats[0];
  assert.equal(b1.candidates.length, 2);
  assert.deepEqual(b1.candidates.map(c => `${c.runId}:${c.exists}`), ['r1:true', 'r2:false'], '文件不在的也要列出来并标 false');
  assert.equal(b1.recommendedRunId, 'r1', '推荐只能是**真能用**的那一版——推荐一个拼不进去的等于骗人');
  assert.equal(plan.beats[1].recommendedRunId, '', '外链拼不进去，不推荐');
  assert.equal(plan.beats[1].candidates[0].url.startsWith('https://'), true);
});

test('按挑好的版本与顺序合成：成片记下用的是哪一版；挑不出来的逐条说明原因', async t => {
  const { root, api } = await setup(t);
  const a = await makeMedia(root, 'a.mp4');
  const b = await makeMedia(root, 'b.mp4');
  await addRun(api, root, { runId: 'r1', beatId: 'b1', url: a.url, createdAt: '2026-09-16T01:00:00.000Z' });
  await addRun(api, root, { runId: 'r2', beatId: 'b1', url: b.url, createdAt: '2026-09-16T02:00:00.000Z' });

  // 一段 + 一段：两段之间来回拼要多段 ffmpeg，这里只验"挑版本 + 记录 + 跳过原因"，
  // 所以挑**一段**（concatClips 的单段路径是直接复制，不需要 ffmpeg）
  const r = await api.assembleFilm('p1', { clips: [{ beatId: 'b1', runId: 'r1' }] });
  assert.equal(r.clipCount, 1);
  assert.equal(r.method, 'copy');
  assert.deepEqual(r.film.picks, [{ beatId: 'b1', runId: 'r1' }], '要记下用的是哪一版镜头');
  assert.deepEqual(r.film.beatIds, ['b1']);
  const stored = (await api.get('p1')).films;
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0].picks, [{ beatId: 'b1', runId: 'r1' }], '重开页面也要能看出这版成片用了第几版');

  // 挑了不存在的运行 / 挑错段 / 挑排队中的：不能静默丢掉
  await addRun(api, root, { runId: 'r9', beatId: 'b2', status: 'running', taskId: 't-1' });
  await assert.rejects(() => api.assembleFilm('p1', { clips: [{ beatId: 'b1', runId: '不存在' }] }), /已经不在了/);
  await assert.rejects(() => api.assembleFilm('p1', { clips: [{ beatId: 'b2', runId: 'r1' }] }), /这一版不属于这一段/);
  await assert.rejects(() => api.assembleFilm('p1', { clips: [{ beatId: 'b2', runId: 'r9' }] }), /状态是「running」/);
  await assert.rejects(() => api.assembleFilm('p1', { clips: [] }), /一个都拼不了/);

  // 混着来：一条能用 + 一条排队中 → 能拼的照拼，不能拼的进 skipped（不静默）
  const mixed = await api.assembleFilm('p1', { clips: [{ beatId: 'b1', runId: 'r2' }, { beatId: 'b2', runId: 'r9' }] });
  assert.equal(mixed.clipCount, 1);
  assert.equal(mixed.skipped.length, 1);
  assert.match(mixed.skipped[0].reason, /running/);
  assert.deepEqual(mixed.film.picks, [{ beatId: 'b1', runId: 'r2' }]);
});

test('不传 clips 时行为不变：每段取最后一次成功、按分镜顺序（老按钮不能因为新功能变样）', async t => {
  const { root, api } = await setup(t);
  const a = await makeMedia(root, 'a.mp4');
  const b = await makeMedia(root, 'b.mp4');
  await addRun(api, root, { runId: 'r1', beatId: 'b1', url: a.url, createdAt: '2026-09-16T01:00:00.000Z' });
  await addRun(api, root, { runId: 'r2', beatId: 'b1', url: b.url, createdAt: '2026-09-16T02:00:00.000Z' });
  const plan = await api.filmPlan('p1');
  assert.equal(plan.beats[0].recommendedRunId, 'r2', '默认推荐最新的成功版本');
  const r = await api.assembleFilm('p1', {});
  assert.equal(r.clipCount, 1);
  assert.equal(r.film.picks, undefined, '没挑过就不写 picks（别让旧数据看起来像"挑过"）');
});

test('删一版：记录必删；文件只在没有别处引用时才删', async t => {
  const { root, api } = await setup(t);
  const own = await makeMedia(root, 'own.mp4');
  const other = await makeMedia(root, 'other.mp4');
  await addRun(api, root, { runId: 'r1', beatId: 'b1', url: own.url });
  await addRun(api, root, { runId: 'r2', beatId: 'b1', url: other.url });

  const r = await api.deleteRun('p1', { sceneId: 's1', runId: 'r1' });
  assert.equal(r.deletedRunId, 'r1');
  assert.equal(r.remaining, 1, '该段还剩一版');
  assert.equal(r.fileDeleted, 1);
  await assert.rejects(() => fs.stat(own.abs), /ENOENT/, '没别处引用时就该把文件删掉');
  assert.ok((await fs.stat(other.abs)).size > 0, '没被删的那一版，文件必须还在');
  const after = await api.get('p1');
  assert.deepEqual(after.scenes[0].outputs.map(x => x.id), ['r2']);
  await assert.rejects(() => api.deleteRun('p1', { sceneId: 's1', runId: 'r1' }), /不存在/);
});

test('删一版：两版指向同一个文件时，删掉其中一版不删文件（另一个还在用）', async t => {
  const { root, api } = await setup(t);
  const same = await makeMedia(root, 'same.mp4');
  await addRun(api, root, { runId: 'r1', beatId: 'b1', url: same.url });
  await addRun(api, root, { runId: 'r2', beatId: 'b1', url: same.url }, );
  const r = await api.deleteRun('p1', { sceneId: 's1', runId: 'r1' });
  assert.equal(r.fileDeleted, 0);
  assert.match(r.files[0].reason, /还被「p1」引用/);
  assert.ok((await fs.stat(same.abs)).size > 0);
});

test('删一版：同一个文件还被别的项目引用时，只移除记录、保留文件', async t => {
  const { root, api } = await setup(t);
  const shared = await makeMedia(root, 'shared.mp4');
  await addRun(api, root, { runId: 'r1', beatId: 'b1', url: shared.url });
  // 另一个项目把同一个文件当素材挂上了
  const other = createProject({
    title: '别的项目',
    scenes: [{ id: 'o1', index: 1, title: 'B', summary: '', beats: [{ id: 'ob1', kind: 'video', prompt: 'x', references: [], inputs: [{ id: 'in1', type: 'video', url: shared.url, name: 'shared.mp4' }] }], outputs: [] }],
  }, { id: () => 'p-other' });
  await writeProject(root, other);

  const r = await api.deleteRun('p1', { sceneId: 's1', runId: 'r1' });
  assert.equal(r.fileDeleted, 0);
  assert.equal(r.fileKept, 1);
  assert.match(r.files[0].reason, /还被「p-other」引用/, '要说清是被谁挡住的');
  assert.ok((await fs.stat(shared.abs)).size > 0, '别的项目还指着这个文件，绝不能删');
});

test('删一版：设定里的参考图与段落挂的素材同样算"被引用"', async t => {
  const { root, api } = await setup(t);
  const portrait = await makeMedia(root, 'portrait.png');
  await addRun(api, root, { runId: 'r1', beatId: 'b1', url: portrait.url });
  // 同一个文件被设成角色定妆照
  const project = await api.get('p1');
  project.bible.characters.push({ id: 'c1', name: '阿宁', refImage: portrait.url });
  await writeProject(root, project);
  const r = await api.deleteRun('p1', { sceneId: 's1', runId: 'r1' });
  assert.equal(r.fileDeleted, 0);
  assert.match(r.files[0].reason, /p1/, '引用它的就是本项目');
  assert.ok((await fs.stat(portrait.abs)).size > 0);
});

test('删一版：排队中的默认拒绝（删了上游出的片子就收不回来了），force 才放行；外链永不碰磁盘', async t => {
  const { root, api } = await setup(t);
  await addRun(api, root, { runId: 'rq', beatId: 'b1', status: 'running', taskId: 'task-abc' });
  await assert.rejects(() => api.deleteRun('p1', { sceneId: 's1', runId: 'rq' }), /还在排队/);
  const forced = await api.deleteRun('p1', { sceneId: 's1', runId: 'rq', force: true });
  assert.equal(forced.deletedRunId, 'rq');

  // 外链：解析不出本地路径 → 不碰磁盘，也不报错
  await addRun(api, root, { runId: 'rext', beatId: 'b1', url: 'https://cdn.example/x.mp4' });
  const ext = await api.deleteRun('p1', { sceneId: 's1', runId: 'rext' });
  assert.equal(ext.fileDeleted, 0);
  assert.match(ext.files[0].reason, /不是本地文件/);
});

test('keepFiles：只移除记录、文件留着（用户自己选的那条路）', async t => {
  const { root, api } = await setup(t);
  const keep = await makeMedia(root, 'keep.mp4');
  await addRun(api, root, { runId: 'rk', beatId: 'b1', url: keep.url });
  const r = await api.deleteRun('p1', { sceneId: 's1', runId: 'rk', keepFiles: true });
  assert.equal(r.fileDeleted, 0);
  assert.equal(r.fileKept, 1);
  assert.match(r.files[0].reason, /你选了/);
  assert.ok((await fs.stat(keep.abs)).size > 0);
});

test('videoFileOf / filmPlan 不碰项目之外的东西：外链与 data URL 一律算"拼不进去"', async () => {
  const run = { id: 'r', status: 'succeeded', outputAssets: [{ type: 'video', url: 'data:video/mp4;base64,AAAA' }] };
  const got = videoFileOf(run, 'D:/pi-workspace');
  assert.equal(got.exists, false);
  assert.equal(got.file, '');
  assert.equal(localPathFromArtifactUrl('https://cdn.example/x.mp4', 'D:/pi-workspace'), '');
  const plan = filmPlan({ scenes: [{ id: 's', beats: [{ id: 'b', kind: 'video', prompt: 'x' }], outputs: [{ id: 'r', beatId: 'b', status: 'succeeded', outputAssets: [{ type: 'video', url: 'https://x/y.mp4' }] }] }] }, 'D:/pi-workspace');
  assert.equal(plan.usable, 0);
  assert.equal(plan.beats[0].candidates.length, 1, '列表里仍要能看到它，只是标成不可用');
});
