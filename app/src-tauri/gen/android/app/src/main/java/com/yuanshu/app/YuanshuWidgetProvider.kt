package com.yuanshu.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/**
 * 桌面小组件：显示当前小语状态（就绪/工作中/异常），点击直接拉起 App。
 * 状态来源 = YuanshuBridge.setStatus() 写入的 SharedPreferences（前端 agentStatus 变化时同步过来）。
 */
class YuanshuWidgetProvider : AppWidgetProvider() {

    companion object {
        fun refreshAll(context: Context) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, YuanshuWidgetProvider::class.java))
            if (ids.isNotEmpty()) {
                val provider = YuanshuWidgetProvider()
                for (id in ids) provider.updateOne(context, mgr, id)
            }
        }
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) updateOne(context, appWidgetManager, id)
    }

    private fun updateOne(context: Context, mgr: AppWidgetManager, id: Int) {
        val prefs = context.getSharedPreferences(YuanshuBridge.PREFS, Context.MODE_PRIVATE)
        val status = prefs.getString(YuanshuBridge.KEY_STATUS, "idle") ?: "idle"
        val (label, dot) = when (status) {
            "busy" -> "工作中…" to "🟠"
            "error" -> "有异常" to "🔴"
            else -> "就绪" to "🟢"
        }
        val views = RemoteViews(context.packageName, R.layout.widget_yuanshu)
        views.setTextViewText(R.id.widget_status_text, "$dot $label")
        val openIntent = Intent(context, MainActivity::class.java)
        val pending = PendingIntent.getActivity(
            context, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_root, pending)
        mgr.updateAppWidget(id, views)
    }
}
