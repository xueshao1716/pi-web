import { buildTokens, hexToHsl, SEED_PRESETS } from './theme.js';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

const t1 = buildTokens('#6750A4', false);
assert(t1['--tf-primary'].startsWith('hsl('), '浅色 primary 是 hsl 串');
const t2 = buildTokens('#6750A4', true);
assert(t2['--tf-surface'] !== t1['--tf-surface'], '明暗两套 surface 不同');
assert(!!t1['--tf-error'] && !!t2['--tf-error'], 'error 色存在');

// 主题一致性：primary 色相应跟种子色相走（±8 容差）
const seedH = hexToHsl('#E8683A').h;
const orange = buildTokens('#E8683A', false);
const pH = hexToHsl(orange['--tf-primary']).h;
const diff = Math.min(Math.abs(pH - seedH), 360 - Math.abs(pH - seedH));
assert(diff <= 8, `primary 色相跟随种子 (seed=${Math.round(seedH)}, primary=${Math.round(pH)})`);

// 非法输入兜底
assert(hexToHsl('not-a-color').h === 262, '非法色兜底默认紫');
assert(SEED_PRESETS.length === 6, '预设 6 个');
console.log('theme.js 测试完成');
