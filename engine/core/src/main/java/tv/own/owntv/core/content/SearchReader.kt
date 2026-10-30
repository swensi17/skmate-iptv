package tv.own.owntv.core.content

import androidx.compose.runtime.Immutable
import kotlinx.coroutines.flow.first
import tv.own.owntv.core.customize.CustomizationStore
import tv.own.owntv.core.customize.CustomizeKeys
import tv.own.owntv.core.customize.SectionCustomizations
import tv.own.owntv.core.database.dao.CategoryDao
import tv.own.owntv.core.database.dao.ChannelDao
import tv.own.owntv.core.database.dao.ChannelSearchResult
import tv.own.owntv.core.database.dao.EpgDao
import tv.own.owntv.core.database.dao.MovieDao
import tv.own.owntv.core.database.dao.ProfileDao
import tv.own.owntv.core.database.dao.SeriesDao
import tv.own.owntv.core.database.entity.ChannelEntity
import tv.own.owntv.core.database.entity.EpgProgrammeEntity
import tv.own.owntv.core.database.entity.MovieEntity
import tv.own.owntv.core.database.entity.SeriesEntity
import tv.own.owntv.core.epg.EpgDedupe
import tv.own.owntv.core.epg.EpgShift
import tv.own.owntv.core.live.epgKeyOf
import tv.own.owntv.core.model.MediaType
import tv.own.owntv.core.repository.ActiveProfileSources
import tv.own.owntv.core.settings.SettingsRepository

/** Combined results of a global query (each list bounded). */
@Immutable
data class SearchResults(
    val channels: List<ChannelSearchResult> = emptyList(),
    val movies: List<MovieEntity> = emptyList(),
    val series: List<SeriesEntity> = emptyList(),
    /** Programmes on now or later today whose title matches, on now first. Only from a typed query. */
    val programmes: List<ProgrammeSearchResult> = emptyList(),
) {
    val isEmpty: Boolean get() = channels.isEmpty() && movies.isEmpty() && series.isEmpty() && programmes.isEmpty()

    /** How many results are of [kind] — the count each filter button shows. */
    fun count(kind: SearchKind): Int = when (kind) {
        SearchKind.LIVE -> channels.size
        SearchKind.TV_SHOWS -> programmes.size
        SearchKind.MOVIES -> movies.size
        SearchKind.SERIES -> series.size
    }

    /** Only the kinds in [kinds]. None picked is no filter at all: everything. */
    fun only(kinds: Set<SearchKind>): SearchResults = if (kinds.isEmpty()) this else SearchResults(
        channels = if (SearchKind.LIVE in kinds) channels else emptyList(),
        movies = if (SearchKind.MOVIES in kinds) movies else emptyList(),
        series = if (SearchKind.SERIES in kinds) series else emptyList(),
        programmes = if (SearchKind.TV_SHOWS in kinds) programmes else emptyList(),
    )
}

/** The search filter's buttons, each switched on and off on its own. TV shows are guide programmes. */
enum class SearchKind { LIVE, TV_SHOWS, MOVIES, SERIES }

/** A programme found by its title, with the channel showing it; times are on the user's clock. */
@Immutable
data class ProgrammeSearchResult(
    val programme: EpgProgrammeEntity,
    val channel: ChannelEntity,
)

/** The curated lists offered when nothing has been typed yet. */
enum class SearchIntent {
    CONTINUE,
    UNWATCHED,
    CHANNELS,
}

/**
 * Searching a profile's channels, films and shows at once.
 *
 * The queries themselves are the DAOs'; what lives here is everything that decides *which* of their
 * rows a user may see — the FTS expression, the hidden items, the hidden categories, a kids
 * profile's adult filter, and the renames a user made in Customize. Two apps searching the same
 * database have to agree on all five, so it is written once rather than in each app's search screen.
 */
class SearchReader(
    private val channelDao: ChannelDao,
    private val categoryDao: CategoryDao,
    private val movieDao: MovieDao,
    private val seriesDao: SeriesDao,
    private val profileDao: ProfileDao,
    private val customize: CustomizationStore,
    private val epgDao: EpgDao,
    private val settings: SettingsRepository,
) {

    /**
     * Results for a typed query, already filtered and renamed for [profileId].
     *
     * [sources] is the profile's active playlists, per section, so a section switched Off never
     * surfaces. Returns nothing at all when the profile has no sources — there is nothing to search.
     */
    suspend fun search(
        profileId: Long,
        sources: ActiveProfileSources,
        query: String,
        limit: Int = MATCH_LIMIT,
    ): SearchResults {
        if (profileId < 0 || !sources.hasAny) return SearchResults()
        val variants = QueryVariants.of(query)
        if (variants.all.isEmpty()) return SearchResults()
        val custLive = customize.observe(profileId, MediaType.LIVE).first()
        val custMovie = customize.observe(profileId, MediaType.MOVIE).first()
        val custSeries = customize.observe(profileId, MediaType.SERIES).first()
        val isKids = profileDao.getById(profileId)?.isKids == true
        val hiddenLiveCats = hiddenCategoryIds(sources.liveSourceIds, MediaType.LIVE, custLive, isKids)
        val hiddenMovieCats = hiddenCategoryIds(sources.movieSourceIds, MediaType.MOVIE, custMovie, isKids)
        val hiddenSeriesCats = hiddenCategoryIds(sources.seriesSourceIds, MediaType.SERIES, custSeries, isKids)
        return SearchResults(
            channels = if (sources.liveSourceIds.isEmpty()) emptyList() else
                gather(
                    variants, limit, id = { it.channel.id },
                    fts = { f, n -> channelDao.searchListDetailedFts(f, sources.liveSourceIds, n) },
                    like = { q, n -> channelDao.searchListDetailed(q, sources.liveSourceIds, n) },
                )
                    .filter {
                        CustomizeKeys.channel(it.row.channel) !in custLive.hiddenItems &&
                            (it.row.channel.categoryId == null || it.row.channel.categoryId !in hiddenLiveCats)
                    }
                    .map { f ->
                        custLive.itemNames[CustomizeKeys.channel(f.row.channel)]
                            ?.let { f.copy(row = f.row.copy(channel = f.row.channel.copy(name = it))) } ?: f
                    }
                    .ranked(variants, limit) { it.channel.name },
            movies = if (sources.movieSourceIds.isEmpty()) emptyList() else
                gather(
                    variants, limit, id = { it.id },
                    fts = { f, n -> movieDao.searchListFts(f, sources.movieSourceIds, n) },
                    like = { q, n -> movieDao.searchList(q, sources.movieSourceIds, n) },
                )
                    .filter {
                        CustomizeKeys.movie(it.row) !in custMovie.hiddenItems &&
                            (it.row.categoryId == null || it.row.categoryId !in hiddenMovieCats)
                    }
                    .map { f -> custMovie.itemNames[CustomizeKeys.movie(f.row)]?.let { f.copy(row = f.row.copy(name = it)) } ?: f }
                    .ranked(variants, limit) { it.name },
            series = if (sources.seriesSourceIds.isEmpty()) emptyList() else
                gather(
                    variants, limit, id = { it.id },
                    fts = { f, n -> seriesDao.searchListFts(f, sources.seriesSourceIds, n) },
                    like = { q, n -> seriesDao.searchList(q, sources.seriesSourceIds, n) },
                )
                    .filter {
                        CustomizeKeys.series(it.row) !in custSeries.hiddenItems &&
                            (it.row.categoryId == null || it.row.categoryId !in hiddenSeriesCats)
                    }
                    .map { f -> custSeries.itemNames[CustomizeKeys.series(f.row)]?.let { f.copy(row = f.row.copy(name = it)) } ?: f }
                    .ranked(variants, limit) { it.name },
            programmes = if (sources.liveSourceIds.isEmpty()) emptyList() else
                programmes(variants, sources.liveSourceIds, custLive, hiddenLiveCats),
        )
    }

    /** A row a table returned, and whether the table vouched for it (a fuzzy candidate has to earn its place). */
    private data class Found<T>(val row: T, val certain: Boolean)

    /**
     * Every row that may answer [variants], in three passes, each only when the one before found
     * little: the index for each spelling (prefix of a word), then the substring scans in the case
     * forms SQLite's LIKE needs, then candidates sharing the first letters of the longest word, for
     * the fuzzy match to sort out. Each pass is bounded, so a two-letter query stays cheap.
     */
    private suspend fun <T> gather(
        variants: QueryVariants,
        limit: Int,
        id: (T) -> Long,
        fts: suspend (String, Int) -> List<T>,
        like: suspend (String, Int) -> List<T>,
    ): List<Found<T>> {
        val out = LinkedHashMap<Long, Found<T>>()
        for (v in variants.all) {
            val f = ftsQuery(v) ?: continue
            for (row in fts(f, limit)) out.putIfAbsent(id(row), Found(row, true))
        }
        if (out.size < WIDEN_BELOW) {
            for (q in variants.likeForms()) for (row in like(q, limit)) out.putIfAbsent(id(row), Found(row, true))
        }
        if (out.size < FUZZY_BELOW) {
            for (prefix in variants.fuzzyPrefixes()) {
                for (row in fts("$prefix*", FUZZY_CANDIDATES)) out.putIfAbsent(id(row), Found(row, false))
            }
        }
        return out.values.toList()
    }

    /** Best answers first: exact name, then its start, a word's start, anywhere in it, one letter off. */
    private fun <T> List<Found<T>>.ranked(variants: QueryVariants, limit: Int, name: (T) -> String): List<T> =
        mapNotNull { f ->
            val norm = SearchText.normalize(name(f.row))
            val score = SearchRank.score(norm, variants.all) ?: (if (f.certain) SearchRank.OTHER else return@mapNotNull null)
            Triple(score, norm, f.row)
        }
            .sortedWith(compareBy({ it.first }, { it.second.length }, { it.second }))
            .take(limit)
            .map { it.third }

    /**
     * Programmes whose title contains the typed text (in any of its spellings), from now until [PROGRAMME_HORIZON_MS] ahead, each on a
     * channel this profile may see. Only the stored (XMLTV) guide is searched — the provider's own
     * short EPG is fetched per channel and is never in the table.
     *
     * A channel reads its guide by its manual match first and its own id second (as the Guide does), so
     * both are looked up. One feed carried by two playlists is one programme: it is listed once.
     */
    private suspend fun programmes(
        variants: QueryVariants,
        liveSourceIds: List<Long>,
        cust: SectionCustomizations,
        hiddenCats: Set<Long>,
        horizonMs: Long = PROGRAMME_HORIZON_MS,
    ): List<ProgrammeSearchResult> {
        val now = System.currentTimeMillis()
        // The stored window is widened by [PROGRAMME_SHIFT_SLACK_MS] on both sides, so a shifted channel
        // still finds its rows; the exact window is applied after the shift, on the user's clock. The
        // slack stays small: rows that ended before it would use up [PROGRAMME_ROWS] and push out what
        // is on now.
        val rows = variants.likeForms()
            .flatMap { q ->
                epgDao.searchTitles(q, now - PROGRAMME_SHIFT_SLACK_MS, now + horizonMs + PROGRAMME_SHIFT_SLACK_MS, PROGRAMME_ROWS)
            }
            .distinctBy { it.id }
        if (rows.isEmpty()) return emptyList()
        val byKey = rows.groupBy { it.epgChannelId }
        val keys = byKey.keys.toList()
        val matchedTails = cust.epgMatches
            .filterValues { it.trim().lowercase() in byKey }
            .keys.map { CustomizeKeys.tailOf(it) }.filter { it.isNotEmpty() }.distinct()
        val candidates = keys.chunked(KEY_CHUNK).flatMap { channelDao.byEpgKeys(liveSourceIds, it) } +
            matchedTails.chunked(KEY_CHUNK).flatMap { channelDao.byRemoteIdsOrNames(liveSourceIds, it) }
        val globalShift = settings.epgOffsetMinutes.first()
        return candidates
            .distinctBy { it.id }
            .filter { CustomizeKeys.channel(it) !in cust.hiddenItems && (it.categoryId == null || it.categoryId !in hiddenCats) }
            .sortedWith(compareBy({ liveSourceIds.indexOf(it.sourceId) }, { it.sortOrder }))
            .flatMap { ch ->
                val key = epgKeyOf(ch, cust) ?: return@flatMap emptyList()
                val shift = EpgShift.minutesFor(cust, ch, globalShift)
                val named = cust.itemNames[CustomizeKeys.channel(ch)]?.let { ch.copy(name = it) } ?: ch
                EpgShift.apply(EpgDedupe.collapse(byKey[key].orEmpty()), shift)
                    .filter { it.stopMs > now && it.startMs < now + horizonMs }
                    .map { key to ProgrammeSearchResult(it, named) }
            }
            .distinctBy { (key, found) -> Triple(key, found.programme.startMs, found.programme.title) }
            .map { it.second }
            .sortedWith(compareBy({ it.programme.startMs > now }, { it.programme.startMs }))
            .take(PROGRAMME_LIMIT)
    }

    /**
     * Programmes whose title holds any of [words], airing right now (a narrow window, which keeps it quick): only the guide is read, not the
     * channel, film and series indexes, so a list of a dozen words stays quick. The caller keeps what is on now.
     */
    suspend fun programmesFor(profileId: Long, sources: ActiveProfileSources, words: List<String>): List<ProgrammeSearchResult> {
        if (profileId < 0 || sources.liveSourceIds.isEmpty()) return emptyList()
        val custLive = customize.observe(profileId, MediaType.LIVE).first()
        val isKids = profileDao.getById(profileId)?.isKids == true
        val hidden = hiddenCategoryIds(sources.liveSourceIds, MediaType.LIVE, custLive, isKids)
        return words.flatMap { programmes(QueryVariants.of(it), sources.liveSourceIds, custLive, hidden, horizonMs = 0L) }
    }

    /** One of the curated lists shown before anything is typed. Bounded, and already source-filtered. */
    suspend fun curated(
        profileId: Long,
        sources: ActiveProfileSources,
        intent: SearchIntent,
        limit: Int = LIMIT,
    ): SearchResults {
        if (profileId < 0 || !sources.hasAny) return SearchResults()
        return when (intent) {
            SearchIntent.CONTINUE -> SearchResults(
                channels = channelDao.recentlyWatched(profileId, limit).first()
                    .filter { it.sourceId in sources.liveSourceIds }
                    .map { ChannelSearchResult(it, null) },
                movies = if (sources.movieSourceIds.isEmpty()) emptyList()
                else movieDao.recentlyWatchedSnapshot(profileId, sources.movieSourceIds, limit),
                series = if (sources.seriesSourceIds.isEmpty()) emptyList()
                else seriesDao.recentlyWatchedSnapshot(profileId, sources.seriesSourceIds, limit),
            )
            SearchIntent.UNWATCHED -> SearchResults(
                movies = if (sources.movieSourceIds.isEmpty()) emptyList()
                else movieDao.unwatchedFavorites(profileId, sources.movieSourceIds, limit),
                series = if (sources.seriesSourceIds.isEmpty()) emptyList()
                else seriesDao.unwatchedFavorites(profileId, sources.seriesSourceIds, limit),
            )
            SearchIntent.CHANNELS -> SearchResults(
                channels = channelDao.favoritesListAlpha(profileId).first()
                    .filter { it.sourceId in sources.liveSourceIds }
                    .take(limit)
                    .map { ChannelSearchResult(it, null) },
            )
        }
    }

    /** DB ids of this profile's hidden categories for [type] (so hidden groups drop out of search too). */
    private suspend fun hiddenCategoryIds(
        sourceIds: List<Long>,
        type: MediaType,
        cust: SectionCustomizations,
        isKidsProfile: Boolean,
    ): Set<Long> {
        if (cust.hiddenCategories.isEmpty() && !isKidsProfile) return emptySet()
        return AdultCategoryClassifier.hiddenCategoryIds(
            categoryDao.observe(sourceIds, type).first(),
            cust.hiddenCategories,
            isKidsProfile,
        )
    }

    companion object {
        /** How many rows of each kind a curated list returns. */
        const val LIMIT = 40

        /**
         * How many rows of each kind a typed search returns. High enough that a title search lists
         * every match ("Spider" found more than 40 films, and the rest were never shown); the cap is
         * only for a two-letter query that matches most of a 170k-row catalogue.
         */
        const val MATCH_LIMIT = 500

        /** Below this many index hits the substring scans run too; below [FUZZY_BELOW], the fuzzy pass. */
        private const val WIDEN_BELOW = 30
        private const val FUZZY_BELOW = 8

        /** Rows the fuzzy pass reads per short prefix before the edit distance decides. */
        private const val FUZZY_CANDIDATES = 1500

        /** How far ahead "On TV" looks, and how many programmes it lists. */
        private const val PROGRAMME_HORIZON_MS = 12 * 60 * 60_000L
        private const val PROGRAMME_LIMIT = 20

        /** The largest guide shift "On TV" still allows for when reading stored times. */
        private const val PROGRAMME_SHIFT_SLACK_MS = 2 * 60 * 60_000L

        /** Raw rows read before mapping to channels; one programme can be on many guide channels. */
        private const val PROGRAMME_ROWS = 300

        /** Keys per IN (…) lookup, inside SQLite's variable limit. */
        private const val KEY_CHUNK = 400

        /**
         * A sanitized FTS4 MATCH expression: the text is split at every character that is not a letter
         * or digit and each word becomes a prefix term ("harry pot" → "harry* pot*", implicit AND). The
         * index splits names at punctuation too, so "Spider-M" must be "Spider* M*" — stripping the
         * hyphen instead gave "SpiderM*", which no indexed word starts with.
         * Null when nothing tokenizable remains (symbols-only input) — the caller then falls back to
         * the substring LIKE queries. Prefix terms match word starts rather than mid-word substrings,
         * which is the accepted trade-off for an index-served search over ~220k rows per keystroke.
         */
        fun ftsQuery(query: String): String? {
            val tokens = query.split(Regex("[^\\p{L}\\p{Nd}]+")).filter { it.isNotEmpty() }
            if (tokens.isEmpty()) return null
            return tokens.joinToString(" ") { "$it*" }
        }
    }
}

/** True when the profile has at least one playlist a search could look in. */
private val ActiveProfileSources.hasAny: Boolean
    get() = liveSourceIds.isNotEmpty() || movieSourceIds.isNotEmpty() || seriesSourceIds.isNotEmpty()
