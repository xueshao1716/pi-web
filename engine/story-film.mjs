// engine/story-film.mjs —— 连续创作「成片合成」
//
// 界面此前明确写着「每次生成一个视频片段，暂不自动拼成长片」。这里把它做掉：
// 按分镜顺序收集每段**成功**的视频产出 → ffmpeg 统一参数归一化 → concat 拼成一条长片。
//
// 为什么不直接 concat：不同片段的编码/分辨率/帧率/音轨常常不一致，concat demuxer
// 要求参数一致，否则会出黑屏、音画不同步或直接失败。所以先各自转成统一中间片再拼。
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

const list = value => (Array.isArray(value) ? value : []);

// 从产物 URL 解出磁盘路径。生成物统一走签名地址
// /api/ws/file?path=<urlencoded 相对路径>&exp=&sig= ——直接读磁盘，省一次网络往返。
// 非签名地址（http/data）返回空串：交给调用方决定是否走网络。
export function localPathFromArtifactUrl(url, wsRoot) {
  const raw = String(url || '');
  if (!raw) return '';
  if (raw.startsWith('data:') || /^https?:/i.test(raw)) return '';
  if (!raw.startsWith('/api/ws/file')) {
    const abs = path.resolve(wsRoot || '.', raw);
    return withinRoot(abs, wsRoot) ? abs : '';
  }
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  const rel = new URLSearchParams(q).get('path') || '';
  if (!rel) return '';
  const abs = path.resolve(wsRoot || '.', rel);
  return withinRoot(abs, wsRoot) ? abs : '';
}

function withinRoot(abs, wsRoot) {
  if (!wsRoot) return true;
  const a = String(abs).replace(/\\/g, '/').toLowerCase();
  const r = String(path.resolve(wsRoot)).replace(/\\/g, '/').toLowerCase();
  return a === r || a.startsWith(r + '/');
}

// 按分镜顺序收集可合成的片段：每段取**最后一次成功**的视频产出。
export function collectFilmClips(project, wsRoot) {
  const clips = [];
  for (const scene of list(project?.scenes)) {
    for (const beat of list(scene?.beats)) {
      const run = [...list(scene?.outputs)].reverse()
        .find(r => r?.beatId === beat.id && ['succeeded', 'degraded'].includes(r.status) && list(r.outputAssets).length);
      const asset = list(run?.outputAssets).find(a => a?.type === 'video' && a.url);
      const file = localPathFromArtifactUrl(asset?.url, wsRoot);
      if (file && fs.existsSync(file)) clips.push({ sceneId: scene.id, beatId: beat.id, file, url: asset.url });
    }
  }
  return clips;
}

export function runFfmpeg(args, { timeout = 900000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const tail = String(stderr || err?.message || err).trim().split('\n').slice(-6).join(' / ').slice(0, 500);
        reject(Object.assign(new Error(`ffmpeg 失败：${tail}`), { code: 'FFMPEG' }));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export function ffmpegAvailable() {
  return new Promise(resolve => {
    execFile('ffmpeg', ['-version'], { timeout: 15000, windowsHide: true }, err => resolve(!err));
  });
}

// 归一化参数：768p 内等比缩放 + 补边 + 30fps + AAC 立体声。
// 这样不同来源的片段拼起来不会变形、不会因为参数不一致而失败。
export const NORMALIZE_ARGS = ['-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2'];

export async function concatClips({ clips = [], outFile, workDir = '', ffmpeg = runFfmpeg } = {}) {
  if (!clips.length) throw Object.assign(new Error('还没有可合成的视频片段：先生成至少一段视频'), { statusCode: 400 });
  if (!outFile) throw new Error('缺少输出路径');
  const dir = workDir || (await fsp.mkdtemp(path.join(os.tmpdir(), 'story-film-')));
  await fsp.mkdir(dir, { recursive: true });

  // 只有一段：直接落盘，不必过 ffmpeg
  if (clips.length === 1) {
    await fsp.copyFile(clips[0].file, outFile);
    return { outFile, clipCount: 1, method: 'copy' };
  }

  const parts = [];
  for (let i = 0; i < clips.length; i++) {
    const part = path.join(dir, `part-${String(i).padStart(3, '0')}.mp4`);
    await ffmpeg(['-y', '-i', clips[i].file, ...NORMALIZE_ARGS, part]);
    parts.push(part);
  }
  const listFile = path.join(dir, 'concat.txt');
  // concat demuxer 的路径写法：单引号包裹，内部单引号需转义
  await fsp.writeFile(listFile, parts.map(f => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
  await ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outFile]);
  return { outFile, clipCount: clips.length, method: 'concat' };
}
