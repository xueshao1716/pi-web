// 代码高亮：highlight.js 按需语言注册（控 bundle 体积，全量引入会 +500KB）
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import sql from 'highlight.js/lib/languages/sql'
import markdown from 'highlight.js/lib/languages/markdown'
import java from 'highlight.js/lib/languages/java'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('python', python)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('java', java)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)

// 常见别名映射
const ALIAS: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  html: 'xml', svg: 'xml', vue: 'xml',
  py: 'python',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', cmd: 'bash', powershell: 'bash',
  yml: 'yaml', md: 'markdown', rs: 'rust', golang: 'go',
}

// 高亮为 HTML；无语法/未知语言返回 null（调用方回退纯文本）
export function highlightCode(code: string, lang?: string): string | null {
  const l = ALIAS[lang || ''] || lang || ''
  if (!l || !hljs.getLanguage(l)) return null
  try { return hljs.highlight(code, { language: l }).value } catch { return null }
}

// 无语言标注时自动探测（限制长度防大块卡顿；只用已注册语言）
export function highlightAuto(code: string): string | null {
  if (!code || code.length > 20000) return null
  try { return hljs.highlightAuto(code).value } catch { return null }
}
