// 元枢壳客户端：桌面直连本机服务；Android 走连接页（可输局域网/隧道地址）
// 设计铁律：壳零业务逻辑——只决定 WebView 首屏 URL，其余全是中层 SPA 的事

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                // 桌面：服务由 watchdog 常驻，直连本机
                let url = "http://127.0.0.1:8787/";
                let win = tauri::WebviewWindowBuilder::new(
                    app,
                    "main",
                    tauri::WebviewUrl::External(url.parse().expect("bad url")),
                )
                .title("元枢 · 个人智能系统")
                .inner_size(1280.0, 820.0)
                .min_inner_size(420.0, 360.0)
                .decorations(false)   // 去系统标题栏：前端自绘（TitleBar.tsx）跟随主题
                .shadow(true)
                .build()?;
                let _ = win;
            }
            #[cfg(mobile)]
            {
                // 荣耀上 App("index.html") 会变成 http://tauri.localhost，
                // Tauri 用 reqwest 探活这个自定义协议，必然 Failed to request。
                // 手机壳直接打开公网工作台，和桌面打开 8787 同一套前端，会话才看得到。
                let url = "https://pi.myxinyu.xin/";
                let win = tauri::WebviewWindowBuilder::new(
                    app,
                    "main",
                    tauri::WebviewUrl::External(url.parse().expect("bad url")),
                )
                .title("元枢")
                .build()?;
                let _ = win;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running yuanshu shell");
}
