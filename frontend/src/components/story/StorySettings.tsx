export default function StorySettings({ values, busy, onChange, onSave }: { values: Record<string, string>; busy: boolean; onChange: (values: Record<string, string>) => void; onSave: () => void }) {
  return <details className="story-settings"><summary>人物与连续性设定 <span>每一段都会使用，展开修改</span></summary>
    <div className="story-settings-grid">{[['characters','人物与外貌'],['locations','场景'],['wardrobe','服装'],['props','道具'],['rules','必须遵守的规则'],['style','文字与画面风格']].map(([key,label]) => <label key={key}>{label}<textarea value={values[key] || ''} rows={3} disabled={busy} onChange={e => onChange({ ...values, [key]: e.target.value })} placeholder={`补充${label}`} /></label>)}</div>
    <button className="btn-ghost" disabled={busy} onClick={onSave}>保存设定</button>
  </details>
}
