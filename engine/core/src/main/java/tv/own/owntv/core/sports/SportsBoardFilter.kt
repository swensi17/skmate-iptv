package tv.own.owntv.core.sports

import tv.own.owntv.core.content.QueryVariants
import tv.own.owntv.core.content.SearchRank
import tv.own.owntv.core.content.SearchText
import tv.own.owntv.core.database.entity.ChannelEntity

/** The orders the Sports board offers: what began first, the programme's name, the channel's name. */
enum class BoardSort { TIME, TITLE, CHANNEL }

/**
 * Sorting, filtering and searching the sport that is on the user's channels, so the board can show
 * all of it instead of the first few. Pure: no database, no clock.
 */
object SportsBoardFilter {

    /** Two-letter tokens playlists put on channel names that are not countries. */
    private val NOT_COUNTRY = setOf("HD", "SD", "TV", "FM", "FHD", "UHD", "HQ", "LQ", "TW", "VIP", "PPV")
    private val TAIL = Regex("(?:^|[\\s|\\[(])([A-Z]{2})[\\])]?\\s*$")
    private val HEAD = Regex("^\\s*[\\[(]?([A-Z]{2})[\\])]?\\s*[|:\\-]")
    private val ALIASES = mapOf("UK" to "GB", "EN" to "GB", "EL" to "GR", "SR" to "RS", "SQ" to "AL", "UA" to "UA")
    private val CYRILLIC = Regex("[\\u0400-\\u04FF]")
    private val TURKISH = Regex("[ğĞıİşŞ]")

    /** ISO country code a channel name points to ("Cosmote Sport 2 HD GR" → GR, "Старт Триумф" → RU), or null. */
    fun countryOf(channelName: String): String? {
        val code = (HEAD.find(channelName) ?: TAIL.find(channelName))?.groupValues?.get(1)
        if (code != null && code !in NOT_COUNTRY) return ALIASES[code] ?: code
        if (CYRILLIC.containsMatchIn(channelName)) return "RU"
        if (TURKISH.containsMatchIn(channelName)) return "TR"
        return null
    }

    /** The country of an item: the first of its channels that names one. */
    fun countryOf(item: GuideSportItem): String? = item.channels.firstNotNullOfOrNull { countryOf(it.name) }

    /** Countries present, the most common first (ties by code); items with none are not counted. */
    fun countries(items: List<GuideSportItem>): List<String> =
        items.mapNotNull(::countryOf).groupingBy { it }.eachCount()
            .entries.sortedWith(compareBy({ -it.value }, { it.key })).map { it.key }

    /** Sports present, in the declaration order of [GuideSport]. */
    fun sports(items: List<GuideSportItem>): List<GuideSport> = items.map { it.sport }.distinct().sortedBy { it.ordinal }

    /**
     * [items] narrowed by the typed [query] (any layout, any case, a typo), the chosen [sports] and
     * [countries] (none chosen = all), and put in [sort] order.
     */
    fun apply(
        items: List<GuideSportItem>,
        query: String,
        sports: Set<GuideSport>,
        countries: Set<String>,
        sort: BoardSort,
    ): List<GuideSportItem> {
        val variants = QueryVariants.of(query)
        val searching = variants.all.isNotEmpty()
        val kept = items.filter { item ->
            (sports.isEmpty() || item.sport in sports) &&
                (countries.isEmpty() || countryOf(item) in countries) &&
                (!searching || ranked(item, variants) != null)
        }
        return when {
            searching && sort == BoardSort.TIME -> kept.sortedWith(compareBy({ ranked(it, variants) }, { it.startMs }))
            sort == BoardSort.TIME -> kept.sortedWith(compareBy({ it.startMs }, { it.title.lowercase() }))
            sort == BoardSort.TITLE -> kept.sortedBy { SearchText.normalize(it.title) }
            else -> kept.sortedWith(compareBy({ SearchText.normalize(it.channels.firstOrNull()?.name.orEmpty()) }, { it.startMs }))
        }
    }

    private fun ranked(item: GuideSportItem, variants: QueryVariants): Int? {
        val names = (listOf(item.title) + item.channels.map(ChannelEntity::name)).joinToString(" ")
        return SearchRank.score(SearchText.normalize(names), variants.all)
    }
}
