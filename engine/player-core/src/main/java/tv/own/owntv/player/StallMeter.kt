package tv.own.owntv.player

/**
 * Notices a weak connection from how often a picture stalls, and says how much extra buffer it is worth.
 * Three stalls inside two minutes raise the level by one (at most [MAX_LEVEL]); ten quiet minutes lower it
 * again, so a bad evening does not leave a channel delayed for the rest of the week.
 *
 * Pure arithmetic on a clock it is handed, so every rule is unit-tested.
 */
/** Seconds of extra buffer per level, for the notice that names the new depth. */
const val NETWORK_SECS_PER_LEVEL = StallMeter.SECS_PER_LEVEL

internal class StallMeter(private val now: () -> Long) {
    private val stalls = ArrayDeque<Long>()
    private var level = 0
    private var changedAt = 0L

    /** The current level, 0 for a healthy connection. */
    fun level(): Int {
        decay()
        return level
    }

    /** Extra network buffer, in seconds, the current level asks for. */
    fun extraSecs(): Int = level() * SECS_PER_LEVEL

    /** One stall happened. True when it raised the level. */
    fun onStall(): Boolean {
        decay()
        val t = now()
        stalls.addLast(t)
        while (stalls.isNotEmpty() && t - stalls.first() > WINDOW_MS) stalls.removeFirst()
        if (stalls.size < STALLS_TO_RAISE || level >= MAX_LEVEL) return false
        level++
        changedAt = t
        stalls.clear()
        return true
    }

    private fun decay() {
        val t = now()
        while (level > 0 && t - changedAt > QUIET_MS) {
            level--
            changedAt += QUIET_MS
        }
    }

    companion object {
        const val WINDOW_MS = 120_000L
        const val QUIET_MS = 600_000L
        const val STALLS_TO_RAISE = 3
        const val MAX_LEVEL = 3
        const val SECS_PER_LEVEL = 4
    }
}
