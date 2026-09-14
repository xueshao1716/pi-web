// engine/story-lint.mjs —— 连续创作「连续性体检」
//
// 目的：把"这次生成能不能保住人物一致性"的已知条件**提前摊开**给用户，
// 而不是等生成失败、或者看到人物一段一个样才发现。
// 纯函数，不碰磁盘、不调模型，因此可以完整单元测试。

const text = value => String(value ?? '').trim();
const list = value => (Array.isArray(value) ? value : []);

export function lintStoryProject(project, { kind = 'image', capabilities = null } = {}) {
  const issues = [];
  const add = (level, code, message) => issues.push({ level, code, message });

  const characters = list(project?.bible?.characters);
  const scenes = list(project?.scenes);
  const beats = scenes.flatMap(scene => list(scene?.beats));

  if (!text(project?.logline)) add('info', 'no-logline', '故事还没有梗概：AI 续写容易跑偏');

  if (!characters.length) {
    add('warn', 'no-characters', '还没有角色设定，先补一段设定再谈人物一致性');
  }
  for (const character of characters) {
    const name = text(character?.name) || text(character?.id) || '未命名角色';
    if (!text(character?.appearance) && !text(character?.description)) {
      add('warn', 'character-no-appearance', `角色「${name}」没有外貌描述：不同镜头容易走样`);
    }
    if (!text(character?.refImage) && !text(character?.ref)) {
      add('info', 'character-no-portrait', `角色「${name}」还没有定妆照：生成时只能用文字描述`);
    }
  }

  for (const scene of scenes) {
    const title = text(scene?.title) || text(scene?.id) || '未命名场景';
    if (!text(scene?.summary)) add('info', 'scene-no-summary', `场景「${title}」没有摘要`);
    list(scene?.beats).forEach((beat, index) => {
      if (index > 0 && !text(beat?.inheritFromBeatId)) {
        add('warn', 'beat-not-inherited', `「${title}」第 ${index + 1} 段没有继承前文：续写会缺上下文`);
      }
    });
  }

  if (!beats.length) add('warn', 'no-beats', '还没有任何段落');

  // 只有图像/视频才谈参考图能力；文本段落不需要
  if (kind !== 'novel' && capabilities && capabilities.reference === false) {
    add('warn', 'model-no-reference', '当前模型声明不支持参考资产：定妆照不会被使用，人物一致性只能靠文字');
  }

  const portraits = characters.filter(c => text(c?.refImage) || text(c?.ref)).length;
  const level = issues.some(i => i.level === 'warn') ? 'warn' : issues.length ? 'info' : 'ok';
  return {
    issues,
    summary: { characters: characters.length, portraits, scenes: scenes.length, beats: beats.length, level },
  };
}
