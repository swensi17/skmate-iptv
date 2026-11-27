package tv.own.owntv.core.epg

import org.junit.Assert.assertEquals
import org.junit.Test

class GuideAutoLinkTest {
    @Test
    fun `only a link hiding an own id with programmes is removed`() {
        val channels = listOf("tnt" to "ТНТ", "noOwn" to null, "emptyOwn" to "dead.id", "same" to "five", "free" to "ren")
        val matches = mapOf("tnt" to "353", "noOwn" to "12", "emptyOwn" to "13", "same" to "FIVE")
        val over = GuideAutoLink.linksOverOwnId(channels, matches, setOf("тнт", "353", "five", "ren"))
        assertEquals(setOf("tnt"), over)
    }
}
