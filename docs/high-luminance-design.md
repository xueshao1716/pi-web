# 高亮低饱和设计 - 完整改造记录

> 按 RuiRui Agent UI 研究报告重新设计 pi-web 界面
> 从"深色荧光渐变风格"改为"银灰精密工具风格"

## 设计目标

**核心方向**：去掉"AI 聊天模板味"，建立精密工具感

参考依据：
- `D:/pi-workspace/研究/元枢同名项目-RuiRui/分析.md`
- AgentCore OKLCH 体系
- 精密工具界面设计原则

**RuiRui 研究报告关键数据**：
- 平均明度 0.877，约 82.6% 高亮像素
- 平均饱和度 0.026（极低）
- 动画高度集中，静态远多于运动
- 阶段式揭示，不靠持续漂浮产生高级感

---

## 改造内容（7 个提交）

### 1. 高亮低饱和 Token 系统 (`9c4499c`)

**新增 `highLum` 主题**（银灰风格，作为默认主题）：

```typescript
colors = {
  // 背景分层（OKLCH 明度递增）
  bg: '#f5f6f8',      // oklch(0.96 0.005 240) 近白背景
  bg1: '#f9fafb',     // oklch(0.98 0.003 240) 卡片更亮
  bg2: '#fcfcfd',     // oklch(0.99 0.002 240) 弹层最亮
  bg3: '#ffffff',     // 纯白（极少用）
  
  // 边框（银灰，低对比）
  border: '#dfe1e6',     // oklch(0.88 0.008 240)
  borderSoft: '#e8eaed', // oklch(0.91 0.006 240)
  
  // 文字（深灰到中灰，避免纯黑）
  text: '#2f3542',       // oklch(0.25 0.015 240)
  dim: '#6b7280',        // oklch(0.50 0.012 240)
  dim2: '#9ca3af',       // oklch(0.65 0.010 240)
  
  // 强调色（低饱和蓝，不是荧光）
  accent: '#5b7fb8',     // oklch(0.58 0.08 240) 克制的蓝
}
```

**关键改变**：
- 从深色底改为近白底（明度 0.96）
- 品牌蓝饱和度从 0.2+ 降到 0.08
- 删除所有光斑色（glowPurple、glowCyan）

---

### 2. 删除装饰性渐变和玻璃 (`5dfcf17` + `3f6838e`)

**删除的装饰效果**：
- ❌ Logo 渐变 → 实底圆形
- ❌ 头像渐变 → 实底方块
- ❌ 工具图标渐变 → 实底彩色块
- ❌ 欢迎页背景光晕 → 删除
- ❌ 移动底栏玻璃模糊 → 实底
- ❌ 弹窗遮罩模糊 → 实底
- ❌ ChatArea/SendBox backdrop-filter → 删除

**改动文件**：
- `AppLayout.tsx` - Logo、移动底栏
- `Message.tsx` - 头像、工具图标
- `ChatArea.tsx` - 背景光晕
- `SendBox.tsx` - 输入框玻璃

---

### 3. 动画大扫除 (`509f319`) ⭐⭐

**设计原则**："静态远多于运动"

**白名单（仅保留 5 个动画）**：
1. `.page-enter` - 页面转场（300ms）
2. `.status-dot` - Agent 状态点脉动
3. `.press:active` - 按钮按下反馈（150ms）
4. `.streaming-caret` - 文本生成光标闪烁
5. `.anim-modal` / `.anim-toast` - 模态框/提示条入场（200ms）

**删除的装饰动画**（~50+ 处）：
- ❌ `.anim-enter` / `.anim-fade` / `.anim-enter-delay-*` - 元素飞入
- ❌ `.card-hover` / `.welcome-card` - 卡片悬浮抬升
- ❌ `shimmer` / `skeletonShimmer` - 加载骨架屏微光
- ❌ `glow-edge` / `toolslide` - 装饰性发光
- ❌ `typewriter` - 打字机效果
- ❌ `.hov-reveal` 改为直接显示（不淡入）

**技术手段**：
- 删除 CSS 中所有 `@keyframes`
- 用 `sed` 批量删除 `.tsx` 文件中的动画类名
- 界面从"时刻在动"变为"安静克制"

---

### 4. Agent 工作流时间轴 (`d5b8537`) ⭐⭐⭐

**核心价值**：让用户看到 Agent 在做什么（阶段式可视化）

**新增 `AgentWorkflow` 组件**：

```tsx
<AgentWorkflow 
  phase="thinking" | "tools" | "result" | "idle"
  thinking={boolean}
  toolsRunning={number}
  toolsTotal={number}
/>
```

**横向 3 段式时间轴**：
1. **思考** - 有 `msg.think` 但无工具和文本 → 脑图标脉动
2. **工具** - 有运行中的工具 → 扳手图标脉动 + 进度（n/total）
3. **生成** - 开始输出文本 → 勾图标点亮

**阶段判断逻辑**（在 `Message.tsx`）：
```tsx
const hasThinking = !!msg.think
const hasTools = (msg.tools?.length || 0) > 0
const hasText = !!msg.text
const runningTools = msg.tools?.filter(t => t.status === 'running').length || 0

let phase: 'thinking' | 'tools' | 'result' | 'idle' = 'idle'
if (streaming) {
  if (hasThinking && !hasTools && !hasText) phase = 'thinking'
  else if (hasTools && runningTools > 0) phase = 'tools'
  else if (hasText) phase = 'result'
}
```

**替代了**：通用 spinner（转圈，看不到在干什么）

---

### 5. 视觉层级重构 (`467d45f`) ⭐

**设计原则**："层级靠 OKLCH 明度递增，不靠渐变和玻璃"

**删除的装饰效果**：
- ❌ `.glass-strong` 的 `backdrop-filter: blur(28px)` → 实底 `bg-pi-bg1`
- ❌ `.stat-card` 的渐变背景和径向光晕 → 实底 + 浅边框
- ❌ `.glass-hi` 的重阴影 `shadow-lg` → 极浅边框
- ❌ `.panel` 从 `glass-hi` 改为 `bg-pi-bg1 + border-pi-border-soft`

**改为明度阶梯表达**：
```
bg (0.96) → bg1 (0.98) → bg2 (0.99) → bg3 (1.0)
        +0.02      +0.01       +0.01
```

**改动位置**：
- `styles.css` - `.glass`、`.glass-strong`、`.glass-hi`、`.stat-card`
- `uno.config.ts` - `panel` / `card` 快捷类

**保留**：功能性边框（图片、文件、信息提示）不变

---

### 6. 组件形态重构 (`9cb931b`) ⭐

**设计原则**："紧凑精密工具风格，提升信息密度"

**间距收紧**：

| 组件 | 旧值 | 新值 |
|------|------|------|
| 消息间距 | `py-3` | `py-2` |
| 消息内边距 | `px-4 py-2.5` | `px-3.5 py-2` |
| 工具卡片 | `my-2.5 px-3 py-2` | `my-2 px-2.5 py-1.5` |
| SendBox | `px-4 pt-2.5` | `px-3 pt-2` |
| ChatArea | `px-6 py-4` | `px-4 py-3` |
| 面板内边距 | `!p-4` | `!p-3` |
| 通用按钮 | `px-3 py-1.5` | `px-2.5 py-1` |

**改动文件**：
- `Message.tsx` - 消息和工具卡片
- `SendBox.tsx` - 输入框
- `ChatArea.tsx` - 聊天区
- `uno.config.ts` - 按钮快捷类
- 批量替换 10 个文件的 `panel !p-4` → `panel !p-3`

---

## 对比总结

### 旧版（深色渐变风格）
- 🎨 **配色**：黑底 + 荧光渐变 + 玻璃模糊
- 🎬 **动画**：到处都在动（飞入、悬浮、流光）
- ⏳ **进度**：转圈 spinner（看不到在干什么）
- 📐 **层次**：边框 + 重阴影 + 玻璃模糊
- 📏 **间距**：松散（社交聊天风格）
- 🏷️ **标签**：深色 AI 聊天模板

### 新版（高亮低饱和精密工具风格）
- 🎨 **配色**：银灰实底 + OKLCH 层级
- 🎬 **动画**：静态为主（5 个关键动画）
- ⏳ **进度**：工作流时间轴（思考→工具→生成）
- 📐 **层次**：明度递增（0.96→0.98→0.99→1.0）
- 📏 **间距**：紧凑（精密工具风格）
- 🏷️ **标签**：精密工具 / 专业控制台

---

## 技术实现细节

### OKLCH 色彩体系

```css
/* 明度阶梯（L 值递增） */
--pi-bg:   oklch(0.96 0.005 240);  /* 基底 */
--pi-bg1:  oklch(0.98 0.003 240);  /* 卡片 */
--pi-bg2:  oklch(0.99 0.002 240);  /* 弹层 */
--pi-bg3:  oklch(1.00 0.000 0);    /* 纯白 */

/* 饱和度极低（C 值 < 0.01） */
--pi-border-soft: oklch(0.91 0.006 240);
--pi-border:      oklch(0.88 0.008 240);

/* 强调色克制（C 值 = 0.08） */
--pi-accent: oklch(0.58 0.08 240);
```

### 动画白名单实现

```css
/* 1. 页面转场 */
@keyframes page-enter {
  from { opacity: 0; transform: translateY(8px); }
}
.page-enter { animation: page-enter 0.3s ease-out; }

/* 2. 状态点脉动 */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.status-dot { animation: pulse 2s ease-in-out infinite; }

/* 3. 按钮按下 */
.press:active { transform: scale(0.98); }

/* 4. 文本生成光标 */
.streaming-caret::after {
  content: "▍";
  animation: blink 1.2s step-end infinite;
}

/* 5. 模态框入场 */
.anim-modal { animation: modal-in 0.2s ease-out; }
```

### 工作流组件架构

```
Message.tsx
  ├─ 计算当前阶段（thinking / tools / result）
  ├─ 仅在流式时显示 <AgentWorkflow>
  └─ 静态消息不显示

AgentWorkflow.tsx
  ├─ 3 个阶段图标（Brain / Wrench / CheckCircle）
  ├─ 横向连接线（根据阶段高亮）
  ├─ 当前阶段脉动动画
  └─ 工具阶段显示进度（n/total）
```

---

## 验收清单

### 视觉验收
- [ ] 打开 `http://127.0.0.1:8787/`
- [ ] 检查默认主题是否为银灰高亮风格
- [ ] 检查 Logo 是否为实底圆形（无渐变）
- [ ] 检查消息头像是否为实底方块（无渐变）
- [ ] 检查是否无装饰性飞入动画
- [ ] 检查卡片悬浮是否只改边框色（无抬升）
- [ ] 检查面板是否为实底 + 浅边框（无玻璃模糊）

### 功能验收
- [ ] 发送消息，检查 Agent 工作流时间轴
  - [ ] 思考阶段：脑图标脉动
  - [ ] 工具阶段：扳手图标脉动 + 进度
  - [ ] 生成阶段：勾图标点亮
- [ ] 检查工具卡片展开/收起正常
- [ ] 检查输入框、按钮、面板交互正常
- [ ] 检查移动端布局正常（375px / 768px）

### 性能验收
- [ ] 页面加载时无明显卡顿
- [ ] 动画流畅（60fps）
- [ ] Bundle 大小合理（< 1.1MB）

---

## 分支信息

- **功能分支**：`feat/high-luminance-design`
- **基于版本**：`main` (提交 `3df987e`)
- **备份标签**：`v1.0-ui-refined`（旧版深色渐变）
- **提交数量**：7 个
- **改动文件**：~120 个（含前端产物）
- **核心文件**：
  - `frontend/src/theme/tokens.ts` - Token 系统
  - `frontend/src/styles.css` - 全局样式
  - `frontend/src/components/Message.tsx` - 消息组件
  - `frontend/src/components/AgentWorkflow.tsx` - 工作流组件（新增）
  - `frontend/uno.config.ts` - UnoCSS 配置

---

## 下一步

### 如果效果满意
1. 运行测试：`npm test`
2. 运行 TypeScript 检查：`npm run check`
3. 浏览器多设备验收
4. 合并到 main：`git checkout main && git merge feat/high-luminance-design`
5. 双推远程：`git push origin main && git push gitee main`

### 如果需要调整
1. 在当前分支继续调整
2. 提交新的改动
3. 重新验收

### 如果要回退
```bash
git checkout main
git branch -D feat/high-luminance-design
git checkout -b feat/high-luminance-design v1.0-ui-refined
```

---

## 参考文档

- RuiRui 研究报告：`D:/pi-workspace/研究/元枢同名项目-RuiRui/分析.md`
- AgentCore 设计体系：`D:/pi-workspace/文档/AgentCore-外观设计研究报告.md`
- UI 系统精修笔记：`D:/pi-workspace/文档/pi-web-UI系统精修实践笔记.md`

---

**设计完成日期**：2026-09-01  
**设计师**：小语  
**审核状态**：待用户验收
