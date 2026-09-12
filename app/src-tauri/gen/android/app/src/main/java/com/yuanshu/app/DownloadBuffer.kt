package com.yuanshu.app

import java.io.File
import java.io.FileOutputStream

/** Only app-created temporary files are writable through the download bridge. */
class DownloadBuffer(cacheDir: File, val id: String, filename: String, val mime: String, private val expectedSize: Long) {
    val name = filename.substringAfterLast('/').substringAfterLast('\\')
        .replace(Regex("[\\p{Cntrl}:*?\"<>|]"), "_").trim().take(180).ifBlank { "download" }
    val file: File
    private var written = 0L
    private var output: FileOutputStream? = null
    var lastTouched = System.currentTimeMillis()
        private set

    init {
        require(id.matches(Regex("[A-Za-z0-9-]{1,80}"))) { "无效的下载编号" }
        require(expectedSize in 0..536870912L) { "单个文件最多支持 512 MB" }
        file = File.createTempFile("yuanshu-download-", ".tmp", cacheDir)
        output = FileOutputStream(file)
    }

    fun append(bytes: ByteArray) {
        require(bytes.size <= 65536 && written + bytes.size <= expectedSize) { "下载数据大小不匹配" }
        checkNotNull(output) { "下载已结束" }.write(bytes)
        written += bytes.size
        lastTouched = System.currentTimeMillis()
    }

    fun finish() {
        check(written == expectedSize) { "文件尚未完整接收，请重新下载" }
        output?.close()
        output = null
    }

    fun close() {
        try { output?.close() } finally { output = null; file.delete() }
    }
}
