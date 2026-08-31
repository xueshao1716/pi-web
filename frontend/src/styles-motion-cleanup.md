# 动画白名单（按 RuiRui 原则：静态远多于运动）

## 保留的动画（仅 5 个关键点）

1. **页面切换** - `.page-enter` (300ms)
   - 理由：视觉连续性，用户需要知道进入了新页面

2. **Agent 状态变化** - `.status-dot` 脉动（新建）
   - 理由：核心功能状态，必须可见

3. **用户输入反馈** - 按钮 `:active` 状态 (150ms)
   - 理由：直接操作反馈，不能没有

4. **流式文本** - `.streaming-caret` 光标闪烁
   - 理由：告知用户正在生成内容

5. **Modal/Toast 进入** - `.anim-modal`, `.anim-toast` (200ms)
   - 理由：突然出现的遮罩需要缓冲

## 删除的动画（所有装饰性运动）

- ❌ `.anim-enter` - 每个元素淡入上浮
- ❌ `.card-hover` - 卡片悬浮抬升
- ❌ `hover:scale-105` - 所有放大效果
- ❌ `.anim-enter-delay-*` - 列表逐项飞入
- ❌ `.hov-reveal` - 悬停显示时间戳
- ❌ `shimmer`、`skeleton` 骨架屏动画
- ❌ `waveBar` 波浪加载条
- ❌ `toolslide` 工具卡展开动画
- ❌ 所有 `transition-all`（改为具体属性）

## 实施策略

1. 基础 reset：`* { transition: none }` （只在需要的地方加）
2. 删除 CSS 中的装饰性 keyframes
3. 删除组件中的 `.anim-enter` 类名
4. 只保留白名单中的 5 个动画
