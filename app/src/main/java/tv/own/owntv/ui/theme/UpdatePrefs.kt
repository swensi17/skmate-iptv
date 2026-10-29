package tv.own.owntv.ui.theme

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * How this television keeps itself up to date: install a newer release by itself or only say it exists, how
 * often to look, and when it may install (any time, or only at night so nobody is cut off mid-programme).
 */
object UpdatePrefs {
    enum class Every(val hours: Int) { START(0), HOURS_6(6), DAY(24) }
    enum class Window { ANY, NIGHT }

    var auto by mutableStateOf(true)
        private set
    var every by mutableStateOf(Every.HOURS_6)
        private set
    var window by mutableStateOf(Window.ANY)
        private set

    private var prefs: android.content.SharedPreferences? = null

    fun init(context: Context) {
        val p = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).also { prefs = it }
        auto = p.getBoolean(KEY_AUTO, true)
        every = Every.entries.getOrElse(p.getInt(KEY_EVERY, Every.HOURS_6.ordinal)) { Every.HOURS_6 }
        window = Window.entries.getOrElse(p.getInt(KEY_WINDOW, Window.ANY.ordinal)) { Window.ANY }
    }

    fun toggleAuto() { auto = !auto; prefs?.edit()?.putBoolean(KEY_AUTO, auto)?.apply() }
    fun nextEvery() { every = Every.entries[(every.ordinal + 1) % Every.entries.size]; prefs?.edit()?.putInt(KEY_EVERY, every.ordinal)?.apply() }
    fun nextWindow() { window = Window.entries[(window.ordinal + 1) % Window.entries.size]; prefs?.edit()?.putInt(KEY_WINDOW, window.ordinal)?.apply() }

    /** Whether installing is allowed right now: always, or between 02:00 and 06:00 local time. */
    fun mayInstallNow(): Boolean {
        if (window == Window.ANY) return true
        val h = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
        return h in NIGHT_FROM until NIGHT_TO
    }

    private const val FILE = "updates"
    private const val KEY_AUTO = "auto"
    private const val KEY_EVERY = "every"
    private const val KEY_WINDOW = "window"
    private const val NIGHT_FROM = 2
    private const val NIGHT_TO = 6
}
