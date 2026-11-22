package tv.own.owntv.core.setup

import android.content.Context
import tv.own.owntv.core.CoreBuildInfo
import tv.own.owntv.core.database.entity.SourceEntity
import tv.own.owntv.core.settings.PlaylistAutoRefresh
import tv.own.owntv.core.settings.PlaylistRefresh
import java.io.File

/**
 * The author's auto-updated playlist: one address the app subscribes to, kept up to date and checked on the
 * author's server. Off unless the viewer turns it on (first run or Settings › Playlists); it is then an ordinary
 * M3U playlist that refreshes itself.
 */
object AuthorPlaylist {
    const val NAME = "SkMate"

    /** A text file served if it changed, "not modified" otherwise: refreshing often costs next to nothing. */
    val REFRESH = PlaylistRefresh(PlaylistAutoRefresh.HOURS_6)

    private const val TEST_URL_FILE = "author-playlist-url.txt"

    /** The address, or null while this build has none (the switch is then not offered at all). */
    fun url(context: Context): String? {
        if (CoreBuildInfo.devTools) {
            // A maintainer build may point at a test server from a file put on the device over adb.
            val test = runCatching { File(context.getExternalFilesDir(null), TEST_URL_FILE).readText().trim() }.getOrNull()
            if (!test.isNullOrBlank()) return test
        }
        return CoreBuildInfo.authorPlaylistUrl.takeIf { it.isNotBlank() }
    }

    /** The viewer's copy of it among [sources], or null when it is off. */
    fun find(context: Context, sources: List<SourceEntity>): SourceEntity? {
        val url = url(context) ?: return null
        return sources.firstOrNull { it.url.trim() == url }
    }
}
