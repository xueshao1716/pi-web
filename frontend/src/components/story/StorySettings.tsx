import { withFileToken } from '../../api'
import { STYLE_PRESETS, stylePresetById } from '../../lib/story-styles'
import type { StoryCharacter } from '../../types'

type AssetKind = 'character' | 'location' | 'prop'
interface RefAsset { id: string; name?: string; refImage?: string }

// 人物与连续性设定。角色区额外提供「定妆照」：生成后写回 bible.characters[].refImage，
// 后续画面/视频会把它当作**真实的参考图**注入（图像走图生图、视频走 reference 模式），
// 这是"锁住人物外貌"的入口——在此之前 story 层只有文字描述。
//
// 2026-09-15 扩展：**场景与道具也走同一条通路**。此前只有角色有参考图，场景/道具只有文字，
// 同一间屋子在两段里会长得不一样（对手产品都在解决：PINNGOO 叫资产库，LibTV 叫角色三视图+资产复用）。
// 挂载规则和角色一样：名字出现在这一段的提示词里，就带上它的参考图。
export default function StorySettings({ values, busy, characters, locations = [], props = [], onPortrait, onAssetRef, onChange, onSave }: {
  values: Record<string, string>
  busy: boolean
  characters: StoryCharacter[]
  locations?: RefAsset[]
  props?: RefAsset[]
  onPortrait: (character: StoryCharacter) => void
  onAssetRef?: (assetType: AssetKind, asset: RefAsset) => void
  onChange: (values: Record<string, string>) => void
  onSave: () => void
}) {
  const withRef = characters.filter(c => c.refImage).length
  const groups: { key: AssetKind; label: string; list: RefAsset[]; hint: string; cta: string }[] = [
    { key: 'character', label: '角色定妆照', list: characters, hint: '锁住人物外貌', cta: '生成定妆照' },
    { key: 'location', label: '场景参考图', list: locations, hint: '锁住"同一个地方"的样子，避免环境漂移', cta: '生成场景图' },
    { key: 'prop', label: '道具参考图', list: props, hint: '锁住关键道具的材质与细节', cta: '生成道具图' },
  ]
  return <details className="story-settings"><summary>人物与连续性设定 <span>每一段都会使用，展开修改</span></summary>
    {groups.filter(g => g.list.length > 0).map(g => {
      const n = g.list.filter(x => x.refImage).length
      return <div key={g.key} className="story-portraits">
        <div className="story-portraits-head">
          <strong>{g.label}</strong>
          <span className="story-hint">{g.hint}（已有 {n}/{g.list.length}）</span>
        </div>
        <div className="story-portrait-list">{g.list.map(item => (
          <div key={item.id} className="story-portrait-card">
            {item.refImage
              ? <img src={withFileToken(item.refImage)} alt={`${item.name || item.id} 的参考图`} />
              : <div className="story-portrait-empty" aria-hidden="true">未生成</div>}
            <strong title={item.name || item.id}>{item.name || item.id}</strong>
            <button type="button" className="btn-ghost" disabled={busy}
              onClick={() => (g.key === 'character' ? onPortrait(item as StoryCharacter) : onAssetRef?.(g.key, item))}>
              {item.refImage ? '重新生成' : g.cta}
            </button>
          </div>
        ))}</div>
      </div>
    })}
    {characters.length > 0 && withRef < characters.length && <p className="story-hint">还没有定妆照的角色只能靠文字描述，人物一致性会差很多。</p>}
    {/* 风格预设：把"这部戏长什么样"从自由发挥变成可选的统一画风——
        画风一旦漂移，人物锁得再准也救不回来 */}
    <div className="story-style-presets">
      <label>统一画风<select aria-label="风格预设" disabled={busy} defaultValue=""
        onChange={e => { const p = stylePresetById(e.target.value); if (p) onChange({ ...values, style: `${p.visual}；${p.tone}（${p.name}）` }) }}>
        <option value="">选一个预设填进「文字与画面风格」</option>
        {STYLE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}（{p.tags.join('/')}）</option>)}
      </select></label>
      <span className="story-hint">预置了 {STYLE_PRESETS.length} 种画风，选完仍可手改</span>
    </div>
    <div className="story-settings-grid">{[['characters','人物与外貌'],['locations','场景'],['wardrobe','服装'],['props','道具'],['rules','必须遵守的规则'],['style','文字与画面风格']].map(([key,label]) => <label key={key}>{label}<textarea value={values[key] || ''} rows={3} disabled={busy} onChange={e => onChange({ ...values, [key]: e.target.value })} placeholder={`补充${label}`} /></label>)}</div>
    <button className="btn-ghost" disabled={busy} onClick={onSave}>保存设定</button>
  </details>
}
