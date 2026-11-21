package tv.own.owntv.core.live

import org.junit.Assert.assertEquals
import org.junit.Test

class FolderMergeTest {
    @Test
    fun sameNamesAcrossPlaylistsBecomeOneFolder() {
        val merged = mergeFoldersByName(listOf(1L to "News", 2L to "Kids", 11L to " news ", 12L to "Kids", 13L to "Sport"))
        assertEquals(listOf(1L, 2L, 13L), merged.keys.toList())
        assertEquals(listOf(1L, 11L), merged[1L])
        assertEquals(listOf(2L, 12L), merged[2L])
        assertEquals(listOf(13L), merged[13L])
    }

    @Test
    fun onePlaylistIsUnchanged() {
        val merged = mergeFoldersByName(listOf(1L to "A", 2L to "B"))
        assertEquals(mapOf(1L to listOf(1L), 2L to listOf(2L)), merged)
    }
}
