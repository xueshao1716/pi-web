function cleanModel(model) { return { provider: String(model?.provider || ''), id: String(model?.id || '') }; }

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
        const url = await generateImage(model?.provider, model?.id, finalPrompt, params.size, ref || undefined);
        if (!url) return { status: 'failed', error: '图像模型未返回图片', model: cleanModel(model) };
        const stored = typeof saveArtifact === 'function' ? await saveArtifact({ type: 'image', url, prompt: finalPrompt }) : url;
        return { status: 'succeeded', model: cleanModel(model), output: { type: 'image', url: stored || url, prompt: finalPrompt } };
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
    async generate({ prompt, model, params = {}, references = [], referenceImages = [] } = {}) {
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
        const body = imgs.length ? { ...params, images: imgs } : params;
        const result = await generateVideo(model?.provider, model?.id, finalPrompt, body);
        if (!result?.video) return { status: 'failed', error: result?.error || '视频模型未返回片子', model: cleanModel(model) };
        const stored = typeof saveArtifact === 'function' ? await saveArtifact({ type: 'video', url: result.video, prompt: finalPrompt }) : result.video;
        return { status: 'succeeded', model: cleanModel(model), output: { type: 'video', url: stored || result.video, prompt: finalPrompt } };
      } catch (error) { return { status: 'failed', error: String(error?.message || error).slice(0, 200), model: cleanModel(model) }; }
    },
  };
}
