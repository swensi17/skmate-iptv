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

    /** One switch for everything that moves: the side menu, a channel opening, the panels over the picture. */
    val smooth: Boolean get() = animationsOn
    val smoothMenu: Boolean get() = smooth
    val smoothPlayer: Boolean get() = smooth
    var speed by mutableStateOf(Speed.NORMAL)
        private set

    private var prefs: android.content.SharedPreferences? = null

    fun init(context: Context) {
        val p = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).also { prefs = it }
        speed = Speed.entries.getOrElse(p.getInt(KEY_SPEED, Speed.NORMAL.ordinal)) { Speed.NORMAL }
    }

    fun nextSpeed() { speed = Speed.entries[(speed.ordinal + 1) % Speed.entries.size]; prefs?.edit()?.putInt(KEY_SPEED, speed.ordinal)?.apply() }

    /** [baseMs] at the chosen speed. */
    fun ms(baseMs: Int): Int = (baseMs * speed.factor).toInt()

    /** [baseMs] at the chosen speed, or 0 (an instant snap) when Animations is Off. Never for `infiniteRepeatable`. */
    fun dur(baseMs: Int): Int = if (animationsOn) ms(baseMs) else 0

    private const val FILE = "motion"
    private const val KEY_SPEED = "speed"
}
