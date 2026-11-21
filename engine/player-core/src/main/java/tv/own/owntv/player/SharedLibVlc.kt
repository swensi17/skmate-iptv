package tv.own.owntv.player

import android.content.Context
import org.videolan.libvlc.LibVLC

/**
 * One libVLC instance for the whole app. Loading it (native libraries, plugin scan) took a noticeable
 * moment on the interface thread at the first channel, and every Multiview tile built its own copy.
 * [warmUp] builds it in the background at app start, so the first channel opens on a ready instance.
 */
object SharedLibVlc {
    @Volatile private var instance: LibVLC? = null

    fun get(context: Context): LibVLC = instance ?: synchronized(this) {
        instance ?: LibVLC(context.applicationContext, options()).also { instance = it }
    }

    /** Builds the instance on a background thread; a failure is left for the first real use to report. */
    fun warmUp(context: Context) {
        val app = context.applicationContext
        Thread({ runCatching { get(app) } }, THREAD_NAME).apply { priority = Thread.MIN_PRIORITY }.start()
    }

    private fun options() = arrayListOf(
        "--http-reconnect",
        // Interlaced channels (576i) come out of the decoder as fields; let libVLC pick a deinterlacer.
        "--deinterlace=-1",
        "--deinterlace-mode=yadif",
        "--audio-time-stretch",
        "--stats",
    )

    private const val THREAD_NAME = "vlc-warmup"
}
