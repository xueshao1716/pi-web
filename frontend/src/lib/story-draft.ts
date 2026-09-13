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

export function bibleText(bible: StoryBible): Record<string, string> {
  return Object.fromEntries([...fields.map(key => [key, (bible[key] || []).map(item => Object.entries(item).filter(([k, v]) => k !== 'id' && v).map(([, v]) => v).join('；')).join('\n')]), ['style', Object.values(bible.style || {}).join('；')]])
}
export function editedBible(bible: StoryBible, values: Record<string, string>): StoryBible {
  const original = bibleText(bible)
  const result = { ...bible }
  for (const key of fields) if (values[key] !== original[key]) result[key] = (values[key] || '').split('\n').map(text => text.trim()).filter(Boolean).map((text, i) => ({ id: `${key}-${i + 1}`, name: text, text }))
  if (values.style !== original.style) result.style = { visual: values.style }
  return result
}
