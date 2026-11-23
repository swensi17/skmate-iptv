package tv.own.owntv.features.remote

import android.content.Context
import android.util.Log
import androidx.work.ExistingWorkPolicy
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import tv.own.owntv.core.database.dao.ProfileDao
import tv.own.owntv.core.database.dao.resolveExistingProfileId
import tv.own.owntv.core.repository.SourceRepository
import tv.own.owntv.core.settings.SettingsRepository
import tv.own.owntv.core.setup.AuthorPlaylist
import tv.own.owntv.core.sync.ImportFinalizer
import tv.own.owntv.core.sync.SyncContentTypes
import tv.own.owntv.core.sync.work.CatalogSyncScheduler

/**
 * Keeps the author's playlist current while SkMate is open: every few seconds it asks the author's server
 * whether the playlist changed (a conditional request, answered "not modified" with no body, which costs the
 * server next to nothing) and, when it did, syncs the playlist at once. A channel the author adds or drops shows
 * up in the lists in seconds, without switching the playlist off and on.
 *
 * Runs only with the screen on (see [start] and [stop]) and only when the viewer has the author's playlist.
 */
class AuthorPlaylistWatcher(
    private val context: Context,
    private val client: OkHttpClient,
    private val settings: SettingsRepository,
    private val profileDao: ProfileDao,
    private val sourceRepository: SourceRepository,
    private val catalogSyncScheduler: CatalogSyncScheduler,
    private val importFinalizer: ImportFinalizer,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private var job: Job? = null
    private var lastEnqueueAt = 0L

    fun start() {
        if (job?.isActive == true) return
        job = scope.launch {
            while (isActive) {
                runCatching { check() }.onFailure { Log.w(TAG, "check failed: ${it.javaClass.simpleName}") }
                delay(INTERVAL_MS)
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }

    /** One look at the server: a playlist whose tag differs from the one last applied is synced at once. */
    private suspend fun check() {
        val pid = profileDao.resolveExistingProfileId(settings.activeProfileId.first()) ?: return
        val source = AuthorPlaylist.find(context, sourceRepository.observeSources(pid).first()) ?: return
        val applied = prefs.getString(KEY_ETAG, null)
        val builder = Request.Builder().url(source.url.trim()).header("Cache-Control", "no-cache")
        if (applied != null) builder.header("If-None-Match", applied)
        client.newCall(builder.build()).execute().use { resp ->
            if (resp.code == NOT_MODIFIED || !resp.isSuccessful) return
            val tag = resp.header("ETag") ?: return
            if (tag == applied) return
            // A burst of changes (the author's checker publishing) is applied at most every few seconds; the tag is
            // kept only once a sync was started, so a change skipped here is picked up on the next look.
            val now = System.currentTimeMillis()
            if (now - lastEnqueueAt < MIN_GAP_MS) return
            lastEnqueueAt = now
            val counts = importFinalizer.contentCounts(source.id)
            Log.i(TAG, "author playlist changed, syncing sourceId=${source.id}")
            catalogSyncScheduler.enqueueSync(
                source.id,
                reason = REASON,
                contentTypes = SyncContentTypes.enabledOf(source),
                baseItemCount = counts.channels + counts.movies + counts.series,
                // The author's own server is trusted: a playlist that shrinks, or comes back empty, is applied
                // in full instead of being held back by the guard meant for a provider's truncated answer.
                forcePrune = true,
                policy = ExistingWorkPolicy.REPLACE,
            )
            prefs.edit().putString(KEY_ETAG, tag).apply()
        }
    }

    private companion object {
        const val TAG = "AuthorWatcher"
        const val REASON = "author_update"
        const val NOT_MODIFIED = 304
        const val INTERVAL_MS = 15_000L
        const val MIN_GAP_MS = 20_000L
        const val PREFS = "author_playlist_watcher"
        const val KEY_ETAG = "etag_v2"
    }
}
