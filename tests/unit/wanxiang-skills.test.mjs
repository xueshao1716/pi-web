// 万像技能的契约。
//
// 这些技能是**给 agent 用的**：它们的失败方式和普通代码不同——
// 一次死链、一个读不到的二进制文件、一句"必须读完整文档"却没说第几行，
// 都会让 agent 直接放弃执行。所以这里锁的是"指令能不能被执行"：
//
//  1. description 必须在 120 字以内，且**触发语落在前 120 字**——
//     `engine/context-loader.mjs:178` 只取前 120 字进目录，超出的部分等于不存在；
//  2. SKILL.md 里引用的**仓库内路径必须存在**（死链 = 指令无法执行）；
//  3. INDEX.md 必须与 `skills/scripts/gen-index.mjs` 现算的结果**逐字一致**——
//     源文改了却忘了重跑生成器，索引就会骗人（这条把"骗人"变成红灯）；
//  4. 源文件里真实存在的缺陷（重号章、错位的补充块、断句残片）必须被索引**如实声明**，
//     而不是藏起来；
//  5. SKILL.md 不得再出现被实测推翻的旧说法（"18 章""8.2 万字"这类）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildIndex, TARGETS } from '../../scripts/gen-wanxiang-index.mjs';

const SKILLS = path.resolve('skills');
const SKILL_DIRS = ['wanxiang-design', 'wanxiang-portrait'];
const readSkill = name => fs.readFileSync(path.join(SKILLS, name, 'SKILL.md'), 'utf8');

test('技能 description 必须在 120 字内且触发语在前 120 字（加载器会截断）', () => {
  for (const name of SKILL_DIRS) {
    const raw = readSkill(name);
    const fm = raw.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(fm, `${name} 缺 frontmatter`);
    const field = key => (fm[1].match(new RegExp(`^${key}:\\s*(.+)$`, 'm')) || [])[1]?.trim() || '';
    assert.equal(field('name'), name, 'frontmatter 的 name 必须与目录名一致（加载器按目录名找文件）');
    const desc = field('description');
    assert.ok(desc.length > 0, `${name} 没有 description`);
    assert.ok(desc.length <= 120, `${name} 的 description ${desc.length} 字，超过 120 会被截断：加载器只取前 120 字`);
    const trigger = desc.search(/当用户/);
    assert.ok(trigger >= 0 && trigger < 120, `${name} 的触发语在第 ${trigger + 1} 字，落在 120 字之外 → 目录里看不见，技能不会被触发`);
  }
});

test('SKILL.md 里引用的仓库内路径必须存在（死链 = agent 无法执行）', () => {
  for (const name of SKILL_DIRS) {
    const raw = readSkill(name);
    const refs = [...raw.matchAll(/`(skills\/[^`]+|[a-z0-9_-]+\/[^`\s]+\.(?:md|txt|docx))`/g)].map(m => m[1]);
    assert.ok(refs.length, `${name} 没有引用任何资源文件——那"必须读原文"就成了空话`);
    for (const ref of refs) {
      const abs = ref.startsWith('skills/') ? path.resolve(ref) : path.join(SKILLS, name, ref);
      assert.ok(fs.existsSync(abs), `${name} 引用了不存在的路径：${ref}`);
    }
    // 二进制文档不能被当成"可 read 的原文"：docx 必须有一份抽取文本并存
    if (/\.docx/.test(raw)) {
      const txtCount = (raw.match(/wx_[a-z_]+\.txt/g) || []).length;
      assert.ok(txtCount > 0, `${name} 引用了 .docx（read 工具读不了），必须同时给一份抽取文本`);
    }
  }
});

test('INDEX.md 必须与脚本现算的结果一致（改了源文不重跑生成器 → 红灯）', () => {
  for (const target of TARGETS) {
    assert.ok(fs.existsSync(target.file), `源文件不存在：${target.file}`);
    const expected = buildIndex(target);
    const actual = fs.readFileSync(target.out, 'utf8');
    assert.equal(actual, expected, `${path.basename(target.out)} 与源文不一致：跑 \`node skills/scripts/gen-index.mjs\` 重新生成`);
  }
});

test('索引里的行号必须真的落在章节标题上（索引不能只是好看）', () => {
  for (const target of TARGETS) {
    const lines = fs.readFileSync(target.file, 'utf8').split('\n');
    const index = fs.readFileSync(target.out, 'utf8');
    const rows = [...index.matchAll(/^\| 第(\d+)章 \| (.*?) \| (\d+)–(\d+) \|/gm)];
    assert.ok(rows.length >= 16, `${path.basename(target.out)} 只解析出 ${rows.length} 章`);
    for (const [, , , start, end] of rows) {
      const head = lines[Number(start) - 1] || '';
      assert.match(head, /第[一二三四五六七八九十百零〇\d]+章/, `第 ${start} 行不是章节标题：「${head.slice(0, 40)}」`);
      assert.ok(Number(end) <= lines.length, `行号 ${end} 超出文件长度`);
    }
  }
});

test('源文里真实的缺陷必须在索引里如实声明（不许藏）', () => {
  const design = fs.readFileSync(path.join(SKILLS, 'wanxiang-design', 'INDEX.md'), 'utf8');
  // 平面文档实测：第 4 章重号（"全域色彩美学引擎" 与 "设计生成基本范式与核心模板库"）
  assert.match(design, /章号重复.*第 4 章/, '第 4 章重号这件事必须写出来，否则引用时指不清是哪一章');
  const portrait = fs.readFileSync(path.join(SKILLS, 'wanxiang-portrait', 'INDEX.md'), 'utf8');
  // 人物源文实测：35 处【旧版补充】块位置错乱 + 3 处断句残片
  assert.match(portrait, /【旧版补充】块位置错乱.*共 35 处/s, '补充块错位要如实说（读到"顺序怪"的内容时才知道为什么）');
  assert.match(portrait, /断句残片.*3 处/s, '断句残片要标出来，别让残片冒充原文');
});

test('SKILL.md 不得再出现被实测推翻的旧说法', () => {
  const design = readSkill('wanxiang-design');
  // 实测：16 个编号（第 4 章重号 → 17 个标题）、3.8 万字。旧文案写的 18 章 / 8.2 万字是错的。
  assert.ok(!/18\s*章/.test(design), '“18 章”与实测不符（实测 17 个章标题、16 个编号）');
  assert.ok(!/8\.2\s*万字/.test(design), '“8.2 万字”与实测不符（实测约 3.8 万字）');
  assert.ok(!/4\.7\s*万字/.test(design), '“4.7 万字”不是实测值');
  // 必须指向可读文本而不是那个二进制 docx
  assert.match(design, /wx_design_full\.txt/, '必须给出可 read 的抽取文本');
  assert.match(design, /INDEX\.md/, '必须指向章节索引（否则"读对应章节"没法执行）');
  const portrait = readSkill('wanxiang-portrait');
  assert.match(portrait, /INDEX\.md/, '必须指向章节索引');
  assert.match(portrait, /wx_full\.txt/);
});

