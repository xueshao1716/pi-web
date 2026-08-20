import type { CapacitorConfig } from '@capacitor/cli';

/**
 * pi-web 移动端 Capacitor 配置（2026-08-20）
 *
 * 包 pi-web 原生 JS 前端（public/ 即产物，无需构建）。
 * webDir 指向 public/——Capacitor 直接把 public 当 web 资源打包。
 *
 * CapacitorHttp 开启：WKWebView/Android WebView 的 origin 是
 * capacitor://localhost（iOS）/http://localhost（Android），跨域请求会被
 * CORS 拦——插件把 fetch/XMLHttpRequest 走原生层，绕过 CORS。
 *
 * server.url 不写死：运行时由前端 config 决定 API 地址（本地 127.0.0.1:8787
 * 或公网域名），App Store/Play 提交版在构建时注入。
 */
const config: CapacitorConfig = {
  appId: 'com.pixinyu.app',
  appName: '小语工作台',
  webDir: 'public',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0d1117',
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: '#0d1117',
    allowMixedContent: false,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 200,
      backgroundColor: '#0d1117',
    },
  },
};

export default config;
