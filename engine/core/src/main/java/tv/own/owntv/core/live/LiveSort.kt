package tv.own.owntv.core.live

import tv.own.owntv.core.settings.SettingsRepository.SortMode

/**
 * The orders the Live TV list can be sorted by, in the order the sort menu shows them.
 * (Movies and Series have their own set: rating and date added make no sense for a channel.)
 */
val LiveSortModes: List<SortMode> = listOf(
    SortMode.PLAYLIST, SortMode.ALPHA, SortMode.ALPHA_DESC, SortMode.NUMBER, SortMode.RECENT,
)

/** A saved sort that this section cannot show (say "Rating") falls back to the provider's own order. */
fun SortMode.forLive(): SortMode = if (this in LiveSortModes) this else SortMode.PLAYLIST

/** Orders that need their own query: Z–A, by channel number, recently watched. */
fun SortMode.isCustomLiveOrder(): Boolean = this == SortMode.ALPHA_DESC || this == SortMode.NUMBER || this == SortMode.RECENT

/** A built SQL query and its bind arguments (kept apart from Room so it is testable on the JVM). */
data class LiveSortQuery(val sql: String, val args: List<Any>)

/**
 * The ORDER BY for the sort orders that the fixed DAO queries do not cover. Every order ends on
 * `sourceId, sortOrder, name`, so rows that tie (no number, never watched) stay in a stable order.
 */
fun liveOrderBy(sort: SortMode, c: String = "c"): String = when (sort) {
    SortMode.ALPHA_DESC -> "$c.name DESC"
    SortMode.NUMBER -> "($c.number IS NULL), $c.number ASC, $c.sourceId ASC, $c.sortOrder ASC, $c.name ASC"
    SortMode.RECENT -> "(h.watchedAt IS NULL), h.watchedAt DESC, $c.sourceId ASC, $c.sortOrder ASC, $c.name ASC"
    SortMode.ALPHA -> "$c.name ASC"
    else -> "$c.sourceId ASC, $c.sortOrder ASC, $c.name ASC"
}

/**
 * The query for a list sorted Z–A, by channel number or by recently watched, or null when the fixed
 * queries handle it (provider order, A–Z) or the list has an order of its own (Favorites, History).
 * An explicit sort choice wins over a hand-made order inside a category.
 */
fun liveSortQuery(key: LiveKey, sort: SortMode, profileId: Long, sourceIds: List<Long>, contextKey: String?): LiveSortQuery? {
    if (!sort.isCustomLiveOrder()) return null
    if (key == LiveKey.Favorites || key == LiveKey.History) return null
    val ids = sourceIds.ifEmpty { listOf(-1L) }
    val marks = ids.joinToString(",") { "?" }
    val args = mutableListOf<Any>()
    val sb = StringBuilder("SELECT c.* FROM channels c ")
    if (sort == SortMode.RECENT) {
        sb.append("LEFT JOIN watch_history h ON h.itemId = c.id AND h.mediaType = 'LIVE' AND h.profileId = ? ")
        args += profileId
    }
    when (key) {
        LiveKey.All -> { sb.append("WHERE c.sourceId IN ($marks) "); args.addAll(ids) }
        LiveKey.Catchup -> { sb.append("WHERE c.sourceId IN ($marks) AND c.catchup = 1 "); args.addAll(ids) }
        is LiveKey.Folder -> { sb.append("WHERE c.categoryId = ? "); args += key.id }
        is LiveKey.Custom -> {
            sb.append("INNER JOIN custom_category_members m ON m.itemId = c.id AND m.profileId = ? AND m.mediaType = 'LIVE' AND m.contextKey = ? ")
            sb.append("WHERE c.sourceId IN ($marks) ")
            args += profileId; args += (contextKey ?: key.id); args.addAll(ids)
        }
        else -> return null
    }
    sb.append("ORDER BY ").append(liveOrderBy(sort))
    return LiveSortQuery(sb.toString(), args)
}
