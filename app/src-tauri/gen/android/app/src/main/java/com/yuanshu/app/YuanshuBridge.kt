package com.yuanshu.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * 元枢原生桥接层：给 WebView 里加载的页面（本地连接页 / 远程 pi-web 前端，无论哪个域名）暴露原生能力。
 * 用 WebView 原生 addJavascriptInterface，绕开 Tauri 的 remote capability 白名单机制——
 * 避免为了让用户随便填的服务器域名拿到 IPC 权限而开一个通配符的远程白名单口子（安全面太大，不划算）。
 *
 * 前端调用方式（先判断存在再调，desktop/web 上没有这个对象，天然零影响）：
 *   window.YuanshuBridge?.notify(title, body)
 *   window.YuanshuBridge?.setStatus('idle' | 'busy' | 'error')
 *   window.YuanshuBridge?.authenticate()  // 异步，结果回调 window.onYuanshuAuthResult(true/false)
 *   window.YuanshuBridge?.canAuthenticate()  // 同步返回 true/false，判断要不要走生物识别这条路
 */
class YuanshuBridge(private val activity: MainActivity, private val webView: WebView) {

    companion object {
        const val PREFS = "yuanshu_widget"
        const val KEY_STATUS = "status"
        const val CHANNEL_TASK = "yuanshu_task_done"
        const val CHANNEL_KEEPALIVE = "yuanshu_keepalive"
        const val NOTIF_ID_TASK = 2001
    }

    private fun prefs(): SharedPreferences =
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun ensureTaskChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = activity.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_TASK) == null) {
            val ch = NotificationChannel(CHANNEL_TASK, "任务完成提醒", NotificationManager.IMPORTANCE_HIGH)
            ch.description = "小语跑完一个任务时提醒你"
            nm.createNotificationChannel(ch)
        }
    }

    /** 任务完成提醒：只在页面不可见（App 在后台）时前端才会调用，避免正盯着屏幕还被弹一下 */
    @JavascriptInterface
    fun notify(title: String, body: String) {
        try {
            ensureTaskChannel()
            if (ContextCompat.checkSelfPermission(activity, android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return
            val n = NotificationCompat.Builder(activity, CHANNEL_TASK)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title.ifBlank { "元枢" })
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .build()
            androidx.core.app.NotificationManagerCompat.from(activity).notify(NOTIF_ID_TASK, n)
        } catch (_: SecurityException) {
            // 权限被用户拒绝，静默跳过——不影响正常使用
        }
    }

    /** 状态同步：写 SharedPreferences 供桌面小组件读取，并立即刷新已放置的 widget 实例 */
    @JavascriptInterface
    fun setStatus(status: String) {
        prefs().edit().putString(KEY_STATUS, status).apply()
        YuanshuWidgetProvider.refreshAll(activity)
    }

    /** 设备是否支持且已录入生物识别，前端据此决定要不要显示"验证中"这一步 */
    @JavascriptInterface
    fun canAuthenticate(): Boolean {
        val mgr = BiometricManager.from(activity)
        return mgr.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL) == BiometricManager.BIOMETRIC_SUCCESS
    }

    /** 触发系统生物识别/锁屏验证，结果通过 window.onYuanshuAuthResult(boolean) 回调给页面 */
    @JavascriptInterface
    fun authenticate() {
        activity.runOnUiThread {
            try {
                val executor = ContextCompat.getMainExecutor(activity)
                val callback = object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        callback(true)
                    }
                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        callback(false)
                    }
                    override fun onAuthenticationFailed() {
                        // 单次失败（比如指纹没按对）不立即回调失败，等用户重试或系统整体报错/成功
                    }
                }
                val prompt = BiometricPrompt(activity, executor, callback)
                val info = BiometricPrompt.PromptInfo.Builder()
                    .setTitle("解锁元枢")
                    .setSubtitle("验证身份后进入你的个人智能系统")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                    .build()
                prompt.authenticate(info)
            } catch (_: Exception) {
                callback(false)
            }
        }
    }

    private fun callback(ok: Boolean) {
        activity.runOnUiThread {
            webView.evaluateJavascript("window.onYuanshuAuthResult && window.onYuanshuAuthResult(${ok})", null)
        }
    }
}
