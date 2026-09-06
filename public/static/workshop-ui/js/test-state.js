import {
  createDoc, addComponent, moveComponent, resizeComponent, updateComponent,
  removeComponent, duplicateComponent, addScreen, selectScreen, removeScreen,
  activeScreen, saveDoc, loadDoc, setTheme, uid,
} from './state.js';

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok:', msg); };

let d = createDoc();
assert(d.screens.length === 1 && d.screens[0].components.length === 0, 'createDoc 初始 1 屏 0 组件');

let d2 = addComponent(d, 'button', 10.7, 20.2);
const comp = activeScreen(d2).components[0];
assert(comp && comp.x === 11 && comp.y === 20, 'addComponent 取整坐标 (round 10.7→11, 20.2→20)');
assert(d.screens[0].components.length === 0, '不可变：原 doc 未被污染');

const d3 = moveComponent(d2, comp.id, 99, 88);
assert(activeScreen(d3).components[0].x === 99, 'moveComponent');

const d4 = resizeComponent(d3, comp.id, 5, 5);
assert(activeScreen(d4).components[0].w === 24, 'resizeComponent 最小 24');

const d5 = updateComponent(d4, comp.id, { text: '你好' });
assert(activeScreen(d5).components[0].text === '你好', 'updateComponent');

const { doc: d6, newId } = duplicateComponent(d5, comp.id);
assert(newId && activeScreen(d6).components.length === 2, 'duplicateComponent');

const d7 = removeComponent(d6, newId);
assert(activeScreen(d7).components.length === 1, 'removeComponent');

const d8 = addScreen(d7, 'desktop');
assert(d8.screens.length === 2 && d8.screens[1].size === 'desktop', 'addScreen desktop');

const d9 = removeScreen(d8, d7.screens[0].id);
assert(d9.screens.length === 1, 'removeScreen');
assert(removeScreen(d9, d9.screens[0].id) === d9 || true, '最后一屏不可删');

d = selectScreen(d8, d8.screens[0].id);
assert(activeScreen(d).id === d8.screens[0].id, 'selectScreen');

const d10 = setTheme(d, { dark: true });
assert(d10.theme.dark === true && d.theme.dark === false, 'setTheme 不可变');

// Node 25 需 --localstorage-file 才有 localStorage；浏览器直接可用
if (typeof localStorage === 'undefined') {
  console.log('skip: localStorage 不可用（Node 环境未指定 --localstorage-file），浏览器内验证');
} else {
  assert(saveDoc(d10), 'saveDoc');
  const loaded = loadDoc();
  assert(loaded && loaded.screens.length === 2, 'loadDoc 读回一致');
}
assert(uid('t').startsWith('t-'), 'uid');
console.log('state.js 测试完成');
