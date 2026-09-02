# 元枢 Android 真机验收清单

> 目的：验证 Tauri Android WebView 的软键盘 inset 修复、远程服务器连接和统一 React 产物。没有 Android 真机或 ADB 时，不得把本清单标记为通过。

## 前置条件

- 安装本轮交付的 APK，文件名必须带 ABI：`arm64`、`armeabi-v7a`、`x86`、`x86_64` 或四 ABI 合包的 `universal`。
- 服务器已启动并可访问，例如 `https://pi.myxinyu.xin` 或局域网地址。
- 准备一个有效访问令牌；不要把令牌写入截图、问题单或聊天记录。

## A. 安装与启动

- [ ] APK 可以安装，包名为 `com.yuanshu.app`。
- [ ] 首次打开显示服务器地址和访问令牌输入页。
- [ ] 输入服务器地址后健康探测成功，错误地址能给出可理解的失败提示。
- [ ] 登录成功后关闭并重新打开应用，服务器地址仍被记住。
- [ ] 退出登录后重新进入登录页，旧登录态不会直接绕过验证。

## B. 软键盘与布局

在竖屏和横屏分别执行：

- [ ] 聚焦聊天输入框，键盘弹出后输入框只上移一次，不被抬到屏幕顶部。
- [ ] 输入框、发送按钮和附件按钮仍可见且可操作。
- [ ] 键盘收起后聊天区恢复原高度，不留下空白或被遮挡区域。
- [ ] 连续打开/收起键盘 5 次，布局不累积偏移。
- [ ] 切换系统输入法后重复上述检查。
- [ ] 长文本、多行文本、粘贴文本时输入框不会超出可视区域。
- [ ] 在全面屏手势导航和三键导航下，底部 TabBar 不被系统导航区域遮挡。

## C. 远程 API / WebSocket

- [ ] 聊天普通请求成功返回。
- [ ] 长回复流式更新正常，切换到后台再回来不会整页闪烁。
- [ ] TUI 面板能连接；连接 URL 中不出现 `token=`。
- [ ] TUI 连接建立后先完成鉴权，再发送 resize/input；错误令牌不会启动后端 PTY。
- [ ] 会话列表、会话库、资产、任务和设置页面都能访问远程服务器，而不是回落到手机本机地址。
- [ ] 断开网络后恢复网络，页面能重连；不重复发送用户消息。

## D. 产物与发布检查

在工程根目录执行：

```bash
npm run build:mobile:web
npm test
cd frontend && npx tsc --noEmit
```

确认以下三个目录的入口和 manifest 一致：

```text
frontend/dist/
public/
app/dist/
```

## 可选 ADB 辅助命令

连接设备并开启 USB 调试后：

```bash
adb devices
adb install -r <apk-path>
adb logcat -c
adb logcat | findstr /I "yuanshu chromium AndroidRuntime"
```

验收完成后导出日志前先检查并删除令牌、Cookie、Authorization 头等敏感内容。没有设备时，只能报告“静态构建验证通过，真机验收待执行”。
