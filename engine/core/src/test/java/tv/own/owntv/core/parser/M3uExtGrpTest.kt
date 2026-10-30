package tv.own.owntv.core.parser

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Groups written as `#EXTGRP:` lines. Providers that use only this form came in with every channel in
 * "All channels" and no categories at all (seen on a 3 163-channel playlist with 14 groups).
 */
class M3uExtGrpTest {

    private fun parse(text: String): List<M3uEntry> = runBlocking {
        val out = mutableListOf<M3uEntry>()
        M3uParser().parse(text.byteInputStream()) { out += it }
        out
    }

    @Test
    fun extGrpUnderTheEntryIsItsGroup() {
        val e = parse(
            """
            #EXTM3U
            #EXTINF:0 tvg-rec="0",Первый канал UHD
            #EXTGRP:новости
            http://host/1
            #EXTINF:0,Матч HD
            #EXTGRP:спорт
            http://host/2
            """.trimIndent(),
        )
        assertEquals(listOf("новости", "спорт"), e.map { it.groupTitle })
    }

    @Test
    fun groupTitleWinsOverExtGrp() {
        val e = parse("#EXTM3U\n#EXTINF:-1 group-title=\"News\",A\n#EXTGRP:other\nhttp://h/a\n")
        assertEquals("News", e.single().groupTitle)
    }

    @Test
    fun extGrpAboveTheEntryAppliesToTheNextOneOnly() {
        val e = parse("#EXTM3U\n#EXTGRP:kids\n#EXTINF:-1,A\nhttp://h/a\n#EXTINF:-1,B\nhttp://h/b\n")
        assertEquals("kids", e[0].groupTitle)
        assertNull(e[1].groupTitle)
    }

    @Test
    fun blankExtGrpIsIgnored() {
        assertNull(parse("#EXTM3U\n#EXTINF:-1,A\n#EXTGRP:  \nhttp://h/a\n").single().groupTitle)
    }

    @Test
    fun tvgRecGivesArchiveDaysWhenNothingElseDoes() {
        val e = parse(
            "#EXTM3U\n#EXTINF:0 tvg-rec=\"3\",A\nhttp://h/a\n#EXTINF:0 tvg-rec=\"0\",B\nhttp://h/b\n" +
                "#EXTINF:0 tvg-rec=\"3\" catchup-days=\"7\",C\nhttp://h/c\n",
        )
        assertEquals(listOf(3, null, 7), e.map { it.catchupDays })
    }
}
