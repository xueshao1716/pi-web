import type { StoryRecipe } from '../types'

// 参考图策略的前端默认值。**必须和后端 story-recipes.defaultRefStrategy 一致**——
// 不一致的话，制作台上显示"1 张 · 素材优先"，实际发出去的却是另一套，那比没有还糟。
// 所以这里只有一处定义，界面与配方都用它；后端那份是权威（真正决定发什么）。
export const REF_IMAGES_MAX = 4
export function defaultRefStrategy(kind: string): { images: number; prefer: 'material' | 'portrait' } {
  return {
    images: kind === 'image' ? 1 : kind === 'video' ? 4 : 0,
    prefer: kind === 'image' ? 'material' : 'portrait',
  }
}
export function normalizeRefStrategy(input: unknown, kind: string): { images: number; prefer: 'material' | 'portrait' } {
  const fallback = defaultRefStrategy(kind)
  const src = (input && typeof input === 'object' ? input : {}) as { images?: unknown; prefer?: unknown }
  const raw = Number(src.images)
  return {
    images: Number.isFinite(raw) ? Math.max(0, Math.min(REF_IMAGES_MAX, Math.round(raw))) : fallback.images,
    prefer: src.prefer === 'material' || src.prefer === 'portrait' ? src.prefer : fallback.prefer,
  }
}
export function refStrategyLabel(kind: string, s: { images: number; prefer: string }): string {
  if (!s.images) return '不用参考图'
  return `${s.images} 张 · ${s.prefer === 'material' ? '素材优先' : '定妆照优先'}`
}
// 项目默认配方里"能落到段落上"的部分：类型与负向。
// 模型/尺寸/seed 是每次生成时的选择，写进段落会把它们变成看不见的既成事实。
export function recipeBeatPatch(recipe: StoryRecipe | null | undefined): { kind?: StoryRecipe['kind']; negative?: string } {
  if (!recipe) return {}
  const patch: { kind?: StoryRecipe['kind']; negative?: string } = {}
  if (['novel', 'image', 'video'].includes(recipe.kind)) patch.kind = recipe.kind
  if (recipe.negative) patch.negative = recipe.negative
  return patch
}
