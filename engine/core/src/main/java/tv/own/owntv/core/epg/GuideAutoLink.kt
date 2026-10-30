package tv.own.owntv.core.epg

import android.util.Log
import kotlinx.coroutines.flow.first
import tv.own.owntv.core.customize.CustomizationStore
import tv.own.owntv.core.database.dao.ChannelDao
import tv.own.owntv.core.database.dao.EpgDao
import tv.own.owntv.core.database.dao.SourceDao
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
) {
    /** Links what it can and returns how many channels it linked. Never throws. */
    suspend fun run(): Int = runCatching {
        val pid = settings.activeProfileId.first()
        if (pid < 0) return 0
        val playlistIds = sourceDao.sourceIdsForProfile(pid)
        if (playlistIds.isEmpty()) return 0
        val cust = customize.observe(pid, MediaType.LIVE).first()
        val outcome = EpgAutoMatcher(channelDao, GuideCandidates(epgDao))
            .run(cust, playlistIds, applyWithoutProgrammes = true)
        val matches = outcome.applied.mapNotNull { (key, epgId) ->
            epgId.trim().lowercase().takeIf { it.isNotEmpty() }?.let { key to it }
        }.toMap()
        if (matches.isEmpty()) return 0
        customize.update(pid, MediaType.LIVE) { it.copy(epgMatches = it.epgMatches + matches) }
        // The download kept only programmes of channels linked at that moment; fill the new links from
        // the guide file it left in the cache (no network).
        epgRepository.storeProgrammesForIdsFromCache(matches.values.toSet())
        Log.i(TAG, "linked ${matches.size} channels by name (review left: ${outcome.review.size})")
        matches.size
    }.getOrElse {
        Log.w(TAG, "auto-link failed", it)
        0
    }

    private companion object {
        const val TAG = "GuideAutoLink"
    }
}
