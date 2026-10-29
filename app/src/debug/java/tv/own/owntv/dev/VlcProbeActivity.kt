package tv.own.owntv.dev

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import org.videolan.libvlc.util.VLCVideoLayout

/**
 * Debug-only bench: plays one live URL on libVLC and logs what the picture really did, to compare
 * with the ExoPlayer/mpv engine on the same channels.
 *   adb shell am start -n uz.skmate.iptv/tv.own.owntv.dev.VlcProbeActivity --es url <url>
 */
class VlcProbeActivity : Activity() {
    private lateinit var vlc: LibVLC
    private lateinit var player: MediaPlayer
    private val handler = Handler(Looper.getMainLooper())
    private var startedAt = 0L
    private var firstVout = 0L
    private var buffering = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val layout = VLCVideoLayout(this)
        setContentView(layout)
        val url = intent.getStringExtra("url") ?: return finish()
        vlc = LibVLC(this, arrayListOf("--network-caching=3000", "--http-reconnect", "--deinterlace=-1", "-vv"))
        player = MediaPlayer(vlc)
        player.attachViews(layout, null, false, false)
        player.setEventListener { e ->
            val t = SystemClock.elapsedRealtime() - startedAt
            when (e.type) {
                MediaPlayer.Event.Vout -> if (e.voutCount > 0 && firstVout == 0L) { firstVout = t; Log.i(TAG, "first picture after ${t}ms") }
                MediaPlayer.Event.Playing -> Log.i(TAG, "playing at ${t}ms")
                MediaPlayer.Event.Buffering -> if (e.buffering < 100f) buffering++
                MediaPlayer.Event.EncounteredError -> Log.i(TAG, "ERROR at ${t}ms")
                MediaPlayer.Event.EndReached -> Log.i(TAG, "END at ${t}ms")
                else -> Unit
            }
        }
        val media = Media(vlc, android.net.Uri.parse(url)).apply {
            setHWDecoderEnabled(intent.getBooleanExtra("hw", true), false)
            addOption(":http-user-agent=VLC/3.0.20 LibVLC/3.0.20")
        }
        player.media = media
        media.release()
        startedAt = SystemClock.elapsedRealtime()
        player.play()
        handler.postDelayed(object : Runnable {
            override fun run() {
                val s = player.media?.stats
                if (s != null) Log.i(TAG, "stats t=${(SystemClock.elapsedRealtime() - startedAt) / 1000}s shown=${s.displayedPictures} lost=${s.lostPictures} decodedVideo=${s.decodedVideo} readMB=${s.demuxReadBytes / 1048576} bufferingEvents=$buffering playing=${player.isPlaying}")
                handler.postDelayed(this, 5000)
            }
        }, 5000)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        runCatching { player.stop(); player.detachViews(); player.release(); vlc.release() }
        super.onDestroy()
    }

    private companion object { const val TAG = "VlcProbe" }
}
