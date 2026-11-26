package tv.own.owntv.core.metadata

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import tv.own.owntv.core.settings.SettingsRepository

/** What TMDB knows about a programme on air: its poster, year and what it is about. */
data class ProgrammeArt(
    val posterUrl: String,
    val title: String,
    val year: Int?,
    val overview: String?,
    val type: MetadataType,
)

/**
 * The poster and the "what it is about" of a film or a series on air, from TMDB, for the programme the viewer
 * is watching or resting on. Light by design: one search per title (no details call), answers and misses kept
 * for the run of the app, news, sport and talk shows never asked, and every call inside the per-install
 * allowance [MetadataBudget] keeps. A guess that is not close enough shows nothing rather than a wrong film.
 */
class ProgrammeArtLookup(
    private val provider: MetadataProvider,
    private val settings: SettingsRepository,
    /** The app's language: TMDB answers in it (title, description, the poster of that language), so it keys the cache. */
    private val language: () -> String = { "" },
) {
    private val cache = object : LinkedHashMap<String, ProgrammeArt?>(CACHE_SIZE, LOAD_FACTOR, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ProgrammeArt?>?) = size > CACHE_SIZE
    }
    private val lock = Mutex()

    /** The art for the programme titled [title] in the guide, or null when it is not a film or series TMDB knows. */
    suspend fun lookup(title: String): ProgrammeArt? {
        if (!settings.metadataConfig().enabled) return null
        val query = ProgrammeTitle.parse(title) ?: return null
        val key = "${language()}|${query.kind}|${query.title.lowercase()}"
        lock.withLock { if (cache.containsKey(key)) return cache[key] }
        val found = search(query) ?: return null // offline or out of allowance: ask again later
        lock.withLock { cache[key] = found.getOrNull() }
        return found.getOrNull()
    }

    /** Null on a failed call; a [Result] holding null when TMDB answered and nothing matched. */
    private suspend fun search(query: ProgrammeTitle): Result<ProgrammeArt?>? {
        val lists = when (query.kind) {
            MetadataType.MOVIE -> listOf(provider.searchMovie(query.title))
            MetadataType.TV, MetadataType.EPISODE -> listOf(provider.searchTv(query.title))
            null -> listOf(provider.searchTv(query.title), provider.searchMovie(query.title))
        }
        // A call that failed (a dropped connection) says nothing: the title is asked again later, never kept as a miss.
        if (lists.any { it == null }) return null
        // Without "film" or "series" in the guide the title alone decides, so it has to match all but exactly.
        val needed = if (query.kind == null) EXACT_SCORE else HINTED_SCORE
        val best = lists.filterNotNull().flatten()
            .filter { !it.posterPath.isNullOrBlank() }
            .map { it to TitleMatchScorer.score(fold(query.title), null, fold(it.title), it.originalTitle?.let(::fold), it.year) }
            .filter { it.second >= needed }
            .maxWithOrNull(compareBy<Pair<MetadataSearchResult, Double>> { it.second }.thenBy { it.first.popularity })
            ?.first
        return Result.success(
            best?.let {
                ProgrammeArt(
                    posterUrl = "${TmdbProvider.IMAGE_BASE}/$POSTER_SIZE${it.posterPath}",
                    title = it.title,
                    year = it.year,
                    overview = it.overview?.takeIf { o -> o.isNotBlank() },
                    type = it.type,
                )
            },
        )
    }

    private companion object {
        /** Spellings that differ only on paper: ё as е, and Latin look-alikes in a Cyrillic title as Cyrillic. */
        private val LOOK_ALIKES = mapOf('a' to 'а', 'e' to 'е', 'o' to 'о', 'p' to 'р', 'c' to 'с', 'x' to 'х', 'y' to 'у')

        fun fold(text: String): String {
            val lower = text.lowercase().replace('ё', 'е')
            val cyrillic = lower.any { it in '\u0430'..'\u044f' }
            return if (cyrillic) lower.map { LOOK_ALIKES[it] ?: it }.joinToString("") else lower
        }

        const val CACHE_SIZE = 300
        const val LOAD_FACTOR = 0.75f
        const val EXACT_SCORE = 0.99
        const val HINTED_SCORE = 0.74
        const val POSTER_SIZE = "w342"
    }
}

/**
 * A guide title made searchable: the "Х/ф" / "Т/с" marks say film or series and are dropped with the quotes,
 * the age mark, the episode and anything in brackets ("Наш спецназ (Животная жестокость)" → "Наш спецназ").
 * News, sport, talk shows and the like are never films: [parse] answers null for them.
 */
data class ProgrammeTitle(val title: String, val kind: MetadataType?) {
    companion object {
        private val MOVIE_MARK = Regex("""^\s*(?:х/ф|х\.ф\.|худ\.\s*фильм|м/ф|фильм|кино)\s*""", RegexOption.IGNORE_CASE)
        private val TV_MARK = Regex("""^\s*(?:т/с|т\.с\.|м/с|сериал|телесериал|мультсериал)\s*""", RegexOption.IGNORE_CASE)
        private val DOC_MARK = Regex("""^\s*(?:д/ф|д/с|док\.\s*фильм)\s*""", RegexOption.IGNORE_CASE)
        private val AGE = Regex("""[\[(]?\b\d{1,2}\+[\])]?""")
        private val BRACKETS = Regex("""\s*[(\[][^)\]]*[)\]]""")
        private val EPISODE = Regex(
            """(?:[.,:\s-]+(?:\d+\s*(?:-?я|-?й)?\s*)?(?:серия|сезон|выпуск|часть|эпизод|episode|season|part).*$)|(?:[.,:]\s*\d+\s*$)""",
            RegexOption.IGNORE_CASE,
        )
        private val QUOTES = Regex("""[«»"„“”]""")
        private val NOT_FILMS = listOf(
            "новост", "вести", "известия", "время", "сегодня", "утро", "погода", "спорт", "футбол", "хоккей",
            "теннис", "матч", "шоу", "телемагазин", "реклама", "прямой эфир", "в эфире", "итоги", "ток",
            "минут", "пусть говорят", "малахов", "место встречи", "news", "live", "weather", "sport",
        )
        private const val MIN_LENGTH = 2

        fun parse(raw: String): ProgrammeTitle? {
            var t = raw.trim()
            val kind = when {
                MOVIE_MARK.containsMatchIn(t) -> MetadataType.MOVIE.also { t = t.replace(MOVIE_MARK, "") }
                TV_MARK.containsMatchIn(t) -> MetadataType.TV.also { t = t.replace(TV_MARK, "") }
                else -> null
            }
            if (DOC_MARK.containsMatchIn(t)) return null
            t = t.replace(AGE, " ").replace(BRACKETS, "").replace(QUOTES, "").replace(EPISODE, "")
                .replace(Regex("""\s+"""), " ").trim().trimEnd('.', ',', ':', '-', ' ')
            if (t.length < MIN_LENGTH) return null
            val lower = t.lowercase()
            if (kind == null && NOT_FILMS.any { lower.contains(it) }) return null
            return ProgrammeTitle(t, kind)
        }
    }
}
