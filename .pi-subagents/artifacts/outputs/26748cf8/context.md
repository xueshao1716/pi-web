# Code Context

## Files Retrieved
1. `frontend/index.html` (lines 1-19) - viewport meta 已有 `viewport-fit=cover`，但没有任何 IME/interactive-widget 策略。
2. `frontend/src/styles.css` (lines 5-16, 146-155) - `html, body, #root { height: 100%; }`；无 `dvh`、VisualViewport 或键盘高度变量。
3. `frontend/src/AppLayout.tsx` (lines 66-74, 180-235) - 桌面壳和移动根容器都使用 UnoCSS `h-screen`（即 `100vh`）；移动端底部 TabBar 也在该固定高度 flex 树内。
4. `frontend/src/components/ChatArea.tsx` (lines 617-760) - ChatArea 是正确的 column flex；消息区滚动、输入栏 `flex-shrink-0`，输入栏本身不是 fixed/absolute。
5. `frontend/src/components/SendBox.tsx` (lines 250-337) - 实际 textarea 位于正常文档流，没有键盘/viewport 监听。
6. `frontend/src/main.tsx` (lines 1-15) - 应用入口；目前没有安装 viewport 同步逻辑。
7. `app/src-tauri/gen/android/app/src/main/AndroidManifest.xml` (lines 12-29) - Activity 未声明 `android:windowSoftInputMode`，只能依赖系统 `adjustUnspecified` 推断。
8. `app/src-tauri/gen/android/app/src/main/java/com/yuanshu/app/MainActivity.kt` (lines 1-34) - `onCreate` 在 `super.onCreate` 前调用 `enableEdgeToEdge()`，但没有处理/转发 IME WindowInsets。
9. `app/src-tauri/gen/android/app/src/main/res/values/themes.xml` (lines 1-7) - 普通 NoActionBar 主题，无软键盘/窗口 inset 配置。
10. `app/src-tauri/gen/android/app/src/main/res/values-night/themes.xml` (lines 1-7) - 夜间主题同样无相关配置。

## Key Code

### 直接证据

```tsx
// frontend/src/AppLayout.tsx:68-73
<div className="h-screen flex flex-col relative overflow-hidden">
  <TitleBar />
  <div className="flex-1 flex min-h-0">{children}</div>
</div>
```

```tsx
// frontend/src/AppLayout.tsx:181-184
if (isMobile) {
  return (
    <div className="h-screen flex flex-col text-pi-text relative"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
```

`h-screen` 是固定 `100vh`。Android WebView 打开 IME 时，即使 visual viewport 变矮，layout viewport/`100vh` 往往仍保持原高度；根节点又 `overflow-hidden`，于是整棵 flex 布局没有可缩小的高度，最底部输入栏留在键盘下面。

```tsx
// frontend/src/components/ChatArea.tsx:674-675, 755-759
<div className="flex-1 min-h-0 overflow-y-auto ...">...</div>
...
<div className="... flex-shrink-0">
  <SendBox ... />
</div>
```

这段布局本身是合理的：只要祖先高度真的随可见区域缩小，消息区会收缩，输入栏会自然上移。因此不应优先把输入栏改成 `position: fixed/sticky`；那会制造新的 safe-area、滚动和叠层问题。

```xml
<!-- app/src-tauri/gen/android/app/src/main/AndroidManifest.xml:17-22 -->
<activity
    android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
    android:launchMode="singleTask"
    android:name=".MainActivity"
    android:exported="true">
```

缺少 `android:windowSoftInputMode="adjustResize"`。当前行为是 `adjustUnspecified`，不同 Android/WebView/OEM 可能选择 resize 或 pan，不能作为聊天应用的可靠契约。

```kotlin
// app/src-tauri/gen/android/app/src/main/java/com/yuanshu/app/MainActivity.kt:13-16
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
```

`enableEdgeToEdge()` 使 decor content 延伸到 system bars（本质上令 decor 不再按传统 system window inset 自动裁剪）。代码仅用 CSS `safe-area-inset-*` 处理状态栏/导航栏，却没有原生 `WindowInsetsCompat.Type.ime()` 处理。edge-to-edge 下只写 `adjustResize` 未必能让 WebView 容器获得传统意义上的稳定 resize，尤其在 Android 15 强制 edge-to-edge/OEM WebView 差异下。

```html
<!-- frontend/index.html:5 -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

viewport meta 对 notch/system bars 是合理的，但它不会自动修正固定 `100vh`。代码库检索结果：`frontend/src` 中无 `visualViewport`、`100dvh`、`dvh`、`svh` 或 viewport CSS 变量。

## Architecture

### 三层影响必须分开看

1. **Android window / adjustResize 层**
   - Manifest 没有显式 `adjustResize`，严重度 **P0 / 高**。
   - 若系统实际 resize Activity/WebView 窗口，Web 页面才有机会获得更小的 viewport；`adjustUnspecified` 在设备间不可靠。

2. **edge-to-edge / WindowInsets 层**
   - MainActivity 主动 `enableEdgeToEdge()`，严重度 **P0 / 高（与上一项组合触发）**。
   - edge-to-edge 并不等于“键盘覆盖一定发生”，但它取消传统 decor fitting 后，应用必须明确消费 system bar/IME insets。当前只有网页 safe-area padding，没有原生 IME inset 处理。
   - 因而准确根因不是单一一行，而是：**主动 edge-to-edge + 未显式 resize/未消费 IME inset，导致 WebView 可布局窗口不稳定地保持全屏**。

3. **Web viewport / React CSS 层**
   - 移动根容器固定 `h-screen`/`100vh`，且没有 VisualViewport 同步，严重度 **P0 / 高**。
   - 即便 WebView 暴露了变小的 visual viewport，`100vh` 仍可能取 layout viewport；React flex 树不会收缩。ChatArea 输入栏只是正常流末端，因此被覆盖。
   - `viewport-fit=cover` 只提供 safe-area 语义，不负责 IME。

### 根因排序

1. **P0：移动根布局 `h-screen` (`100vh`) 锁定 layout viewport，且无 VisualViewport/dvh 适配。** 这是前端层最直接、可由代码确定的遮挡机制。
2. **P0：MainActivity 开启 edge-to-edge，却没有 IME WindowInsets 处理；Manifest 又未显式 `adjustResize`。** 两者组合令 WebView 是否缩小依赖 Android/WebView/OEM 默认行为。
3. **P1：底部 TabBar 与 ChatArea 同处固定高度 flex 根；键盘出现时它也占据底部空间。** 根高度修好后它会整体上移；若产品希望键盘时隐藏 TabBar，可另做 UX 优化，但不是首要根因。
4. **非根因：ChatArea/SendBox 定位。** 输入栏不是 fixed/absolute，flex 配置正确；不要用再加 bottom offset 的方式治标。
5. **非根因：缺少 viewport meta。** meta 已存在且含 `viewport-fit=cover`；问题是缺少动态可见高度策略，不是 meta 完全缺失。

## 建议修改（最小可靠方案）

### 首选：原生确定 resize + 前端使用动态高度（两处修改）

1. 在 Activity 声明显式软键盘模式：

```xml
android:windowSoftInputMode="adjustResize"
```

2. 移动根容器不要使用 `h-screen`。改为专用类，例如：

```css
.mobile-app-root { height: 100vh; height: 100dvh; }
```

并将 `AppLayout.tsx:183` 的 `h-screen` 换成该类。`100vh` 是旧 WebView fallback，后写的 `100dvh` 用于现代 WebView。桌面 `ShellFrame` 可保留 `h-screen`，避免扩大改动面。

### edge-to-edge 的可靠选择

- **最小、最稳、适合先修 bug：Android 端移除 `enableEdgeToEdge()`，配合显式 `adjustResize`。** 系统恢复传统 decor fitting，WebView 高度随 IME 缩小；网页继续用 safe-area 不会有功能损失，只是失去内容延伸到系统栏下方的视觉。
- 如果必须保留 edge-to-edge：不要只赌 `adjustResize`。在 MainActivity/WebView 容器上用 `WindowInsetsCompat` 监听 `Type.ime() | Type.systemBars()`，把 IME bottom inset 应用为容器 padding/高度，并谨慎避免与 CSS `env(safe-area-inset-bottom)` 双算。此方案原生代码更多，不属于“最小修复”。

### VisualViewport 兜底（建议仅在真机证明仍需时加入）

若某些 Tauri/Android WebView 在显式 `adjustResize` 后仍保持 layout viewport，可在入口安装监听，将 `visualViewport.height` 写入 `--app-height`，移动根用 `height: var(--app-height, 100dvh)`；同时监听 `resize` 和 `scroll`，卸载时清理。它是 Web 层跨 OEM 兜底，不应替代 Manifest 契约。注意 VisualViewport 的 `offsetTop`（浮动键盘/缩放）和 px 四舍五入，不能只算 `innerHeight - visualViewport.height` 后盲目加 padding。

不建议把 `interactive-widget=resizes-content` 作为唯一修复：Android WebView 版本支持存在差异，并且无法弥补 edge-to-edge 原生窗口未处理；最多可作为现代 Chromium 的附加提示。

## 真实设备验证清单

1. 至少覆盖 Android 10/11 与 Android 14/15；优先一台原生系（Pixel）+ 一台强定制 OEM（小米/华为/OPPO）。记录 Android System WebView 版本。
2. 冷启动 APK，进入有长消息的 chat；点击 textarea。验收：输入框完整位于 IME 上沿之上，发送按钮可点，TabBar 不与输入栏重叠。
3. 用 ADB 截图/录屏对比键盘前后；若可远程调试，记录：`window.innerHeight`、`document.documentElement.clientHeight`、`visualViewport.height/offsetTop`、移动根 `getBoundingClientRect().height`。键盘后移动根高度应接近可见高度。
4. 分别测试 Gboard 全键盘、数字/符号页、语音栏/候选栏展开；IME 高度变化时输入栏持续贴上沿。
5. 测试横屏打开键盘、键盘已打开时旋转、分屏/自由窗口；消息区应缩小并可滚动，而不是整页被 pan 到头部消失。
6. 测试手势导航与三键导航；关闭键盘后 bottom safe area 恢复，不能残留一块“键盘高度”空白。
7. 测试 textarea 多行增长到上限、附件/参数菜单，以及回到底部按钮；均不能被键盘遮挡。
8. 测试登录页/设置页其他输入框，确认移除 edge-to-edge 或根高度变化没有造成状态栏遮挡。
9. ADB 辅助检查：`adb shell dumpsys window | grep -i -E "mCurrentFocus|ime|softInputMode"`，确认 Activity softInputMode 为 resize；不要仅凭模拟器 Chrome DevTools responsive mode 判定通过。
10. 回归桌面 Tauri 和普通手机浏览器/PWA：桌面壳高度、标题栏、TabBar safe area 均应保持原样。

## Residual Risks

- 未连接真实 Android 设备，本报告是静态代码证据与 Android/WebView 行为推导，尚不能证明具体目标手机当前选择的是 pan、overlay 还是仅 visual viewport resize。
- Android 15 edge-to-edge、不同 Tauri/AndroidX 版本和 OEM WebView 对 `adjustResize` 的组合行为可能不同；若保留 edge-to-edge，必须真机测 IME WindowInsets。
- `100dvh` 在较旧 WebView 的 IME 语义不完全一致，因此保留 `100vh` fallback，并以 VisualViewport 作为按证据启用的兜底。
- TabBar 键盘时是否隐藏属于产品决策；布局正确并不代表最佳交互。

## Start Here

先打开 `frontend/src/AppLayout.tsx` lines 180-235：这里的移动端 `h-screen` 是最直接的 Web 层锁高点。随后同时核对 `MainActivity.kt` lines 13-16 和 Manifest lines 17-22；这三处共同决定 IME 是否能让 ChatArea 的正常 flex 输入栏上移。

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "review-findings 给出 frontend/src/AppLayout.tsx、ChatArea.tsx、styles.css、frontend/index.html 及 Android MainActivity/Manifest/theme 的具体路径、行号、P0/P1 严重度；residual-risks 单列真机与版本风险。"
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "targeted find/read/grep over frontend/src and app/src-tauri/gen/android",
      "result": "passed",
      "summary": "确认移动根为 h-screen，ChatArea 输入栏为正常 flex 流，未发现 VisualViewport/dvh；Manifest 无 windowSoftInputMode，MainActivity 启用 edge-to-edge 且无 IME inset 处理。"
    },
    {
      "command": "git status --short",
      "result": "passed",
      "summary": "调查前已存在多项工作区改动；本任务未修改源码，仅写指定调查产物。"
    }
  ],
  "validationOutput": [
    "静态证据链完整：Android 窗口策略、edge-to-edge、Web visual/layout viewport 三层已分别检查。",
    "未进行真实设备验证；已提供可执行的真机/ADB 验证清单。"
  ],
  "residualRisks": [
    "无真机连接，目标设备实际 IME resize/pan/overlay 模式尚待测量。",
    "保留 edge-to-edge 时 Android 15/OEM WebView 可能仍需显式消费 IME WindowInsets。",
    "旧 WebView 对 100dvh 的 IME 行为存在版本差异，必要时需 VisualViewport 兜底。"
  ],
  "noStagedFiles": true,
  "diffSummary": "只读调查；未修改任何项目文件。仅生成指定 context.md 调查报告。",
  "reviewFindings": [
    "blocker/P0: frontend/src/AppLayout.tsx:183 - 移动根使用 h-screen/100vh，IME 只缩 visual viewport 时 flex 树仍保持全屏高度。",
    "blocker/P0: app/src-tauri/gen/android/app/src/main/AndroidManifest.xml:17-22 - Activity 未显式声明 adjustResize，行为依赖系统/OEM 推断。",
    "blocker/P0: app/src-tauri/gen/android/app/src/main/java/com/yuanshu/app/MainActivity.kt:13-16 - enableEdgeToEdge 后未消费 IME WindowInsets，WebView 容器缺少稳定避让契约。",
    "info: frontend/src/components/ChatArea.tsx:674-759 - 消息区 flex 收缩与输入栏 flex-shrink-0 结构正确，输入栏自身不是根因。",
    "info: frontend/index.html:5 - viewport-fit=cover 已存在，但不能解决固定 100vh/IME。"
  ],
  "manualNotes": "建议先用移除 enableEdgeToEdge + Manifest adjustResize + 移动根 100dvh 的最小组合打测试 APK；真机若仍异常，再加 VisualViewport 或原生 IME WindowInsets，而不是把输入框改 fixed。"
}
```
