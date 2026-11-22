package tv.own.owntv.core.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveKeyMapTest {
    @Test
    fun untouchedKeysKeepTheirUsualJob() {
        val map = LiveKeyMap.DEFAULT
        assertEquals(LiveKeyAction.INFO, map[LiveKey.OK])
        assertEquals(LiveKeyAction.NEXT_CHANNEL, map[LiveKey.UP])
        assertEquals(LiveKeyAction.CHANNEL_LIST, map[LiveKey.LEFT])
        assertTrue(LiveKey.entries.none(map::isCustom))
        assertEquals("", map.encode())
    }

    @Test
    fun choiceSurvivesEncodeAndDecode() {
        val map = LiveKeyMap.DEFAULT.with(LiveKey.OK, LiveKeyAction.CHANNEL_LIST).with(LiveKey.LEFT, LiveKeyAction.REWIND)
        val back = LiveKeyMap.decode(map.encode())
        assertEquals(map, back)
        assertEquals(LiveKeyAction.CHANNEL_LIST, back[LiveKey.OK])
        assertTrue(back.isCustom(LiveKey.OK))
        assertFalse(back.isCustom(LiveKey.UP))
    }

    @Test
    fun pickingTheUsualJobAgainClearsTheChoice() {
        val map = LiveKeyMap.DEFAULT.with(LiveKey.OK, LiveKeyAction.CHANNEL_LIST).with(LiveKey.OK, LiveKeyAction.INFO)
        assertEquals(LiveKeyMap.DEFAULT, map)
    }

    @Test
    fun unknownPartsAreDropped() {
        val map = LiveKeyMap.decode("OK=CHANNEL_LIST,FOO=BAR,UP=TELEPORT,broken,,DOWN=NOTHING")
        assertEquals(LiveKeyAction.CHANNEL_LIST, map[LiveKey.OK])
        assertEquals(LiveKeyAction.NEXT_CHANNEL, map[LiveKey.UP])
        assertEquals(LiveKeyAction.NOTHING, map[LiveKey.DOWN])
    }
}
