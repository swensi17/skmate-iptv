package tv.own.owntv.core.epg

import tv.own.owntv.core.database.entity.EpgProgrammeEntity

/**
 * Which guide answers for a channel that several carry: one, and only one. It is the one highest in
 * Settings → EPG Sources that still has something on for the channel.
 *
 * Guide reads are keyed by `epgChannelId` alone (see the note in
 * [tv.own.owntv.core.database.dao.EpgDao]), so a channel two feeds carry comes back with both feeds'
 * programmes. Lower feeds used to fill the time the top one left empty, and the result was a schedule no
 * feed had written, with programmes from another time zone's copy between the right ones. Now the rows
 * of a single feed are drawn; another is used only when that one has nothing now or ahead.
 *
 * Works on rows the caller has already read, so it adds no query to the guide's hot path.
 */
class GuidePriority private constructor(private val rankBySource: Map<Long, Int>) {

    /** [rows] for one channel: those of its one guide, in start order. */
    fun resolve(rows: List<EpgProgrammeEntity>, now: Long = System.currentTimeMillis()): List<EpgProgrammeEntity> {
        if (rows.size < 2) return rows
        val first = rows[0].sourceId
        if (rows.all { it.sourceId == first }) return EpgDedupe.collapse(rows)
        val bySource = rows.groupBy { it.sourceId }
        val chosen = bySource.keys.minWithOrNull(
            // A feed that has run out ranks behind any that still has programmes, whatever its place.
            compareBy<Long> { id -> if (bySource.getValue(id).any { it.stopMs > now }) 0 else 1 }
                .thenBy { rankOf(it) }
                .thenBy { it },
        ) ?: return EpgDedupe.collapse(rows)
        return EpgDedupe.collapse(bySource.getValue(chosen))
    }

    /** The source's place in the list; any source not on it (an old playlist guide) ranks last. */
    fun rankOf(sourceId: Long): Int = rankBySource[sourceId] ?: Int.MAX_VALUE

    companion object {
        /** [sourceIds] best first, as the EPG Sources list shows them. */
        fun of(sourceIds: List<Long>): GuidePriority =
            GuidePriority(sourceIds.withIndex().associate { (index, id) -> id to index })
    }
}
