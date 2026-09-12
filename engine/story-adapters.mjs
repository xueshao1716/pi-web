function cleanModel(model) { return { provider: String(model?.provider || ''), id: String(model?.id || '') }; }

export function createImageAdapter({ generateImage, saveArtifact }) {
  return {
    async generate({ prompt, model, seed, params = {}, references = [] } = {}) {
      if (typeof generateImage !== 'function') return { status: 'failed', error: '图像引擎未接入' };
      const marker = [Number.isFinite(seed) ? `seed=${seed}` : '', references.length ? `references=${references.join(',')}` : ''].filter(Boolean).join('；');
      const finalPrompt = marker ? `${String(prompt || '').trim()}\n[连续性参数] ${marker}` : String(prompt || '').trim();
      try {
        const url = await generateImage(model?.provider, model?.id, finalPrompt, params.size);
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
        const result = await directChat(model, prompt, history, { maxTokens: params.maxTokens || 6000, thinking: false, timeout: params.timeout || 180000 });
        const text = String(result?.text || '').trim();
        if (!text) return { status: 'failed', error: '小说模型未返回正文', model: cleanModel(model) };
        return { status: 'succeeded', model: cleanModel(model), output: { type: 'text', text } };
      } catch (error) { return { status: 'failed', error: String(error?.message || error).slice(0, 200), model: cleanModel(model) }; }
    },
  };
}

export function createVideoAdapter({ generateVideo, saveArtifact }) {
  return {
    async generate({ prompt, model, params = {}, references = [] } = {}) {
      if (typeof generateVideo !== 'function') return { status: 'failed', error: '视频引擎未接入' };
      const finalPrompt = references.length ? `${String(prompt || '').trim()}\n[连续性参考] ${references.join(',')}` : String(prompt || '').trim();
      try {
        const result = await generateVideo(model?.provider, model?.id, finalPrompt, params);
        if (!result?.video) return { status: 'failed', error: result?.error || '视频模型未返回片子', model: cleanModel(model) };
        const stored = typeof saveArtifact === 'function' ? await saveArtifact({ type: 'video', url: result.video, prompt: finalPrompt }) : result.video;
        return { status: 'succeeded', model: cleanModel(model), output: { type: 'video', url: stored || result.video, prompt: finalPrompt } };
      } catch (error) { return { status: 'failed', error: String(error?.message || error).slice(0, 200), model: cleanModel(model) }; }
    },
  };
}
