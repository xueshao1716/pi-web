import type { StoryProject, StoryBible } from '../types'
type Entry = Record<string, any>
const fields = ['characters', 'locations', 'props', 'wardrobe', 'rules'] as const

export function applyStoryDraft(project: StoryProject, draft: any, sceneId: string, beatId: string): Partial<StoryProject> {
  const bible = { ...project.bible, style: { ...project.bible.style, ...draft.style } }
  for (const key of fields) {
    const existing = project.bible[key] || []
    const incoming: Entry[] = Array.isArray(draft[key]) ? draft[key] : []
    const merged: Entry[] = existing.map(item => ({ ...item }))
    for (const item of incoming) {
      const index = merged.findIndex(old => (old.id && old.id === item.id) || (old.name && old.name === item.name) || (old.text && old.text === item.text))
      if (index >= 0) merged[index] = { ...merged[index], ...Object.fromEntries(Object.entries(item).filter(([, value]) => value !== '' && value != null)) }
      else merged.push(item)
    }
    bible[key] = merged.map((item, i) => ({ ...item, id: String(item.id || `${key}-${i + 1}`), name: String(item.name || item.text || '') }))
  }
  const scenes = project.scenes.map(scene => {
    if (scene.id !== sceneId) return scene
    const old = scene.beats.find(beat => beat.id === beatId) || { id: beatId, kind: 'image' as const, prompt: '', references: [] }
    const beat = { ...old, kind: ['novel', 'image', 'video'].includes(draft.beat?.kind) ? draft.beat.kind : old.kind, prompt: draft.beat?.prompt?.trim() || old.prompt }
    return { ...scene, title: draft.scene?.title?.trim() || scene.title, summary: draft.scene?.summary?.trim() || scene.summary, beats: scene.beats.some(b => b.id === beatId) ? scene.beats.map(b => b.id === beatId ? beat : b) : [...scene.beats, beat] }
  })
  return { bible, scenes }
}

// 参考图是二进制引用，不该混进可编辑的文本行（否则会被当成"人物外貌"的一段文字）
const REF_KEYS = new Set(['id', 'refImage', 'ref'])

export function bibleText(bible: StoryBible): Record<string, string> {
  return Object.fromEntries([...fields.map(key => [key, (bible[key] || []).map(item => Object.entries(item).filter(([k, v]) => !REF_KEYS.has(k) && v).map(([, v]) => v).join('；')).join('\n')]), ['style', Object.values(bible.style || {}).join('；')]])
}
// 2026-09-14 修复数据丢失：原实现把整个 bible 压成文本行、再按行重建为 {id,name,text}，
// 于是用户只要在界面里编辑一次设定，characters[].appearance / wardrobe / refImage
// 这类结构化字段就被抹掉了（定妆照也会跟着丢）。现在改成按名字/下标认回原条目并保留其余字段。
export function editedBible(bible: StoryBible, values: Record<string, string>): StoryBible {
  const original = bibleText(bible)
  const result = { ...bible }
  for (const key of fields) {
    if (values[key] === original[key]) continue // 没动过就原样保留，不做任何重建
    const lines = (values[key] || '').split('\n').map(text => text.trim()).filter(Boolean)
    const existing = Array.isArray(bible[key]) ? bible[key] : []
    result[key] = lines.map((text, i) => {
      const matched = existing.find(item => String(item?.name || '') === text || String(item?.text || '') === text) || existing[i]
      return matched
        ? { ...matched, id: String(matched.id || `${key}-${i + 1}`), name: text, text }
        : { id: `${key}-${i + 1}`, name: text, text }
    })
  }
  if (values.style !== original.style) result.style = { visual: values.style }
  return result
}
