import { useRef, useState } from 'react'
import useSWR from 'swr'
import { StoryApi } from '../../api'
import type { StoryRecipe } from '../../types'
import { refStrategyLabel } from '../../lib/story-ref'

const kindLabel: Record<string, string> = { novel: '文字', image: '画面', video: '视频' }

// 生成配方：把"调好的生成设置"变成一份可复用/可导出/可导入的资产。
//
// 这是照 ComfyUI 最值钱的那一条补的——在 ComfyUI 里，工作流本身就是资产：
// 一张调好的节点图存下来，换个项目、换台机器、发给同事，只改提示词就能复现同一套处理方式。
// 元枢此前每次生成都要重选模型、重填负向、重设变体数，同一部片子的 10 个段落要点 10 遍，
// 而且跨项目完全无法复用。
//
// 边界：配方**只存工艺，不存故事**——类型/模型/尺寸或时长/负向/seed/变体数。
// 提示词、台词、素材属于故事，混进配方就变成"换个配方顺手把台词也换了"。
export default function StoryRecipes({ current, busy, onApply, onApplyToProject, defaultRecipeId, onSetDefault, onPatchProject }: {
  current: Partial<StoryRecipe>
  busy: boolean
  onApply: (recipe: StoryRecipe) => void
  onApplyToProject: (recipe: StoryRecipe) => void
  defaultRecipeId?: string
  onSetDefault?: (id: string) => void
  onChanged?: () => void
  onPatchProject?: () => void
}) {
  const { data, mutate } = useSWR('story-recipes', () => StoryApi.recipes(), { revalidateOnFocus: false, dedupingInterval: 10000 })
  const recipes: StoryRecipe[] = data?.recipes || []
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const save = async () => {
    if (!name.trim()) { setMsg('给这个配方起个名字，否则下次认不出它'); return }
    try {
      const r = await StoryApi.saveRecipe({
        name: name.trim(), note: note.trim(),
        kind: current.kind as StoryRecipe['kind'],
        model: current.model || { provider: 'auto', id: 'auto' },
        params: current.params || {},
        negative: current.negative || '',
        reference: current.reference,
        seed: current.seed ?? null,
        variants: current.variants || 1,
      })
      await mutate()
      setName(''); setNote(''); setMsg(`配方「${r.recipe.name}」已保存（同名会覆盖）`)
    } catch (e: any) { setMsg(e?.message || '配方没存上') }
  }

  const remove = async (r: StoryRecipe) => {
    try { const res = await StoryApi.deleteRecipe(r.id); await mutate(); setMsg(res.ok ? `已删除「${r.name}」` : '没有这个配方') }
    catch (e: any) { setMsg(e?.message || '删除失败') }
  }

  // 导出：给一份自足的文件，换台机器/给别人都能导入
  const exportAll = async () => {
    try {
      const payload = await StoryApi.exportRecipes()
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `元枢-故事配方-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMsg(`已导出 ${payload.recipes.length} 个配方`)
    } catch (e: any) { setMsg(e?.message || '导出失败') }
  }

  const importFile = async (file: File) => {
    try {
      const text = await file.text()
      const r = await StoryApi.importRecipes(JSON.parse(text))
      await mutate()
      const skip = r.skipped?.length ? `，跳过 ${r.skipped.length} 条（${r.skipped.map(s => s.name).slice(0, 3).join('、')}）` : ''
      setMsg(`导入完成：新增 ${r.added} 个、覆盖 ${r.updated} 个${skip}`)
    } catch (e: any) { setMsg(e?.message || '导入失败，确认是这个格式的 JSON') }
  }

  return <div className="story-recipes">
    <div className="story-recipes-head">
      <span>配方 · {recipes.length ? `${recipes.length} 个` : '还没有'}</span>
      <button className="btn-ghost" disabled={busy} onClick={() => setOpen(o => !o)}>{open ? '收起' : '配方'}</button>
    </div>
    {open && <div className="story-recipes-body">
      <p className="story-hint">配方只存**工艺**（类型 / 模型 / 尺寸 / 负向 / seed / 变体数），不存提示词与台词——换配方不会动你的故事。</p>
      {recipes.length > 0 && <ul className="story-recipe-list">
        {recipes.map(r => <li key={r.id} className={`story-recipe-item${r.id === defaultRecipeId ? ' is-default' : ''}`}>
          <div className="story-recipe-meta">
            <strong>{r.name}{r.id === defaultRecipeId ? ' · 项目默认' : ''}</strong>
            <span>{kindLabel[r.kind] || r.kind} · {r.model?.provider}/{r.model?.id}{Object.keys(r.params || {}).length ? ` · ${Object.values(r.params).join('/')}` : ''} · 参考图 {refStrategyLabel(r.kind, r.reference || { images: 1, prefer: 'portrait' })}{r.negative ? ' · 有负向' : ''}{r.variants > 1 ? ` · ${r.variants} 版` : ''}{r.seed != null ? ` · seed ${r.seed}` : ''}</span>
            {r.note && <span>{r.note}</span>}
          </div>
          <div className="story-actions">
            <button className="btn-ghost" disabled={busy} onClick={() => onApply(r)}>套用</button>
            <button className="btn-ghost" disabled={busy} onClick={() => onApplyToProject(r)}>套用到本项目所有段落</button>
            {onSetDefault && (r.id === defaultRecipeId
              ? <button className="btn-ghost" disabled={busy} onClick={() => onSetDefault('')}>取消项目默认</button>
              : <button className="btn-ghost" disabled={busy} onClick={() => onSetDefault(r.id)}>设为项目默认</button>)}
            <button className="btn-ghost" disabled={busy} onClick={() => remove(r)}>删除</button>
          </div>
        </li>)}
      </ul>}
      <div className="story-recipe-save">
        <input aria-label="配方名称" value={name} disabled={busy} onChange={e => setName(e.target.value)} placeholder="把当前设置存成配方，起个名字" />
        <input aria-label="配方备注" value={note} disabled={busy} onChange={e => setNote(e.target.value)} placeholder="备注（可选）" />
        <button className="btn-ghost" disabled={busy} onClick={save}>保存当前设置</button>
      </div>
      <div className="story-actions">
        <button className="btn-ghost" disabled={busy || !recipes.length} onClick={exportAll}>导出全部</button>
        <button className="btn-ghost" disabled={busy} onClick={() => fileRef.current?.click()}>导入 JSON</button>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = '' }} />
        {onPatchProject && <button className="btn-ghost" disabled={busy} onClick={onPatchProject}>刷新项目</button>}
      </div>
      {msg && <p role="status" className="story-notice">{msg}</p>}
    </div>}
  </div>
}
