// 万像技能的章节索引生成器。
//
// 为什么需要它：两个技能的 SKILL.md 都写着"复杂需求必须读取完整文档"，
// 而源文分别是 6652 行 / 1553 行——整份读进来要十几万 token，等于没读。
// 这里把"第几章 = 第几行"机械算出来，写进各技能的 INDEX.md，让 agent 用
// read 的 offset/limit 精确取章。
//
// 用**脚本生成**而不是手抄：手抄的行号一定会随源文漂移，而且漂了没人知道。
// tests/unit/wanxiang-skills.test.mjs 会把 INDEX.md 与这里算出来的结果对比——
// 改了源文却不重跑本脚本，测试就会红。
//
// 本文件刻意放在仓库根的 scripts/（**不是** skills/ 下面）：skills/ 的每个子目录
// 都会被当成一个技能去读 SKILL.md，往里塞工具脚本会污染技能目录列表。
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const SKILLS = path.join(path.dirname(import.meta.dirname), 'skills')

// 章节标题：平面文档从第五章起用 `### **第X章：…**` 的加粗写法。
// 只认 `^第X章` 会漏掉 5/6/7 三章（实测踩到），所以要把 # 与 ** 都容掉。
const CH = /^#{0,4}\s*\**\s*第([一二三四五六七八九十百零〇\d]+)章\s*[:：]?\s*(.*?)\**\s*$/
const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
export function cnNum(s) {
  if (/^\d+$/.test(s)) return Number(s)
  let n = 0, cur = 0
  for (const ch of s) {
    if (ch === '十') { cur = (cur || 1) * 10; n += cur; cur = 0 }
    else if (CN[ch] != null) cur = CN[ch]
  }
  return n + cur
}

function firstSentence(lines, from) {
  for (let i = from; i < Math.min(lines.length, from + 12); i++) {
    const t = lines[i].trim().replace(/^[*#\s`]+/, '')
    if (t.length >= 12 && !/^[{}\[\]"']/.test(t)) return t.slice(0, 46)
  }
  return ''
}

export function buildIndex({ file, title, note }) {
  const raw = fs.readFileSync(file, 'utf8')
  const lines = raw.split('\n')
  const chapters = []
  lines.forEach((l, i) => {
    const m = l.trim().match(CH)
    if (m) chapters.push({ no: cnNum(m[1]), title: (m[2] || '').trim(), line: i + 1 })
  })
  const supplements = []
  lines.forEach((l, i) => { if (/【旧版补充】/.test(l)) supplements.push(i + 1) })
  const broken = []
  lines.forEach((l, i) => {
    const t = l.trim()
    if (t.length > 18 && /^[0-9]{1,3}/.test(t) && /["'）)】]\s*,\s*…?\s*$/.test(t) && !/[。！？]\s*$/.test(t)) broken.push({ line: i + 1, text: t.slice(0, 60) })
  })
  const suspicious = []
  lines.forEach((l, i) => {
    const t = l.trim()
    if (t.length > 14 && /^[0-9]{1,3}\s*,/.test(t) && /["'}\])）】]\s*,?\s*$/.test(t)) suspicious.push({ line: i + 1, text: t.slice(0, 50) })
  })
  const chars = raw.replace(/\s/g, '').length
  const out = []
  out.push(`# ${title} · 章节索引`, '')
  out.push('> 本文件由 `scripts/gen-wanxiang-index.mjs` 从源文件**机械生成**（行号即 `read` 的 offset），')
  out.push('> 并由 `tests/unit/wanxiang-skills.test.mjs` 核对——改了源文却不重跑生成器，测试会红。')
  out.push('> 为什么要它：源文几千行，整份读进来要十几万 token。按需读，先查这里。', '')
  out.push(`- 源文件：\`${path.basename(file)}\`（${lines.length} 行 / ${chars} 非空白字符）`)
  out.push(`- 章标题：**${chapters.length}** 个；编号去重后 **${new Set(chapters.map(c => c.no)).size}** 个`)
  if (note) out.push('', note)
  out.push('', '## 章节 → 行号', '', '| 章 | 标题 | 行号 | 这一章在讲什么 |', '|---|---|---|---|')
  for (const [i, c] of chapters.entries()) {
    const end = i + 1 < chapters.length ? chapters[i + 1].line - 1 : lines.length
    out.push(`| 第${c.no}章 | ${c.title || '（无标题）'} | ${c.line}–${end} | ${firstSentence(lines, c.line)} |`)
  }
  const missing = []
  for (let n = 1; n <= Math.max(...chapters.map(c => c.no)); n++) if (!chapters.some(c => c.no === n)) missing.push(n)
  const dupNo = [...new Set(chapters.map(c => c.no))].filter(n => chapters.filter(c => c.no === n).length > 1)
  out.push('', '## 源文件已知缺陷（不是我加的，是原始材料就有的）', '')
  if (missing.length) out.push(`- **缺章**：第 ${missing.join('、')} 章在源文件里没有正文。`)
  for (const n of dupNo) {
    const items = chapters.filter(c => c.no === n)
    out.push(`- **章号重复**：第 ${n} 章出现了 ${items.length} 次（${items.map(c => `第 ${c.line} 行「${c.title}」`).join('、')}）。引用这一章时**必须带行号**，否则读者不知道指哪一个。`)
  }
  if (supplements.length) out.push(`- **【旧版补充】块位置错乱**：合并时把旧版补充**放在了下一个章标题之前**（而不是它所属章节的末尾），共 ${supplements.length} 处，行号：${supplements.join('、')}。读到某一章时若发现内容"眼熟但顺序怪"，多半就是它。`)
  if (broken.length) out.push(`- **断句残片**：抽取时丢掉前半句的孤行 ${broken.length} 处：${broken.map(b => `第 ${b.line} 行「${b.text}…」`).join('；')}。这些行**不要引用**。`)
  if (suspicious.length) out.push(`- **疑似残缺**（也可能是 JSON 断行，用之前先看上下文）：${suspicious.map(s => `第 ${s.line} 行「${s.text}」`).join('；')}。`)
  if (!missing.length && !dupNo.length && !supplements.length && !broken.length && !suspicious.length) out.push('- 没发现缺章、重号、错位或残片。')
  out.push('')
  return out.join('\n')
}

export const TARGETS = [
  {
    file: path.join(SKILLS, 'wanxiang-design', 'wx_design_full.txt'),
    out: path.join(SKILLS, 'wanxiang-design', 'INDEX.md'),
    title: '万像平面设计提示词生成系统',
    note: '> 原文是 `万像平面-完整系统.docx`（Word 二进制，**read 工具读不了**）。\n> `wx_design_full.txt` 是从它抽出的可读文本（段落/制表符/换行已还原，格式标记已剥掉）。\n> 原文与抽取文本并存：要核对原文措辞看 docx，要读内容用 txt。',
  },
  {
    file: path.join(SKILLS, 'wanxiang-portrait', 'wx_full.txt'),
    out: path.join(SKILLS, 'wanxiang-portrait', 'INDEX.md'),
    title: '万像人物写真提示词生成系统',
    note: '> 源文件是"合并版"：以《万像人物提示词生成手册 4.docx》（37 章修订版）为主体，逐章补回旧版 PDF 独有内容。\n> 我没有改写这份源文（那是对你材料的改动），而是把它的**真实结构**摊在这里。',
  },
]

function main() {
  for (const t of TARGETS) {
    const text = buildIndex(t)
    fs.writeFileSync(t.out, text, 'utf8')
    console.log(`写入 ${path.relative(SKILLS, t.out)}（${text.split('\n').length} 行）`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
