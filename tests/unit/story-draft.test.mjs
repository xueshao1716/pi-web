import test from 'node:test'
import assert from 'node:assert/strict'
async function draft() {
  const mod = await import('../../frontend/src/lib/story-draft.ts').catch(() => ({}))
  assert.equal(typeof mod.applyStoryDraft, 'function', 'adopting an AI draft must persist the whole story')
  return mod
}
test('adopting draft saves detailed bible and materializes an empty first shot together', async () => {
  const { applyStoryDraft } = await draft()
  const project = { bible: {characters:[],locations:[],props:[],wardrobe:[],rules:[],style:{}}, scenes:[{id:'s',beats:[],outputs:[]}] }
  const next = applyStoryDraft(project, { characters:[{name:'小雨',appearance:'黑短发，左脸有痣'}], wardrobe:[{name:'蓝衣',description:'银扣'}], style:{visual:'胶片'}, beat:{kind:'video',prompt:'她推开门'} }, 's', 'b')
  assert.equal(next.bible.characters[0].appearance,'黑短发，左脸有痣')
  assert.equal(next.bible.wardrobe[0].description,'银扣')
  assert.equal(next.scenes[0].beats[0].prompt,'她推开门')
  assert.equal(next.scenes[0].beats[0].kind,'video')
  assert.equal(project.scenes[0].beats.length,0)
})
test('partial AI draft preserves established people and scene history', async () => {
  const { applyStoryDraft } = await draft()
  const project={bible:{characters:[{id:'c',name:'阿宁',appearance:'黑发'}],style:{visual:'水墨'},rules:[{text:'不可换衣'}]},scenes:[{id:'s',beats:[{id:'b',kind:'novel',prompt:'原稿',references:[]}],outputs:[{id:'old'}]}]}
  const next=applyStoryDraft(project,{characters:[{name:'阿宁'}],scene:{title:'雨夜'},beat:{prompt:'新的开端'}},'s','b')
  assert.equal(next.bible.characters[0].appearance,'黑发')
  assert.equal(next.bible.style.visual,'水墨')
  assert.equal(next.scenes[0].outputs[0].id,'old')
})
// 2026-09-14 修复：editedBible 原实现把整个 bible 压成文本行再按行重建为 {id,name,text}，
// 于是用户在界面里编辑一次设定，appearance / wardrobe / 角色定妆照 refImage 就全被抹掉。
test('editing the bible keeps structured fields and never leaks the portrait into the text area', async () => {
  const mod = await import('../../frontend/src/lib/story-draft.ts')
  const { bibleText, editedBible } = mod
  const bible = { characters: [{ id: 'c1', name: '阿宁', appearance: '黑发', refImage: '/signed/portrait.png' }], locations: [], props: [], wardrobe: [], rules: [], style: { visual: '水墨' } }
  const text = bibleText(bible)
  assert.ok(!text.characters.includes('/signed/portrait.png'), '定妆照 URL 不能混进可编辑的人物文本行')
  assert.ok(text.characters.includes('黑发'))
  // 用户改了一行文字后，结构化字段与定妆照都必须还在
  const next = editedBible(bible, { ...text, characters: '阿宁；黑发；左脸有痣' })
  assert.equal(next.characters[0].refImage, '/signed/portrait.png', '定妆照不能在编辑设定后丢失')
  assert.equal(next.characters[0].appearance, '黑发')
  assert.ok(String(next.characters[0].name).includes('左脸有痣'), '用户输入的新文本必须落进去')
  // 完全没改的字段保持原引用，不做无谓重建
  assert.equal(next.style.visual, '水墨')
})
