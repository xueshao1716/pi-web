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
