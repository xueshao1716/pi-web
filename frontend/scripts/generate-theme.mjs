// 把生成器输出写回 styles.css 的标记区块（token 单一事实源 = src/theme/generate.mjs）
// 跑法：node scripts/generate-theme.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { emitCss } from '../src/theme/generate.mjs'

const CSS_PATH = new URL('../src/styles.css', import.meta.url)
const START = '/* @generated-tokens:start —— 本区块由 scripts/generate-theme.mjs 生成，勿手改 */'
const END = '/* @generated-tokens:end */'

let css = readFileSync(CSS_PATH, 'utf8')
const { root, themes } = emitCss()

if (!css.includes(START)) {
  // 首次接入：定位 :root 变量块与 ink..mist 三主题块，整体替换为生成值并加标记
  const rootStart = css.indexOf(':root {')
  const rootEnd = css.indexOf('}', rootStart) + 1
  if (rootStart < 0) throw new Error('找不到 :root')
  css = css.slice(0, rootStart) + `${START}\n${root}\n${END}` + css.slice(rootEnd)

  const inkStart = css.indexOf('[data-theme="ink"] {')
  const mistAfter = css.indexOf('[data-theme="mist"] .glass')
  if (inkStart < 0 || mistAfter < 0) throw new Error('找不到主题块锚点')
  css = css.slice(0, inkStart) + `${START}\n${themes}\n${END}\n` + css.slice(mistAfter)
} else {
  const esc = START.replace(/[*/]/g, '\\$&')
  const ee = END.replace(/[*/]/g, '\\$&')
  const ra = new RegExp(`${esc}[\\s\\S]*?${ee}`, 'g')
  let count = 0
  css = css.replace(ra, () => {
    count++
    return count === 1 ? `${START}\n${root}\n${END}` : `${START}\n${themes}\n${END}`
  })
  if (count !== 2) throw new Error(`预期 2 个标记区块，实际 ${count} 个`)
}

writeFileSync(CSS_PATH, css)
console.log('styles.css token 区块已更新（2 处，内容=生成器输出）')
