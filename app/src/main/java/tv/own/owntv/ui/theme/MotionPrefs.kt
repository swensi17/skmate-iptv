package tv.own.owntv.ui.theme

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * How the TV moves: the side menu sliding out, the channel opening to full screen, and how fast. Smooth by
 * default; each can be made instant in Settings › Appearance. Kept here, on the device, because it is about this
 * television's taste and speed, not about the playlist.
 */
object MotionPrefs {
    enum class Speed(val factor: Float) { FAST(0.6f), NORMAL(1f), SLOW(1.5f) }

    /** The Settings › Animations switch: when Off nothing moves. Set from the app root, never stored here. */
    var animationsOn by mutableStateOf(true)

    /**
     * The device cannot keep up (a weak box, or the screen was seen dropping frames): animations stand still
     * until it can, whatever the switch says. Only while [auto] is on.
     */
    var throttled by mutableStateOf(false)
        private set

    /** Settings › Animations › Adapt to the device: on a weak television animations switch themselves off. */
    var auto by mutableStateOf(true)
        private set

    /** What actually moves: the user's switch, unless the device is struggling. */
    val active: Boolean get() = animationsOn && !(auto && throttled)

    /** One switch for everything that moves: the side menu, a channel opening, the panels over the picture. */
    val smooth: Boolean get() = active
    val smoothMenu: Boolean get() = smooth
    val smoothPlayer: Boolean get() = smooth
    var speed by mutableStateOf(Speed.NORMAL)
        private set

    private var prefs: android.content.SharedPreferences? = null

    fun init(context: Context) {
        val p = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).also { prefs = it }
        speed = Speed.entries.getOrElse(p.getInt(KEY_SPEED, Speed.NORMAL.ordinal)) { Speed.NORMAL }
        auto = p.getBoolean(KEY_AUTO, true)
        // A weak box starts without animations; so does one that struggled last time. Both are tried again later.
        val weak = isWeakDevice(context) || p.getBoolean(KEY_LEARNED_SLOW, false)
        governor = MotionGovernor(System::currentTimeMillis, startThrottled = weak)
        throttled = governor.throttled
    }

    fun toggleAuto() {
        auto = !auto
        prefs?.edit()?.putBoolean(KEY_AUTO, auto)?.apply()
    }

    private var governor = MotionGovernor(System::currentTimeMillis)
    private var lastFrameNs = 0L

    private val frameCallback = object : android.view.Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            if (monitoring) {
                if (lastFrameNs != 0L && auto) {
                    val changed = governor.onFrameGap((frameTimeNanos - lastFrameNs) / 1_000_000L)
                    if (changed) {
                        throttled = governor.throttled
                        // Remembered, so the next launch does not begin with the stutter this one ended with.
                        prefs?.edit()?.putBoolean(KEY_LEARNED_SLOW, throttled)?.apply()
                    }
                }
                lastFrameNs = frameTimeNanos
                android.view.Choreographer.getInstance().postFrameCallback(this)
            }
        }
    }

    @Volatile private var monitoring = false

    /** Watch the frames while the app is on screen (call from onStart); the first seconds, which compile and load, do not count. */
    fun startMonitoring() {
        if (monitoring) return
        monitoring = true
        lastFrameNs = 0L
        android.view.Choreographer.getInstance().postFrameCallbackDelayed(frameCallback, STARTUP_GRACE_MS)
    }

    fun stopMonitoring() {
        monitoring = false
        android.view.Choreographer.getInstance().removeFrameCallback(frameCallback)
    }

    /** Little memory or few cores: animations cost more than they give here. */
    private fun isWeakDevice(context: Context): Boolean {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? android.app.ActivityManager ?: return false
        val mem = android.app.ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        return am.isLowRamDevice || mem.totalMem < WEAK_RAM_BYTES || Runtime.getRuntime().availableProcessors() <= 2
    }

    fun nextSpeed() { speed = Speed.entries[(speed.ordinal + 1) % Speed.entries.size]; prefs?.edit()?.putInt(KEY_SPEED, speed.ordinal)?.apply() }

    /** [baseMs] at the chosen speed. */
    fun ms(baseMs: Int): Int = (baseMs * speed.factor).toInt()

    /** [baseMs] at the chosen speed, or 0 (an instant snap) when Animations is Off. Never for `infiniteRepeatable`. */
    fun dur(baseMs: Int): Int = if (active) ms(baseMs) else 0

    private const val FILE = "motion"
    private const val KEY_SPEED = "speed"
    private const val KEY_AUTO = "auto"
    private const val KEY_LEARNED_SLOW = "learned_slow"
    private const val STARTUP_GRACE_MS = 6_000L
    private const val WEAK_RAM_BYTES = 1_500_000_000L
}
