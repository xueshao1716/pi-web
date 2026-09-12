package com.yuanshu.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.result.contract.ActivityResultContracts
import org.json.JSONObject

/** Uses the system document picker on Android 7+, without broad storage permissions. */
class YuanshuDownloads(private val activity: MainActivity) {
    private var webView: WebView? = null
    private var transfer: DownloadBuffer? = null
    private var waiting = false
    private var copying = false
    private val picker = activity.registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val current = synchronized(this) { transfer } ?: return@registerForActivityResult
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            release(current)
            emit(current.id, "cancelled")
        } else {
            synchronized(this) { copying = true }
            Thread {
                try {
                    val resolver = activity.contentResolver
                    val output = resolver.openOutputStream(uri, "w") ?: error("无法写入所选位置")
                    output.use { target -> current.file.inputStream().use { source -> source.copyTo(target) } }
                    try { resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: SecurityException) { }
                    val prefs = activity.getSharedPreferences("yuanshu_downloads", Context.MODE_PRIVATE)
                    val saved = prefs.getStringSet("saved_uris", emptySet())!!.toMutableSet()
                    saved.add(uri.toString())
                    prefs.edit().putStringSet("saved_uris", saved.toList().takeLast(80).toSet()).apply()
                    var displayName = current.name
                    try {
                        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                            if (cursor.moveToFirst()) displayName = cursor.getString(0) ?: displayName
                        }
                    } catch (_: Exception) { /* A provider may not expose a display name. The file is already saved. */ }
                    release(current)
                    emit(current.id, "saved", uri.toString(), "系统所选位置 · $displayName")
                } catch (error: Exception) {
                    // Remove only the newly created, incomplete document if writing failed.
                    try { android.provider.DocumentsContract.deleteDocument(activity.contentResolver, uri) } catch (_: Exception) { }
                    release(current)
                    emit(current.id, "failed", error = error.message ?: "文件保存失败")
                }
            }.start()
        }
    }

    fun attach(view: WebView) { webView = view }

    @JavascriptInterface
    @Synchronized
    fun begin(id: String, name: String, mime: String, size: Long): String {
        transfer?.takeIf { !waiting && !copying && System.currentTimeMillis() - it.lastTouched > 120000 }?.let { release(it) }
        if (transfer != null) return "请先完成当前文件的保存"
        return try {
            val safeMime = if (mime.matches(Regex("[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+"))) mime else "application/octet-stream"
            transfer = DownloadBuffer(activity.cacheDir, id, name, safeMime, size)
            ""
        } catch (error: Exception) { error.message ?: "无法准备下载文件" }
    }

    @JavascriptInterface
    @Synchronized
    fun append(id: String, base64: String): String = try {
        val current = transfer
        check(current != null && current.id == id && !waiting) { "下载已失效，请重试" }
        require(base64.length <= 87384) { "下载分块过大" }
        current.append(Base64.decode(base64, Base64.NO_WRAP))
        ""
    } catch (error: Exception) { error.message ?: "无法保存下载数据" }

    @JavascriptInterface
    @Synchronized
    fun finish(id: String): String = try {
        val current = transfer
        check(current != null && current.id == id && !waiting) { "下载已失效，请重试" }
        current.finish()
        waiting = true
        activity.runOnUiThread {
            try {
                picker.launch(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = current.mime
                    putExtra(Intent.EXTRA_TITLE, current.name)
                })
            } catch (error: Exception) {
                release(current)
                emit(id, "failed", error = error.message ?: "无法打开系统保存窗口")
            }
        }
        ""
    } catch (error: Exception) { error.message ?: "无法保存文件" }

    @JavascriptInterface
    @Synchronized
    fun cancel(id: String) {
        transfer?.takeIf { it.id == id && !waiting }?.let { release(it) }
    }

    @JavascriptInterface
    fun openSaved(value: String): String = try {
        val saved = activity.getSharedPreferences("yuanshu_downloads", Context.MODE_PRIVATE).getStringSet("saved_uris", emptySet())!!
        require(value in saved) { "记录已失效，请在系统文件管理器中打开，或重新下载" }
        val uri = Uri.parse(value)
        activity.startActivity(Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, activity.contentResolver.getType(uri) ?: "application/octet-stream")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        })
        ""
    } catch (_: android.content.ActivityNotFoundException) { "手机上没有支持此文件类型的应用" }
      catch (error: Exception) { error.message ?: "无法打开文件，请在系统文件管理器中查看" }

    @Synchronized
    private fun release(current: DownloadBuffer) {
        try { current.close() } catch (_: Exception) { }
        if (transfer === current) { transfer = null; waiting = false; copying = false }
    }

    @Synchronized
    fun dispose() {
        webView = null
        if (!copying) transfer?.let { release(it) }
    }

    private fun emit(id: String, status: String, uri: String = "", location: String = "", error: String = "") {
        val payload = JSONObject().put("id", id).put("status", status).put("uri", uri).put("location", location).put("error", error)
        activity.runOnUiThread {
            webView?.evaluateJavascript("window.dispatchEvent(new CustomEvent('yuanshu-download-result',{detail:$payload}))", null)
        }
    }
}
