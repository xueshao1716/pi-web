import { withFileToken } from '../../api'
import type { StoryCharacter } from '../../types'

// 人物与连续性设定。角色区额外提供「定妆照」：生成后写回 bible.characters[].refImage，
// 后续画面/视频会把它当作**真实的参考图**注入（图像走图生图、视频走 reference 模式），
// 这是"锁住人物外貌"的入口——在此之前 story 层只有文字描述。
export default function StorySettings({ values, busy, characters, onPortrait, onChange, onSave }: {
  values: Record<string, string>
  busy: boolean
  characters: StoryCharacter[]
  onPortrait: (character: StoryCharacter) => void
  onChange: (values: Record<string, string>) => void
  onSave: () => void
}) {
  const withRef = characters.filter(c => c.refImage).length
  return <details className="story-settings"><summary>人物与连续性设定 <span>每一段都会使用，展开修改</span></summary>
    {characters.length > 0 && <div className="story-portraits">
      <div className="story-portraits-head">
        <strong>角色定妆照</strong>
        <span className="story-hint">生成后会作为后续画面与视频的真实参考图，用来锁住人物外貌（已有 {withRef}/{characters.length}）</span>
      </div>
      <div className="story-portrait-list">{characters.map(character => (
        <div key={character.id} className="story-portrait-card">
          {character.refImage
            ? <img src={withFileToken(character.refImage)} alt={`${character.name || character.id} 的定妆照`} />
            : <div className="story-portrait-empty" aria-hidden="true">未生成</div>}
          <strong title={character.name || character.id}>{character.name || character.id}</strong>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => onPortrait(character)}>{character.refImage ? '重新生成' : '生成定妆照'}</button>
        </div>
      ))}</div>
    </div>}
    <div className="story-settings-grid">{[['characters','人物与外貌'],['locations','场景'],['wardrobe','服装'],['props','道具'],['rules','必须遵守的规则'],['style','文字与画面风格']].map(([key,label]) => <label key={key}>{label}<textarea value={values[key] || ''} rows={3} disabled={busy} onChange={e => onChange({ ...values, [key]: e.target.value })} placeholder={`补充${label}`} /></label>)}</div>
    <button className="btn-ghost" disabled={busy} onClick={onSave}>保存设定</button>
  </details>
}
