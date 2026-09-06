import { buildTokens, hexToHsl } from './theme.js';
import { createDoc, addComponent, moveComponent, removeComponent, activeScreen } from './state.js';
import { buildPrompt } from './prompt.js';

// theme
const light = buildTokens('#6750A4', false);
const dark = buildTokens('#E8683A', true);
console.assert(light['--tf-primary'] && light['--tf-primary'].startsWith('hsl'), 'light tokens fail');
console.assert(dark['--tf-surface'].startsWith('hsl'), 'dark tokens fail');
const hslIn = hexToHsl('hsl(120, 50%, 40%)');
console.assert(hslIn.h === 120 && hslIn.s === 50 && hslIn.l === 40, 'hsl parse fail: ' + JSON.stringify(hslIn));
console.assert(hexToHsl('#6750A4').h > 250 && hexToHsl('#6750A4').h < 270, 'hex hue fail');

// state
let doc = createDoc();
const s0 = activeScreen(doc).id;
doc = addComponent(doc, 'button', 10, 20);
doc = addComponent(doc, 'card', 10, 100);
let scr = activeScreen(doc);
console.assert(scr.components.length === 2, 'add fail');
const bid = scr.components[0].id;
doc = moveComponent(doc, bid, 50, 60);
console.assert(activeScreen(doc).components[0].x === 50, 'move fail');
doc = removeComponent(doc, bid);
console.assert(activeScreen(doc).components.length === 1, 'remove fail');

// prompt
const p = buildPrompt(doc);
console.assert(p.includes('Material 3 Expressive') && p.includes('卡片'), 'prompt fail');
console.assert(p.includes('种子色：#6750A4'), 'prompt seed fail');

console.log('ALL TESTS PASSED');
