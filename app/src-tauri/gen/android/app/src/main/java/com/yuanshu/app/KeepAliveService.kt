package com.yuanshu.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * 保活前台服务：只用来把进程优先级提上去，不做任何联网/轮询——
 * 真正的"任务是否完成"判断逻辑在 WebView 里加载的网页 JS 里（那边本来就有 SSE 长连接），
 * 这个服务存在的唯一目的是让 Android 别把 App 进程连着 WebView 一起杀掉，
 * 这样锁屏/切后台时任务完成通知才有机会真正弹出来。
 * 常驻通知优先级 LOW（无提示音无震动），不会打扰。
 */
class KeepAliveService : Service() {

    companion object {
        const val CHANNEL_ID = "yuanshu_keepalive"
        const val NOTIF_ID = 1001
    }

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                val ch = NotificationChannel(CHANNEL_ID, "保持连接", NotificationManager.IMPORTANCE_LOW)
                ch.description = "元枢在后台保持连接，任务完成才能及时提醒你"
                ch.setShowBadge(false)
                nm.createNotificationChannel(ch)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setContentTitle("元枢 · 正在保持连接")
            .setContentText("任务完成会在这里提醒你")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIF_ID, notification)
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
