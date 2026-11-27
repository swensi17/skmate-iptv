package tv.own.owntv.core.epg

import android.util.Log
import kotlinx.coroutines.flow.first
import tv.own.owntv.core.customize.CustomizationStore
import tv.own.owntv.core.database.dao.ChannelDao
import tv.own.owntv.core.database.dao.EpgDao
import tv.own.owntv.core.database.dao.ProfileDao
import tv.own.owntv.core.database.dao.SourceDao
import tv.own.owntv.core.database.entity.matchName
import tv.own.owntv.core.model.MediaType
import tv.own.owntv.core.repository.EpgRepository
import tv.own.owntv.core.settings.SettingsRepository

/**
 * Links channels to guide channels by name after a guide download, without the user pressing "Match EPG".
 *
 * Many playlists carry no `tvg-id` at all (only names), so no guide reaches them on its own; OwnTV left
 * that to a button and a review dialog per channel. Here every confident name match
 * ([EpgMatcher.AUTO_THRESHOLD]) of the active profile's channels is saved as that channel's match, then
 * its programmes (and, through [EpgLogoStore], its logo) are filled from the guide file just downloaded.
 * Matches the user set or removed stay theirs: a channel that already has a match is never touched, and
 * the doubtful matches are still left to "Match EPG".
 */
class GuideAutoLink(
    private val settings: SettingsRepository,
    private val sourceDao: SourceDao,
    private val customize: CustomizationStore,
    private val channelDao: ChannelDao,
    private val epgDao: EpgDao,
    private val epgRepository: EpgRepository,
    private val profileDao: ProfileDao,
    private val epgSources: EpgSourceStore,
) {
    private fun guideCandidates() = GuideCandidates(epgDao) { epgSources.priority() }

    /** Links what it can and returns how many channels it linked. Never throws. */
    suspend fun run(force: Boolean = true): Int = runCatching {
        // Right after onboarding the first guide finishes before the new profile is marked active; the
        // only profile on the device is that one, so its channels are linked now rather than on the next
        // launch (which is when the guide used to appear on a fresh install).
        val pid = settings.activeProfileId.first().takeIf { it >= 0 }
            ?: profileDao.getAllOnce().singleOrNull()?.id
            ?: return 0
        val playlistIds = sourceDao.sourceIdsForProfile(pid)
        if (playlistIds.isEmpty()) return 0
        dropOutdated(pid, playlistIds)
        // Not until every guide has been downloaded once (or has failed). A channel whose own id lives in a
        // guide still on its way looked unmatched, was linked by name to another guide, and that link then
        // overrode the playlist's id for good: the programme shown was not what the channel played.
        if (epgSources.getAll().any { it.lastSyncAt == null && it.lastError == null }) return 0
        val cust = customize.observe(pid, MediaType.LIVE).first()
        // At start-up it only runs when something changed since the last scan: channels that never match
        // were scored against the whole guide on every launch, minutes of every core on a weak TV.
        val key = listOf(
            pid,
            playlistIds.sorted(),
            channelDao.countAll(playlistIds).first(),
            guideCandidates().all().size,
            cust.epgMatches.size,
        ).joinToString("|")
        if (!force && settings.guideAutoLinkKey() == key) return 0
        val outcome = EpgAutoMatcher(channelDao, guideCandidates())
            .run(cust, playlistIds, applyWithoutProgrammes = true)
        settings.setGuideAutoLinkKey(key)
        val matches = outcome.applied.mapNotNull { (key, epgId) ->
            epgId.trim().lowercase().takeIf { it.isNotEmpty() }?.let { key to it }
        }.toMap()
        if (matches.isEmpty()) return 0
        customize.update(pid, MediaType.LIVE) { it.copy(epgMatches = it.epgMatches + matches) }
        remember(pid, matches)
        // The download kept only programmes of channels linked at that moment; fill the new links from
        // the guide file it left in the cache (no network).
        epgRepository.storeProgrammesForIdsFromCache(matches.values.toSet())
        val relinked = relinkEmpty(pid, playlistIds, matches)
        Log.i(TAG, "linked ${matches.size} channels by name, $relinked moved off empty guide entries (review left: ${outcome.review.size})")
        matches.size
    }.getOrElse {
        Log.w(TAG, "auto-link failed", it)
        0
    }

    /**
     * A guide can list a channel it gives no schedule ("НТВ (+2)" beside a full "НТВ"). Which entries are
     * empty is only known once the programmes are in, so a channel linked to one is linked again, to the
     * best entry that has programmes, and that entry's programmes are filled the same way.
     */
    private suspend fun relinkEmpty(pid: Long, playlistIds: List<Long>, linked: Map<String, String>): Int {
        val candidates = guideCandidates().all()
        val withProgrammes = candidates.filter { it.hasProgrammes }
        val full = withProgrammes.mapTo(HashSet()) { it.epgChannelId.trim().lowercase() }
        val emptyKeys = linked.filterValues { it !in full }.keys
        if (emptyKeys.isEmpty() || withProgrammes.isEmpty()) return 0
        val prepared = EpgMatcher.prepare(withProgrammes.map { EpgMatcher.Candidate(it.epgChannelId, it.displayName) })
        val exact = GuideCandidates.exactIndex(withProgrammes)
        val moved = channelDao.allForSources(playlistIds, MAX_RELINK_SCAN)
            .filter { tv.own.owntv.core.customize.CustomizeKeys.channel(it) in emptyKeys }
            .mapNotNull { ch ->
                val id = exact[GuideCandidates.exactKey(ch.matchName)]?.epgChannelId
                    ?: EpgMatcher.bestEpgMatchPrepared(ch.matchName, prepared)
                        ?.takeIf { it.score >= EpgMatcher.AUTO_THRESHOLD }?.epgChannelId
                    ?: return@mapNotNull null
                tv.own.owntv.core.customize.CustomizeKeys.channel(ch) to id.trim().lowercase()
            }.toMap()
        if (moved.isEmpty()) return 0
        customize.update(pid, MediaType.LIVE) { it.copy(epgMatches = it.epgMatches + moved) }
        remember(pid, moved)
        epgRepository.storeProgrammesForIdsFromCache(moved.values.toSet())
        return moved.size
    }

    /**
     * Undoes the links this class made for channels whose own id from the playlist has programmes by now:
     * the guide carrying it arrived after the link, or the playlist changed the id. A link the user picked
     * is not on the list, and stays.
     */
    private suspend fun dropOutdated(pid: Long, playlistIds: List<Long>) {
        val mine = settings.guideAutoMatches().filter { it.startsWith("$pid\t") }
        if (mine.isEmpty()) return
        val byKey = mine.associate { entry -> entry.split('\t').let { it[1] to it.last() } }
        val matches = customize.observe(pid, MediaType.LIVE).first().epgMatches
        val withProgrammes = guideCandidates().all().filter { it.hasProgrammes }
            .mapTo(HashSet()) { it.epgChannelId.trim().lowercase() }
        val outdated = channelDao.allForSources(playlistIds, MAX_RELINK_SCAN).mapNotNull { ch ->
            val key = tv.own.owntv.core.customize.CustomizeKeys.channel(ch)
            val linked = byKey[key] ?: return@mapNotNull null
            val own = ch.epgChannelId?.trim()?.lowercase().orEmpty()
            key.takeIf { matches[key] == linked && own != linked && own in withProgrammes }
        }.toSet()
        if (outdated.isEmpty()) return
        customize.update(pid, MediaType.LIVE) { it.copy(epgMatches = it.epgMatches - outdated) }
        val gone = outdated.mapTo(HashSet()) { "$pid\t$it\t${byKey[it]}" }
        settings.setGuideAutoMatches(settings.guideAutoMatches() - gone)
        Log.i(TAG, "${outdated.size} links by name dropped: the channel's own guide id has programmes now")
    }

    private suspend fun remember(pid: Long, links: Map<String, String>) {
        val fresh = links.map { (key, id) -> "$pid\t$key\t$id" }
        val kept = settings.guideAutoMatches().filterNot { entry ->
            entry.startsWith("$pid\t") && entry.substringAfter('\t').substringBeforeLast('\t') in links
        }
        settings.setGuideAutoMatches(kept.toSet() + fresh)
    }

    private companion object {
        const val MAX_RELINK_SCAN = 20_000
        const val TAG = "GuideAutoLink"
    }
}
