package tv.own.owntv.player

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Surface
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import tv.own.owntv.core.network.HttpClient
import tv.own.owntv.core.settings.LiveBuffer

/**
 * The live TV engine: one libVLC player for the preview pane and for full screen.
 *
 * It replaces an ExoPlayer engine and its mpv fallback, which between them needed thousands of lines of
 * watchdogs, reconnect ladders and engine handovers, and still froze on some channels: interlaced 576i
 * H.264 without IDR pictures (2x2, .red orig) never rendered on ExoPlayer, and the handovers to mpv
 * themselves caused the "decoder busy" screens. libVLC plays those as they are (measured on the same
 * channels: ~25 pictures a second, nothing lost, no stalls), so this engine keeps only three rules:
 *
 *  1. **Open fast**: hardware decoding, a network cache sized from the live latency setting.
 *  2. **Stuck picture → software decoding**: when frames stop arriving while the stream does, the channel
 *     reopens once with the software decoder (some TV decoders refuse field-coded pictures) and that is
 *     remembered for the channel for the rest of the session.
 *  3. **Lost stream → reconnect**: an error or an end of a live stream reopens it, at most [MAX_RECONNECTS]
 *     times in a row with a growing pause, then the error screen says so.
 *
 * The public surface is the one the app and [LiveTuneController] already used, so nothing above it changed.
 */
class LivePreviewEngine(
    private val context: Context,
    @Suppress("unused") private val streamingHttp: tv.own.owntv.core.network.StreamingHttpClient,
    @Suppress("unused") private val diagnostics: PlayerDiagnostics,
    settings: tv.own.owntv.core.settings.SettingsRepository,
    @Suppress("unused") connectivity: tv.own.owntv.core.network.ConnectivityObserver,
    @Suppress("unused") private val playbackPrefs: tv.own.owntv.core.player.PlaybackPrefsStore,
) : PlaybackEngine {

    enum class State { IDLE, LOADING, PLAYING, ERROR }

    private val main = Handler(Looper.getMainLooper())
    /** libVLC's stop/open can wait on its own threads; never on the UI thread, or a slow stream freezes the remote. */
    private var control = android.os.HandlerThread("vlc-control").apply { start() }
    @Volatile private var ctl = Handler(control.looper)
    private val engineId = System.identityHashCode(this)
    private val vlc: LibVLC by lazy { LibVLC(context.applicationContext, vlcOptions()) }
    private var player: MediaPlayer? = null
    private var surface: Surface? = null

    private val _state = MutableStateFlow(State.IDLE)
    val state: StateFlow<State> = _state.asStateFlow()
    private val _isPlaying = MutableStateFlow(false)
    override val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()
    private val _buffering = MutableStateFlow(false)
    override val buffering: StateFlow<Boolean> = _buffering.asStateFlow()
    private val _error = MutableStateFlow<PlaybackFailure?>(null)
    override val error: StateFlow<PlaybackFailure?> = _error.asStateFlow()
    private val _errorInfo = MutableStateFlow<ErrorInfo?>(null)
    override val errorInfo: StateFlow<ErrorInfo?> = _errorInfo.asStateFlow()
    private val _stalledSinceMs = MutableStateFlow<Long?>(null)
    override val stalledSinceMs: StateFlow<Long?> = _stalledSinceMs.asStateFlow()
    private val _videoRes = MutableStateFlow<String?>(null)
    override val videoRes: StateFlow<String?> = _videoRes.asStateFlow()
    private val _streamChips = MutableStateFlow<List<String>>(emptyList())
    override val streamChips: StateFlow<List<String>> = _streamChips.asStateFlow()
    private val _volume = MutableStateFlow(100)
    override val volume: StateFlow<Int> = _volume.asStateFlow()
    private val _zoomMode = MutableStateFlow(ZoomMode.FIT)
    override val zoomMode: StateFlow<ZoomMode> = _zoomMode.asStateFlow()
    private val _audioCount = MutableStateFlow(0)
    override val audioCount: StateFlow<Int> = _audioCount.asStateFlow()
    private val _subCount = MutableStateFlow(0)
    override val subCount: StateFlow<Int> = _subCount.asStateFlow()
    private val _currentMeta = MutableStateFlow(MediaMeta())
    override val currentMeta: StateFlow<MediaMeta> = _currentMeta.asStateFlow()
    override val isLiveContent: Boolean = true
    private val _audioOnly = MutableStateFlow(false)
    override val audioOnly: StateFlow<Boolean> = _audioOnly.asStateFlow()
    private val _audioOnlyMedia = MutableStateFlow(false)
    override val audioOnlyMedia: StateFlow<Boolean> = _audioOnlyMedia.asStateFlow()

    private val _videoAspect = MutableStateFlow<Float?>(null)
    val videoAspect: StateFlow<Float?> = _videoAspect.asStateFlow()
    private val _videoSize = MutableStateFlow<Pair<Int, Int>?>(null)
    val videoSize: StateFlow<Pair<Int, Int>?> = _videoSize.asStateFlow()
    private val _videoFps = MutableStateFlow<Float?>(null)
    val videoFps: StateFlow<Float?> = _videoFps.asStateFlow()
    /** Bumped when the video surface must be rebuilt; libVLC never needs it, kept for the surface composables. */
    val surfaceGeneration: StateFlow<Int> = MutableStateFlow(0)
    val cues: StateFlow<List<androidx.media3.common.text.Cue>> = MutableStateFlow(emptyList())
    val subtitleOn: StateFlow<Boolean> = MutableStateFlow(false)
    val audioUnsupported: StateFlow<Boolean> = MutableStateFlow(false)
    val noVideoDetected: StateFlow<Boolean> = MutableStateFlow(false)
    val segmentsRefused: StateFlow<Boolean> = MutableStateFlow(false)

    /** The URL of the tune in progress; null while stopped. */
    var currentUrl: String? = null
        private set
    @Volatile var reconnectUrlProvider: tv.own.owntv.core.stalker.ReconnectUrlProvider? = null
    var onAudioFallback: (() -> Unit)? = null

    private var muted = false
    private var userAgent: String? = null
    private var headers: String? = null
    private var liveBufferSecs: Int? = null
    private var liveBufferOverride: LiveBuffer.Override? = null
    private var hasPlayed = false
    private var gaveUp = false
    private var reconnects = 0
    private var softwareTried = false
    private var lastShown = 0
    private var lastRead = 0L
    private var stuckChecks = 0
    private var openedAt = 0L
    /** Bumped by every open; [startedGen] catches up once libVLC has really switched to that media. Events
     *  in between still belong to the channel being left, and must not mark the new one as showing. */
    @Volatile private var openGen = 0
    @Volatile private var startedGen = 0
    private var audioTracks: List<TrackOption> = emptyList()
    private var textTracks: List<TrackOption> = emptyList()

    init {
        LiveDiagnosticsLog.init(context)
    }

    // ---- surfaces -----------------------------------------------------------------------------------------

    fun setSurface(s: Surface?) {
        if (s == null) return
        surface = s
        player?.let { attach(it, s) }
    }

    fun detachSurface(s: Surface) {
        if (surface !== s) return
        surface = null
        player?.vlcVout?.let { detachBounded(it) }
    }

    /**
     * libVLC takes its own lock to detach the views, and a connection stuck on a dead server holds that
     * lock: called on the main thread that froze the whole interface (an ANR the moment the preview gave
     * way to full screen). The detach runs on the control thread and the caller waits a short, bounded time.
     */
    private fun detachBounded(vout: org.videolan.libvlc.interfaces.IVLCVout) {
        if (!vout.areViewsAttached()) return
        val done = java.util.concurrent.CountDownLatch(1)
        ctl.post { try { if (vout.areViewsAttached()) vout.detachViews() } finally { done.countDown() } }
        done.await(DETACH_WAIT_MS, java.util.concurrent.TimeUnit.MILLISECONDS)
    }

    private var surfaceW = 0
    private var surfaceH = 0

    /** The surface's size in pixels: libVLC scales the picture to it (Fit), the composable sizes the view. */
    fun setSurfaceSize(width: Int, height: Int) {
        surfaceW = width; surfaceH = height
        player?.let { applyWindow(it) }
    }

    /** On the control thread: libVLC's calls on a surface can wait on a lock a stuck connection holds. */
    private fun applyWindow(p: MediaPlayer) {
        if (surfaceW <= 0 || surfaceH <= 0) return
        val w = surfaceW; val h = surfaceH
        ctl.post { applyWindowNow(p, w, h) }
    }

    private fun applyWindowNow(p: MediaPlayer, w: Int, h: Int) {
        p.vlcVout.setWindowSize(w, h)
        p.aspectRatio = null
        p.scale = 0f
        // A size change on a picture already showing (the channel panel closing round a docked picture) is only
        // picked up when the video output is told to lay itself out again.
        p.videoScale = MediaPlayer.ScaleType.SURFACE_BEST_FIT
        p.updateVideoSurfaces()
    }

    /** An attach is queued on the control thread: an open that clears the queue must queue it again. */
    @Volatile private var attachPending = false

    private fun attach(p: MediaPlayer, s: Surface) {
        val vout = p.vlcVout
        val w = surfaceW; val h = surfaceH
        attachPending = true
        ctl.post {
            attachPending = false
            if (vout.areViewsAttached()) vout.detachViews()
            vout.setVideoSurface(s, null)
            vout.attachViews()
            if (w > 0 && h > 0) applyWindowNow(p, w, h)
        }
    }

    fun setAutoFrameRateEnabled(@Suppress("UNUSED_PARAMETER") enabled: Boolean) {}

    // ---- tuning -------------------------------------------------------------------------------------------

    fun play(
        url: String,
        muted: Boolean,
        meta: MediaMeta = MediaMeta(),
        userAgent: String? = null,
        prerollSecsOverride: Int? = null,
        liveBufferOverride: LiveBuffer.Override? = null,
        httpHeaders: String? = null,
        drmConfig: String? = null,
        manifestType: String? = null,
        directSource: String? = null,
    ) {
        LiveDiagnosticsLog.event("play() engine=$engineId url=${HttpClient.redactUrl(url)} muted=$muted")
        currentUrl = url
        this.muted = muted
        this.userAgent = userAgent
        this.headers = httpHeaders
        this.liveBufferOverride = liveBufferOverride
        _currentMeta.value = meta
        hasPlayed = false; gaveUp = false; reconnects = 0
        softwareTried = url in SOFTWARE_URLS
        open(url)
    }

    private fun open(url: String) {
        main.removeCallbacks(watchdog); main.removeCallbacks(reconnectRun)
        val p = player ?: MediaPlayer(vlc).also { player = it; it.setEventListener(::onEvent) }
        surface?.let { attach(p, it) }
        // The window size goes in before every open: a new channel builds a new video output, and without it
        // libVLC drew the first frames at the stream's own size in the corner until the next resize.
        applyWindow(p)
        val media = Media(vlc, Uri.parse(url)).apply {
            setHWDecoderEnabled(!softwareTried, false)
            addOption(":network-caching=${cachingMs()}")
            addOption(":http-user-agent=${userAgent ?: DEFAULT_UA}")
            headerValue("Referer")?.let { addOption(":http-referrer=$it") }
        }
        val vol = if (muted) 0 else _volume.value
        val gen = ++openGen
        ctl.removeCallbacksAndMessages(null)
        if (attachPending) surface?.let { attach(p, it) }
        ctl.post {
            p.media = media
            media.release()
            p.volume = vol
            startedGen = gen
            p.play()
        }
        _error.value = null; _errorInfo.value = null
        _state.value = State.LOADING; _buffering.value = true; _isPlaying.value = false
        lastShown = 0; lastRead = 0L; stuckChecks = 0; sawLife = false
        openedAt = SystemClock.elapsedRealtime()
        main.removeCallbacks(watchdog)
        main.postDelayed(watchdog, WATCH_MS)
    }

    private fun headerValue(name: String): String? = headers?.lineSequence()
        ?.map { it.split(':', limit = 2) }?.firstOrNull { it.size == 2 && it[0].trim().equals(name, true) }
        ?.get(1)?.trim()?.takeIf { it.isNotEmpty() }

    private fun cachingMs(): Int {
        val secs = liveBufferOverride?.secs ?: liveBufferSecs
        // A connection that keeps stalling gets a deeper buffer on the next open (see [StallMeter]).
        return (((secs ?: DEFAULT_CACHE_SECS) + stalls.extraSecs()) * 1000).coerceIn(MIN_CACHE_MS, MAX_CACHE_MS)
    }

    private val stalls = StallMeter(SystemClock::elapsedRealtime)
    private val _networkLevel = MutableStateFlow(0)

    /** 0 on a healthy connection; 1..3 as stalls pile up and the buffer is deepened. The app says so once. */
    val networkLevel: StateFlow<Int> = _networkLevel.asStateFlow()

    private fun noteStall() {
        stalls.onStall()
        _networkLevel.value = stalls.level()
    }

    private fun onEvent(e: MediaPlayer.Event) {
        if (startedGen != openGen) return // still the channel being left
        when (e.type) {
            MediaPlayer.Event.Buffering -> if (e.buffering < 100f) {
                if (hasPlayed && _stalledSinceMs.value == null) { _stalledSinceMs.value = SystemClock.elapsedRealtime(); noteStall() }
                _buffering.value = true
            } else {
                _buffering.value = false; _stalledSinceMs.value = null
            }
            MediaPlayer.Event.Playing -> { _isPlaying.value = true }
            MediaPlayer.Event.Vout -> if (e.voutCount > 0) { player?.let { applyWindow(it) }; onFirstPicture() }
            MediaPlayer.Event.ESAdded, MediaPlayer.Event.ESSelected -> readTracks()
            MediaPlayer.Event.EncounteredError -> lost("error")
            MediaPlayer.Event.EndReached -> lost("end of stream")
            MediaPlayer.Event.Stopped -> { _isPlaying.value = false }
            else -> Unit
        }
    }

    private fun onFirstPicture() {
        if (!hasPlayed) LiveDiagnosticsLog.event("first frame after ${SystemClock.elapsedRealtime() - openedAt}ms")
        hasPlayed = true
        reconnects = 0
        _state.value = State.PLAYING; _buffering.value = false; _stalledSinceMs.value = null
        _audioOnlyMedia.value = false
        readTracks()
    }

    private fun readTracks() {
        val p = player ?: return
        val video = (p.currentVideoTrack)
        if (video != null && video.width > 0 && video.height > 0) {
            val w = video.width; val h = video.height
            val sar = if (video.sarDen > 0 && video.sarNum > 0) video.sarNum.toFloat() / video.sarDen else 1f
            _videoSize.value = w to h
            _videoAspect.value = w * sar / h
            _videoRes.value = "${h}p"
            val fps = if (video.frameRateDen > 0) video.frameRateNum.toFloat() / video.frameRateDen else null
            _videoFps.value = fps?.takeIf { it in 1f..240f }
            val media = p.media
            val channels = media?.let { m ->
                (0 until m.trackCount).map { m.getTrack(it) }
                    .firstNotNullOfOrNull { it as? org.videolan.libvlc.interfaces.IMedia.AudioTrack }?.channels
            }
            val stereo = channels
            _streamChips.value = listOfNotNull(
                aspectLabel(w * sar / h),
                "${h}p".uppercase(),
                fps?.let { "${it.toInt()} FPS" },
                stereo?.let { if (it > 2) "${it}.0" else "STEREO" },
            )
        }
        audioTracks = p.audioTracks?.filter { it.id >= 0 }?.map { TrackOption(it.name ?: "", it.id, it.id == p.audioTrack) } ?: emptyList()
        textTracks = p.spuTracks?.filter { it.id >= 0 }?.map { TrackOption(it.name ?: "", it.id, it.id == p.spuTrack) } ?: emptyList()
        _audioCount.value = audioTracks.size
        _subCount.value = textTracks.size
    }

    /** What libVLC reports about the stream, read off the main thread (see [watchdog]). */
    private class Snapshot(val shown: Int, val read: Long, val videoTracks: Int, val audioTracks: Int)

    @Volatile private var snapshotBusy = false

    /** Anything at all came back from the stream since the open: bytes, a decoded picture or a found track (HLS reports no bytes). */
    @Volatile private var sawLife = false

    /** The last snapshot saw more bytes than the one before: the stream is flowing. */
    @Volatile private var receivingNow = false

    /**
     * Every [WATCH_MS]: is the picture moving? The counters come from libVLC, whose calls wait on a lock a
     * connection stuck on a dead server holds, so they are read on the control thread and only the verdict
     * is taken here. The "nothing arrived" verdict needs no libVLC call at all.
     */
    private val watchdog = object : Runnable {
        override fun run() {
            val p = player ?: return
            val url = currentUrl ?: return
            // Nothing has arrived since the open: an unreachable or silent server raises no event of its own,
            // and without this the picture stayed black for good. Two silent opens is a failure.
            if (!hasPlayed && SystemClock.elapsedRealtime() - openedAt > OPEN_TIMEOUT_MS && !sawLife) {
                lost(OPEN_TIMEOUT_WHY, fatalAfter = 1)
                return
            }
            if (!snapshotBusy) {
                snapshotBusy = true
                val gen = openGen
                ctl.post {
                    val snap = runCatching {
                        val stats = p.media?.stats
                        if (stats == null) null else Snapshot(
                            maxOf(stats.decodedVideo, stats.displayedPictures),
                            stats.demuxReadBytes.toLong(), p.videoTracksCount, p.audioTracksCount,
                        )
                    }.getOrNull()
                    main.post { snapshotBusy = false; if (gen == openGen && currentUrl == url) judge(snap, url) }
                }
            }
            main.postDelayed(this, WATCH_MS)
        }
    }

    private fun judge(snap: Snapshot?, url: String) {
        if (snap == null) return
        // Decoded pictures, not displayed ones: with the hardware decoder rendering straight to the surface
        // libVLC never counts a displayed picture, and that read as a frozen channel.
        val shown = snap.shown
        val read = snap.read
        val noVideo = snap.videoTracks == 0 && snap.audioTracks > 0
        _audioOnlyMedia.value = noVideo && SystemClock.elapsedRealtime() - openedAt > AUDIO_ONLY_AFTER_MS
        if (read > 0L || shown > 0 || snap.videoTracks > 0 || snap.audioTracks > 0) sawLife = true
        val dataFlows = read > lastRead
        receivingNow = dataFlows
        if (!noVideo && dataFlows && shown == lastShown && !_buffering.value) stuckChecks++ else if (shown != lastShown) stuckChecks = 0
        if (!noVideo && dataFlows && shown == lastShown && SystemClock.elapsedRealtime() - openedAt > FIRST_PICTURE_MS && !hasPlayed) stuckChecks++
        lastShown = shown; lastRead = read
        if (stuckChecks >= STUCK_CHECKS) {
            stuckChecks = 0
            if (!softwareTried) {
                LiveDiagnosticsLog.event("picture stuck while data arrives — reopening on the software decoder")
                softwareTried = true
                SOFTWARE_URLS += url
                open(url)
            }
        }
    }

    private val reconnectRun = Runnable { currentUrl?.let { open(it) } }

    private fun lost(why: String, fatalAfter: Int = MAX_RECONNECTS) {
        val url = currentUrl ?: return
        if (gaveUp) return
        if (reconnects >= fatalAfter) {
            gaveUp = true
            LiveDiagnosticsLog.event("gave up after $reconnects reconnects ($why)")
            _state.value = State.ERROR; _isPlaying.value = false; _buffering.value = false
            _error.value = PlaybackFailure.LostConnection
            _errorInfo.value = ErrorInfo(null, null, why)
            // A server that never answered leaves libVLC's input thread holding the player's lock, and every
            // later call on it (the next channel's open included) would queue behind. Start over on a new player.
            if (why == OPEN_TIMEOUT_WHY) replaceWedgedPlayer()
            return
        }
        reconnects++
        if (hasPlayed) noteStall() // a stream that was playing and dropped: the connection, not the channel
        LiveDiagnosticsLog.event("reconnect $reconnects/$MAX_RECONNECTS after $why")
        _state.value = State.LOADING; _buffering.value = true
        if (_stalledSinceMs.value == null) _stalledSinceMs.value = SystemClock.elapsedRealtime()
        main.removeCallbacks(reconnectRun)
        main.postDelayed(reconnectRun, RECONNECT_BASE_MS * reconnects)
        val provider = reconnectUrlProvider ?: return
        Thread {
            val fresh = runCatching { kotlinx.coroutines.runBlocking { provider.freshUrl() } }.getOrNull()
            if (fresh != null && fresh != url) main.post { if (currentUrl == url) currentUrl = fresh }
        }.start()
    }

    /**
     * A server that never answered leaves libVLC's input thread holding the player's lock, and every later
     * call on that player (the next channel's open included) would queue behind it. The next open starts on
     * a new player. The old one is never released: `libvlc_media_player_release` destroys that lock while the
     * input thread still holds it and aborts the whole process. It is let go of (listener off, picture
     * detached, off every thread in use) and left to finish by itself; one small leak per dead server.
     */
    private fun replaceWedgedPlayer() {
        val oldPlayer = player ?: return
        player = null
        attachPending = false
        control = android.os.HandlerThread("vlc-control").apply { start() }
        ctl = Handler(control.looper)
        Thread({
            runCatching { oldPlayer.setEventListener(null); oldPlayer.vlcVout.detachViews() }
        }, "vlc-reap").start()
    }

    fun stop() {
        LiveDiagnosticsLog.event("stop() — intentional")
        main.removeCallbacks(watchdog); main.removeCallbacks(reconnectRun)
        currentUrl = null
        player?.let { p -> ctl.removeCallbacksAndMessages(null); ctl.post { p.stop() } }
        _state.value = State.IDLE; _isPlaying.value = false; _buffering.value = false
        _error.value = null; _errorInfo.value = null; _stalledSinceMs.value = null
        _videoRes.value = null; _videoSize.value = null; _videoAspect.value = null; _videoFps.value = null
        _streamChips.value = emptyList(); _audioOnlyMedia.value = false
    }

    fun release() {
        stop()
        player?.let { p -> p.setEventListener(null); p.vlcVout.detachViews(); ctl.post { p.release() } }
        player = null
        ctl.post { control.quitSafely() }
    }

    fun abandon(reason: String) {
        LiveDiagnosticsLog.event("abandon: $reason")
        gaveUp = true
        player?.let { p -> ctl.post { p.stop() } }
        _state.value = State.ERROR
    }

    // ---- what the tune controller asks --------------------------------------------------------------------

    val contentBroken: Boolean get() = false
    val stillReconnecting: Boolean get() = !gaveUp && reconnects > 0
    val receivingData: Boolean get() = receivingNow
    val isHlsStream: Boolean get() = currentUrl?.contains(".m3u8", ignoreCase = true) == true
    val providerBackOffsSpent: Int get() = 0
    val activePrerollSecs: Int get() = 0
    fun livePositionMs(): Long = player?.time?.coerceAtLeast(0L) ?: 0L
    fun releaseDecoderForUhd() {}
    fun onMemoryPressure() {}
    fun setMaxVideoHeight(@Suppress("UNUSED_PARAMETER") height: Int?) {}
    fun setTunnelingAllowed(@Suppress("UNUSED_PARAMETER") allowed: Boolean) {}
    fun onAppBackgrounded() { player?.let { p -> ctl.post { p.pause() } } }
    fun onAppForegrounded() { if (currentUrl != null) player?.let { p -> ctl.post { p.play() } } }
    fun discardBackgroundRestore() {}

    fun setMuted(m: Boolean) {
        muted = m
        player?.volume = if (m) 0 else _volume.value
    }

    fun setLiveBufferSecs(secs: Int?) { liveBufferSecs = secs }

    private fun aspectLabel(ratio: Float): String = when {
        kotlin.math.abs(ratio - 16f / 9f) < 0.05f -> "16:9"
        kotlin.math.abs(ratio - 4f / 3f) < 0.05f -> "4:3"
        else -> "%.2f:1".format(java.util.Locale.ROOT, ratio)
    }

    // ---- PlaybackEngine -----------------------------------------------------------------------------------

    override fun togglePlayPause() {
        val p = player ?: return
        ctl.post { if (p.isPlaying) p.pause() else p.play() }
    }
    override fun setZoomMode(mode: ZoomMode) { _zoomMode.value = mode }
    override fun adjustVolume(delta: Int) {
        _volume.value = (_volume.value + delta).coerceIn(0, 100)
        if (!muted) player?.volume = _volume.value
    }
    override fun toggleMute() = setMuted(!muted)
    override fun retry() { currentUrl?.let { reconnects = 0; gaveUp = false; open(it) } }
    override fun selectAudio(id: Int) { player?.audioTrack = id; readTracks() }
    override fun selectSubtitle(id: Int) { player?.spuTrack = id; readTracks() }
    override fun disableSubtitles() { player?.spuTrack = -1; readTracks() }
    override fun audioTracks(): List<TrackOption> = audioTracks
    override fun textTracks(): List<TrackOption> = textTracks
    override fun enterAudioOnly() { _audioOnly.value = true }
    override fun exitAudioOnly() { _audioOnly.value = false }

    private fun vlcOptions() = arrayListOf(
        "--http-reconnect",
        // Interlaced channels (576i) come out of the decoder as fields; let libVLC pick a deinterlacer.
        "--deinterlace=-1",
        "--deinterlace-mode=yadif",
        "--audio-time-stretch",
        "--stats",
    )

    companion object {
        /** Kept for the tune controller's watchers: playback this long earns back the reconnect budget. */
        internal const val HEALTHY_MS = 60_000L
        internal const val DEATH_VERDICT_MS = 30_000L
        private const val DEFAULT_UA = "VLC/3.0.20 LibVLC/3.0.20"
        /** The cache behind the picture when the latency setting says nothing: enough for a slow segment. */
        private const val DEFAULT_CACHE_SECS = 3
        private const val MIN_CACHE_MS = 1_000
        private const val MAX_CACHE_MS = 30_000
        private const val WATCH_MS = 2_000L
        /** The longest the main thread waits for libVLC to let go of a surface. */
        private const val DETACH_WAIT_MS = 400L
        /** No byte received this long after opening: the server is not answering. */
        private const val OPEN_TIMEOUT_MS = 10_000L
        private const val OPEN_TIMEOUT_WHY = "open timeout"
        private const val STUCK_CHECKS = 3
        private const val FIRST_PICTURE_MS = 6_000L
        private const val AUDIO_ONLY_AFTER_MS = 5_000L
        private const val MAX_RECONNECTS = 6
        private const val RECONNECT_BASE_MS = 1_000L
        /** Channels that needed the software decoder this session: they open on it straight away. */
        private val SOFTWARE_URLS = java.util.Collections.synchronizedSet(HashSet<String>())
    }
}
