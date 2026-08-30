package com.yuanshu.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // 通知权限（Android 13+ 需要运行时申请，否则保活通知/任务完成通知都发不出来）
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
      }
    }

    // 保活前台服务：进程别被系统轻易杀掉，任务完成提醒才靠谱
    val svcIntent = Intent(this, KeepAliveService::class.java)
    ContextCompat.startForegroundService(this, svcIntent)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    // 原生桥接：不管 WebView 里加载的是本地连接页还是用户自己填的远程 pi-web 地址，都能拿到这几个原生能力
    webView.addJavascriptInterface(YuanshuBridge(this, webView), "YuanshuBridge")
  }
}
