package com.yuanshu.app

import java.nio.file.Files
import org.junit.Assert.*
import org.junit.Test

class DownloadBufferTest {
    @Test fun writesExactBytesAndOnlyRemovesItsOwnTemporaryFile() {
        val root = Files.createTempDirectory("yuanshu-download-test").toFile()
        val other = java.io.File(root, "keep.txt").apply { writeText("keep") }
        val data = ByteArray(100000) { (it % 251).toByte() }
        val buffer = DownloadBuffer(root, "download-1", "../宣传.pptx", "application/octet-stream", data.size.toLong())
        try {
            assertEquals("宣传.pptx", buffer.name)
            buffer.append(data.copyOfRange(0, 65536))
            buffer.append(data.copyOfRange(65536, data.size))
            buffer.finish()
            assertArrayEquals(data, buffer.file.readBytes())
            buffer.close()
            assertFalse(buffer.file.exists())
            assertEquals("keep", other.readText())
        } finally { buffer.close(); other.delete(); root.delete() }
    }

    @Test fun rejectsIncompleteOrOversizedTransfers() {
        val root = Files.createTempDirectory("yuanshu-download-size").toFile()
        val buffer = DownloadBuffer(root, "download-2", "file.txt", "text/plain", 4)
        try {
            buffer.append(byteArrayOf(1, 2))
            assertThrows(IllegalStateException::class.java) { buffer.finish() }
            assertThrows(IllegalArgumentException::class.java) { buffer.append(byteArrayOf(3, 4, 5)) }
            assertThrows(IllegalArgumentException::class.java) { buffer.append(ByteArray(65537)) }
            buffer.append(byteArrayOf(3, 4))
            buffer.finish()
            assertArrayEquals(byteArrayOf(1, 2, 3, 4), buffer.file.readBytes())
        } finally { buffer.close(); root.delete() }
    }

    @Test fun rejectsInvalidMetadataBeforeCreatingAnyFiles() {
        val root = Files.createTempDirectory("yuanshu-download-invalid").toFile()
        try {
            assertThrows(IllegalArgumentException::class.java) { DownloadBuffer(root, "../escape", "a", "text/plain", 1) }
            assertThrows(IllegalArgumentException::class.java) { DownloadBuffer(root, "valid", "a", "text/plain", -1) }
            assertThrows(IllegalArgumentException::class.java) { DownloadBuffer(root, "valid", "a", "text/plain", 536870913) }
            assertEquals(0, root.listFiles()!!.size)
        } finally { root.delete() }
    }
}
