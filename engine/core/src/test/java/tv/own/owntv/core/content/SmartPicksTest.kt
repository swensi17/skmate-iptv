package tv.own.owntv.core.content

import org.junit.Assert.assertEquals
import org.junit.Test
import tv.own.owntv.core.database.entity.ChannelEntity
import tv.own.owntv.core.database.entity.EpgProgrammeEntity

class SmartPicksTest {
    private fun hit(channelId: Long, start: Long, stop: Long) = ProgrammeSearchResult(
        EpgProgrammeEntity(sourceId = 1, epgChannelId = "c$channelId", startMs = start, stopMs = stop, title = "Футбол"),
        ChannelEntity(id = channelId, sourceId = 1, name = "К$channelId", streamUrl = "u"),
    )

    @Test fun onlyWhatIsAiringNowSurvives() {
        val found = listOf(hit(1, 0, 50), hit(2, 90, 200), hit(3, 150, 300))
        assertEquals(listOf(2L), SmartPicks.onNow(found, now = 100).map { it.channel.id })
    }

    @Test fun oneRowPerChannelLongestRunningFirst() {
        val found = listOf(hit(1, 80, 200), hit(2, 10, 200), hit(1, 90, 200))
        assertEquals(listOf(2L, 1L), SmartPicks.onNow(found, now = 100).map { it.channel.id })
    }

    @Test fun listIsBounded() {
        val found = (1L..100L).map { hit(it, 0, 200) }
        assertEquals(SmartPicks.LIMIT, SmartPicks.onNow(found, now = 100).size)
    }
}
