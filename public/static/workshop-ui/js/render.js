// 界面工坊 · 组件渲染器
// 画布沙盒内的 M3E 风格组件绘制：只依赖 tokens CSS 变量 + 组件数据。
// 纯 DOM 生成，无框架。

export function renderComponent(comp, selected) {
  const el = document.createElement('div');
  el.className = 'comp' + (selected ? ' selected' : '');
  el.dataset.id = comp.id;
  el.style.left = comp.x + 'px';
  el.style.top = comp.y + 'px';
  el.style.width = comp.w + 'px';
  el.style.height = comp.h + 'px';
  el.style.zIndex = '10';

  const body = document.createElement('div');
  body.className = 'comp-body';
  body.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:flex;align-items:center;justify-content:center;';
  el.appendChild(body);

  paint(comp, body);
  return el;
}

// 各类型的具体绘制（读 CSS 变量 → 内联样式，保证截图/导出一致）
function paint(comp, box) {
  const v = (name) => `var(${name})`;
  const t = comp.type;
  const label = comp.text || '';

  switch (t) {
    case 'button': {
      box.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;
        background:${v('--tf-primary')};color:${v('--tf-on-primary')};
        border-radius:999px;font-size:14px;font-weight:500;">${esc(label)}</div>`;
      break;
    }
    case 'fab': {
      box.innerHTML = `<div style="width:${comp.h}px;height:${comp.h}px;display:flex;align-items:center;justify-content:center;
        background:${v('--tf-primary-container')};color:${v('--tf-on-primary-container')};
        border-radius:${Math.round(comp.h * 0.28)}px;font-size:22px;">＋</div>`;
      break;
    }
    case 'input': {
      box.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;padding:0 14px;
        border:1px solid ${v('--tf-outline')};border-radius:8px;font-size:13px;color:${v('--tf-on-surface-var')};
        background:${v('--tf-surface-1')}">${esc(label)}</div>`;
      break;
    }
    case 'switch': {
      const on = comp.checked !== false;
      box.innerHTML = `<div style="display:flex;align-items:center;gap:8px">
        <div style="width:52px;height:32px;border-radius:999px;background:${on ? v('--tf-primary') : v('--tf-surface-2')};
          position:relative;transition:0.2s">
          <div style="position:absolute;top:4px;${on ? 'right:4px' : 'left:4px'};width:24px;height:24px;border-radius:50%;
            background:${on ? v('--tf-on-primary') : v('--tf-outline')};transition:0.2s"></div>
        </div></div>`;
      break;
    }
    case 'checkbox': {
      const on = comp.checked !== false;
      box.innerHTML = `<div style="width:22px;height:22px;border-radius:5px;border:2px solid ${on ? v('--tf-primary') : v('--tf-outline')};
        background:${on ? v('--tf-primary') : 'transparent'};color:${v('--tf-on-primary')};
        display:flex;align-items:center;justify-content:center;font-size:14px">${on ? '✓' : ''}</div>`;
      break;
    }
    case 'chip': {
      box.innerHTML = `<div style="height:32px;padding:0 14px;display:flex;align-items:center;gap:6px;
        border:1px solid ${v('--tf-outline')};border-radius:999px;font-size:12px;color:${v('--tf-on-surface-var')};
        background:${v('--tf-surface-2')}">${esc(label)}</div>`;
      break;
    }
    case 'slider': {
      const pct = comp.value != null ? comp.value : 50;
      box.innerHTML = `<div style="width:100%;display:flex;align-items:center">
        <div style="flex:1;height:6px;border-radius:3px;background:${v('--tf-surface-2')};position:relative">
          <div style="position:absolute;left:0;top:0;height:100%;width:${pct}%;border-radius:3px;background:${v('--tf-primary')}"></div>
          <div style="position:absolute;top:50%;transform:translate(-50%,-50%);left:${pct}%;width:20px;height:20px;border-radius:50%;background:${v('--tf-primary')}"></div>
        </div></div>`;
      break;
    }
    case 'text': {
      box.innerHTML = `<div style="width:100%;text-align:${comp.align || 'left'};font-size:15px;color:${v('--tf-on-surface')};
        overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(label)}</div>`;
      break;
    }
    case 'card': {
      box.innerHTML = `<div style="width:100%;height:100%;background:${v('--tf-surface-1')};border-radius:14px;
        padding:16px;display:flex;flex-direction:column;gap:6px">
        <div style="font-size:14px;font-weight:600;color:${v('--tf-on-surface')}">${esc(label)}</div>
        <div style="font-size:12px;color:${v('--tf-on-surface-var')}">${esc(comp.desc || '卡片描述文字')}</div>
        </div>`;
      break;
    }
    case 'list': {
      box.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;gap:12px;padding:0 16px;
        background:${v('--tf-surface')};border-radius:8px">
        <div style="width:36px;height:36px;border-radius:50%;background:${v('--tf-primary-container')}"></div>
        <div style="flex:1">
          <div style="font-size:14px;color:${v('--tf-on-surface')}">${esc(label)}</div>
          <div style="font-size:11px;color:${v('--tf-on-surface-var')}">${esc(comp.desc || '辅助文字')}</div>
        </div></div>`;
      break;
    }
    case 'navbar': {
      box.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;padding:0 16px;gap:12px;
        background:${v('--tf-surface')}">
        <span style="color:${v('--tf-on-surface')};font-size:18px">←</span>
        <span style="font-size:16px;font-weight:500;color:${v('--tf-on-surface')}">${esc(label || '页面标题')}</span></div>`;
      break;
    }
    case 'navrail': {
      const items = ['◎', '▤', '◈', '⚙'];
      box.innerHTML = `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;gap:22px;padding-top:24px;
        background:${v('--tf-surface')}">
        ${items.map((i, n) => `<div style="width:52px;height:32px;border-radius:999px;display:flex;align-items:center;justify-content:center;
          font-size:16px;background:${n === 0 ? v('--tf-secondary-container') || v('--tf-primary-container') : 'transparent'};
          color:${v('--tf-on-surface')}">${i}</div>`).join('')}</div>`;
      break;
    }
    case 'bottomnav': {
      const items = ['⌂', '♡', '◐', '⚙'];
      const labels = ['首页', '收藏', '发现', '我的'];
      box.innerHTML = `<div style="width:100%;height:100%;display:flex;background:${v('--tf-surface-1')}">
        ${items.map((i, n) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
          color:${n === 0 ? v('--tf-primary') : v('--tf-on-surface-var')}">
          <span style="font-size:18px">${i}</span>
          <span style="font-size:10px">${labels[n]}</span></div>`).join('')}</div>`;
      break;
    }
    case 'dialog': {
      box.innerHTML = `<div style="width:100%;height:100%;background:${v('--tf-surface-1')};border-radius:24px;padding:22px;
        display:flex;flex-direction:column;gap:10px">
        <div style="font-size:16px;font-weight:600;color:${v('--tf-on-surface')}">${esc(label || '对话框标题')}</div>
        <div style="font-size:12px;color:${v('--tf-on-surface-var')};flex:1">${esc(comp.desc || '对话框正文内容')}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <div style="padding:6px 12px;color:${v('--tf-primary')};font-size:13px">取消</div>
          <div style="padding:6px 12px;color:${v('--tf-primary')};font-size:13px">确定</div>
        </div></div>`;
      break;
    }
    case 'snackbar': {
      box.innerHTML = `<div style="width:100%;height:100%;background:${v('--tf-on-surface')};color:${v('--tf-surface')};
        border-radius:8px;display:flex;align-items:center;padding:0 14px;font-size:12px">${esc(label || '提示消息')}</div>`;
      break;
    }
    case 'progress': {
      box.style.cssText += `border-radius:50%;border:4px solid ${v('--tf-primary-container')};
        border-top-color:${v('--tf-primary')};animation:tf-spin 1s linear infinite;`;
      break;
    }
    case 'image': {
      box.innerHTML = `<div style="width:100%;height:100%;background:${v('--tf-surface-2')};border-radius:12px;
        display:flex;align-items:center;justify-content:center;color:${v('--tf-on-surface-var')};font-size:24px">🖼</div>`;
      break;
    }
    default:
      box.innerHTML = `<div style="color:#f66;font-size:11px">未知类型</div>`;
  }
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
