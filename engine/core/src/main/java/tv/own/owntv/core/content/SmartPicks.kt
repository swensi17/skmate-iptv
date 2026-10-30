package tv.own.owntv.core.content

import tv.own.owntv.core.repository.ActiveProfileSources

/** The «On now» lists: what is airing at this moment, found by words in the programme titles. */
enum class SmartPick(val words: List<String>) {
    SPORT(listOf("футбол", "хоккей", "баскетбол", "теннис", "бокс", "ufc", "формула", "спорт", "football", "soccer", "sport")),
    MOVIES(listOf("фильм", "кино", "movie", "film", "cinema")),
    NEWS(listOf("новости", "news", "итоги", "вести")),
    KIDS(listOf("мульт", "детск", "cartoon", "kids")),
}

object SmartPicks {
    const val LIMIT = 40

    /** Programmes already started and not yet over, one per channel, the longest-running first. */
    fun onNow(found: List<ProgrammeSearchResult>, now: Long): List<ProgrammeSearchResult> =
        found
            .filter { it.programme.startMs <= now && it.programme.stopMs > now }
            .distinctBy { it.channel.id }
            .sortedBy { it.programme.startMs }
            .take(LIMIT)

    suspend fun load(reader: SearchReader, profileId: Long, sources: ActiveProfileSources, pick: SmartPick, now: Long = System.currentTimeMillis()): List<ProgrammeSearchResult> {
        val found = reader.programmesFor(profileId, sources, pick.words)
        return onNow(found, now)
    }
}
