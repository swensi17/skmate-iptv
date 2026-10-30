package tv.own.owntv.core.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import tv.own.owntv.core.database.entity.ChannelEntity

class ChannelMirrorsTest {
    private fun ch(id: Long, name: String, source: Long = 1, url: String = "u$id") =
        ChannelEntity(id = id, sourceId = source, name = name, streamUrl = url)

    @Test fun qualityMarksAndFillerDoNotSplitACopy() {
        assertEquals(ChannelMirrors.key("Первый HD"), ChannelMirrors.key("Первый канал SD"))
        assertEquals(ChannelMirrors.key("Matc TV 4K"), ChannelMirrors.key("matc tv"))
        assertEquals("рен", ChannelMirrors.key("РЕН [HD] backup"))
    }

    @Test fun timeZonesAndRegionsStayDifferentChannels() {
        assertTrue(ChannelMirrors.key("Первый +2") != ChannelMirrors.key("Первый"))
        assertTrue(ChannelMirrors.key("ТНТ (Липецк)") != ChannelMirrors.key("ТНТ"))
    }

    @Test fun qualityRanksResolutionMarks() {
        assertEquals(4, ChannelMirrors.quality("Кино 4K"))
        assertEquals(2, ChannelMirrors.quality("Кино HD"))
        assertEquals(1, ChannelMirrors.quality("Кино"))
        assertEquals(0, ChannelMirrors.quality("Кино SD"))
    }

    @Test fun pickSkipsItselfTriedAndSameStream() {
        val me = ch(1, "Первый HD", url = "a")
        val all = listOf(me, ch(2, "Первый SD", url = "a"), ch(3, "Первый канал", url = "c"), ch(4, "Второй HD"), ch(5, "Первый 4K", url = "e"))
        assertEquals(listOf(3L, 5L), ChannelMirrors.pick(me, all, tried = emptySet()).map { it.id }.sortedBy { it })
        assertEquals(listOf(5L), ChannelMirrors.pick(me, all, tried = setOf(3L)).map { it.id })
    }

    @Test fun otherPlaylistComesBeforeTheSameOne() {
        val me = ch(1, "Первый HD", source = 1)
        val all = listOf(ch(2, "Первый HD", source = 1, url = "x"), ch(3, "Первый SD", source = 2, url = "y"))
        assertEquals(listOf(3L, 2L), ChannelMirrors.pick(me, all, emptySet()).map { it.id })
    }

    @Test fun lookupWordIsTheFirstRealWord() {
        assertEquals("первый", ChannelMirrors.lookupWord("Первый канал HD"))
    }
}
