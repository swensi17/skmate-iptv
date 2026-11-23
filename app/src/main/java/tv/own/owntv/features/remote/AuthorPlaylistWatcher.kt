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
    private var job: Job? = null

    fun start() {
        if (job?.isActive == true) return
        job = scope.launch {
            var etag: String? = null
            while (isActive) {
                etag = runCatching { check(etag) }.getOrElse {
                    Log.w(TAG, "check failed: ${it.javaClass.simpleName}")
                    etag
                }
                delay(INTERVAL_MS)
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }

    /** One look at the server; returns the playlist's current tag. */
    private suspend fun check(known: String?): String? {
        val pid = profileDao.resolveExistingProfileId(settings.activeProfileId.first()) ?: return known
        val source = AuthorPlaylist.find(context, sourceRepository.observeSources(pid).first()) ?: return null
        val builder = Request.Builder().url(source.url.trim()).header("Cache-Control", "no-cache")
        if (known != null) builder.header("If-None-Match", known)
        client.newCall(builder.build()).execute().use { resp ->
            if (resp.code == NOT_MODIFIED) return known
            if (!resp.isSuccessful) return known
            val tag = resp.header("ETag")
            // The first answer only learns the tag; a later different one means the author changed something.
            if (known != null && tag != null && tag != known) {
                val counts = importFinalizer.contentCounts(source.id)
                Log.i(TAG, "author playlist changed, syncing sourceId=${source.id}")
                catalogSyncScheduler.enqueueSync(
                    source.id,
                    reason = REASON,
                    contentTypes = SyncContentTypes.enabledOf(source),
                    baseItemCount = counts.channels + counts.movies + counts.series,
                    policy = ExistingWorkPolicy.KEEP,
                )
            }
            return tag ?: known
        }
    }

    private companion object {
        const val TAG = "AuthorWatcher"
        const val REASON = "author_update"
        const val NOT_MODIFIED = 304
        const val INTERVAL_MS = 15_000L
    }
}
