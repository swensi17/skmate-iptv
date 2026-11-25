package tv.own.owntv.core.content

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Adult categories (see [AdultCategoryClassifier]) closed on every profile, not only a kids one: their groups and
 * channels stay out of every list until the profile's PIN opens them, and they close again when the app restarts.
 * [setEnabled] follows the setting (on by default); [unlock] is the PIN's answer, for this run of the app only.
 */
object AdultLock {
    @Volatile private var enabled = true
    @Volatile private var unlocked = false
    private val _locked = MutableStateFlow(true)

    /** True while adult categories are hidden from a profile that is not a kids one. */
    val locked: StateFlow<Boolean> = _locked.asStateFlow()

    /** Whether the lock is on at all (Settings); off, adult categories show as any other. */
    val isEnabled: Boolean get() = enabled

    fun setEnabled(on: Boolean) {
        enabled = on
        publish()
    }

    /** The PIN was right: open them until the app restarts. */
    fun unlock() {
        unlocked = true
        publish()
    }

    /** Close them again now. */
    fun lock() {
        unlocked = false
        publish()
    }

    private fun publish() {
        _locked.value = enabled && !unlocked
    }

    /** The PIN that opens them on a profile that has none of its own, as in other players. */
    const val DEFAULT_PIN = "0000"
}
