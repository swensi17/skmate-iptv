package tv.own.owntv.core.live

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import tv.own.owntv.core.settings.SettingsRepository.SortMode

class LiveSortTest {
    @Test fun fixedQueriesHandleProviderOrderAndAlpha() {
        assertNull(liveSortQuery(LiveKey.All, SortMode.PLAYLIST, 1, listOf(1), null))
        assertNull(liveSortQuery(LiveKey.All, SortMode.ALPHA, 1, listOf(1), null))
    }

    @Test fun favoritesAndHistoryKeepTheirOwnOrder() {
        assertNull(liveSortQuery(LiveKey.Favorites, SortMode.NUMBER, 1, listOf(1), null))
        assertNull(liveSortQuery(LiveKey.History, SortMode.ALPHA_DESC, 1, listOf(1), null))
    }

    @Test fun descendingNamesInAFolder() {
        val q = liveSortQuery(LiveKey.Folder(7), SortMode.ALPHA_DESC, 1, listOf(1), null)!!
        assertTrue(q.sql.endsWith("ORDER BY c.name DESC"))
        assertEquals(listOf<Any>(7L), q.args)
    }

    @Test fun numberPutsUnnumberedChannelsLast() {
        val q = liveSortQuery(LiveKey.All, SortMode.NUMBER, 1, listOf(1, 2), null)!!
        assertTrue(q.sql.contains("WHERE c.sourceId IN (?,?)"))
        assertTrue(q.sql.contains("ORDER BY (c.number IS NULL), c.number ASC"))
        assertEquals(listOf<Any>(1L, 2L), q.args)
    }

    @Test fun recentJoinsHistoryAndBindsProfileFirst() {
        val q = liveSortQuery(LiveKey.Catchup, SortMode.RECENT, 5, listOf(3), null)!!
        assertTrue(q.sql.contains("LEFT JOIN watch_history h"))
        assertTrue(q.sql.contains("c.catchup = 1"))
        assertTrue(q.sql.contains("(h.watchedAt IS NULL), h.watchedAt DESC"))
        assertEquals(listOf<Any>(5L, 3L), q.args)
    }

    @Test fun customCategoryBindsInSqlOrder() {
        val q = liveSortQuery(LiveKey.Custom("custom:a"), SortMode.RECENT, 5, listOf(3), "custom:a")!!
        assertEquals(listOf<Any>(5L, 5L, "custom:a", 3L), q.args)
        assertEquals(q.sql.count { it == '?' }, q.args.size)
    }

    @Test fun emptySourceListStillBindsAPlaceholder() {
        val q = liveSortQuery(LiveKey.All, SortMode.NUMBER, 1, emptyList(), null)!!
        assertEquals(listOf<Any>(-1L), q.args)
    }

    @Test fun unknownSavedSortFallsBackToProviderOrder() {
        assertEquals(SortMode.PLAYLIST, SortMode.RATING.forLive())
        assertEquals(SortMode.NUMBER, SortMode.NUMBER.forLive())
    }

    @Test fun menuListsFiveOrdersProviderFirst() {
        assertEquals(5, LiveSortModes.size)
        assertEquals(SortMode.PLAYLIST, LiveSortModes.first())
    }
}
