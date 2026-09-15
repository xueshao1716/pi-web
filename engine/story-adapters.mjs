function cleanModel(model) { return { provider: String(model?.provider || ''), id: String(model?.id || '') }; }

// saveArtifact 的正式返回是 { url, local, reason }（见 docs/NAMING.md 产物本地化契约）。
// 注入实现（测试替身、外部接入）可能仍返回字符串，这里统一成对象形状，
// 免得适配器里到处判断类型。
function normalizeStored(result, fallbackUrl) {
  if (typeof result === 'string') return { url: result, local: true, reason: '' };
  if (result && typeof result === 'object' && typeof result.url === 'string') {
    return { url: result.url, local: result.local !== false, reason: String(result.reason || '') };
  }
  return { url: String(fallbackUrl || ''), local: false, reason: '落盘实现未返回结果' };
}

// 上游把参考图摘掉时（media-inline 落不下来，见 engine/media-inline.mjs），
// 这一趟就是"没带参考图"的片子。适配器如实上报，编排层把它并进 run.degradation，
// 于是任务显示「已生成 · 请核对连续性」而不是一个看不出问题的"成功"。
function adapterNotes(result) {
  return Array.isArray(result?.notes) ? result.notes.filter(Boolean).map(String) : [];
}

export function createImageAdapter({ generateImage, saveArtifact }) {
  return {
    async generate({ prompt, model, seed, params = {}, references = [], referenceImages = [] } = {}) {
      if (typeof generateImage !== 'function') return { status: 'failed', error: '图像引擎未接入' };
      // 真参考图：把首张定妆照当作 image 传给上游（图生图），而不是只把 id 拼进提示词。
      // 没有参考图时提示词里显式说明，让"人物一致性有限"这件事在产物里也留痕。
      const ref = Array.isArray(referenceImages) ? String(referenceImages.find(Boolean) || '') : '';
      const marker = [
        Number.isFinite(seed) ? `seed=${seed}` : '',
        references.length ? `references=${references.join(',')}` : '',
        ref ? '已附角色定妆照参考图（图生图锁定）' : '无参考图，仅文字描述，人物一致性有限',
      ].filter(Boolean).join('；');
      const finalPrompt = marker ? `${String(prompt || '').trim()}\n[连续性参数] ${marker}` : String(prompt || '').trim();
      try {
        // seed 真的上送（2026-09-15 修）：此前它只被拼进提示词文本，模型不认，
        // 而能力声明却写着"支持固定 seed"——声称支持却从未生效。
        const url = await generateImage(model?.provider, model?.id, finalPrompt, params.size, ref || undefined, { seed, negative: params.negative });
        if (!url) return { status: 'failed', error: '图像模型未返回图片', model: cleanModel(model) };
        const stored = typeof saveArtifact === 'function' ? normalizeStored(await saveArtifact({ type: 'image', url, prompt: finalPrompt }), url) : { url, local: true, reason: '' };
        return { status: 'succeeded', model: cleanModel(model), output: { type: 'image', url: stored.url || url, prompt: finalPrompt, ...(stored.local ? {} : { localizeError: stored.reason }) } };
      } catch (error) { return { status: 'failed', error: String(error?.message || error).slice(0, 200), model: cleanModel(model) }; }
    },
  };
}

export function createNovelAdapter({ directChat }) {
  return {
    async generate({ prompt, model, history = [], params = {} } = {}) {
      if (typeof directChat !== 'function') return { status: 'failed', error: '小说引擎未接入' };
      try {
        const result = await directChat(model, prompt, history, { maxTokens: params.maxTokens || 6000, timeout: params.timeout || 180000 });
        const text = String(result?.text || '').trim();
        if (!text) return { status: 'failed', error: '小说模型未返回正文', model: cleanModel(model) };
        return { status: 'succeeded', model: cleanModel(model), output: { type: 'text', text } };
      } catch (error) { return { status: 'failed', error: String(error?.message || error).slice(0, 200), model: cleanModel(model) }; }
    },
  };
}

export function createVideoAdapter({ generateVideo, saveArtifact }) {
  return {
    async generate({ prompt, model, seed, params = {}, references = [], referenceImages = [] } = {}) {
      if (typeof generateVideo !== 'function') return { status: 'failed', error: '视频引擎未接入' };
      // 真参考图：把角色定妆照作为 images[] 传给上游，videoCreateBody 见到 images 会自动
      // 把 mode 落成 "reference"（见 video-request.mjs），这是人物一致的真正开关。
      const imgs = (Array.isArray(referenceImages) ? referenceImages : []).filter(Boolean).slice(0, 3);
      const marker = [
        references.join(','),
        imgs.length ? `已附 ${imgs.length} 张角色定妆照参考图（reference 模式锁定）` : '无参考图，仅文字描述，人物一致性有限',
      ].filter(Boolean).join('；');
      const finalPrompt = `${String(prompt || '').trim()}\n[连续性参考] ${marker}`;
      try {
        // seed 同样要真的进创建体（video-request 见到 src.seed 才会写 body.seed）：
        // 以前适配器压根没解构 seed，video-request 那条转发分支永远走不到。
        const body = {
          ...params,
          ...(Number.isFinite(seed) ? { seed } : {}),
          ...(imgs.length ? { images: imgs } : {}),
        };
        const result = await generateVideo(model?.provider, model?.id, finalPrompt, body);
        if (!result?.video) return { status: 'failed', error: result?.error || '视频模型未返回片子', model: cleanModel(model) };
        const stored = typeof saveArtifact === 'function' ? normalizeStored(await saveArtifact({ type: 'video', url: result.video, prompt: finalPrompt }), result.video) : { url: result.video, local: true, reason: '' };
        const notes = adapterNotes(result);
        return { status: 'succeeded', model: cleanModel(model), output: { type: 'video', url: stored.url || result.video, prompt: finalPrompt, ...(notes.length ? { degradation: notes } : {}), ...(stored.local ? {} : { localizeError: stored.reason }) } };
      } catch (error) { return { status: 'failed', error: String(error?.message || error).slice(0, 200), model: cleanModel(model) }; }
    },
  };
}
