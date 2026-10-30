package tv.own.owntv.ui.theme

/**
 * Decides from the gaps between frames whether the screen keeps up, so the app can stop animating on a
 * television that cannot, and start again when it can. Pure arithmetic on numbers it is handed.
 *
 * A gap above [JANKY_MS] is a missed frame (two refreshes at 60 Hz). A gap above [IDLE_MS] is the screen
 * having had nothing to draw, not a slow frame, and is ignored. Every [WINDOW] frames the share of missed
 * ones is judged: [SLOW_SHARE] or more is slow, [SMOOTH_SHARE] or less is smooth, in between says nothing.
 */
internal class JankJudge {
    enum class Verdict { NONE, SLOW, SMOOTH }

    private var frames = 0
    private var janky = 0

    fun onFrameGap(gapMs: Long): Verdict {
        if (gapMs <= 0 || gapMs > IDLE_MS) return Verdict.NONE
        frames++
        if (gapMs > JANKY_MS) janky++
        if (frames < WINDOW) return Verdict.NONE
        val share = janky.toFloat() / frames
        frames = 0; janky = 0
        return when {
            share >= SLOW_SHARE -> Verdict.SLOW
            share <= SMOOTH_SHARE -> Verdict.SMOOTH
            else -> Verdict.NONE
        }
    }

    fun reset() { frames = 0; janky = 0 }

    companion object {
        const val WINDOW = 60
        const val JANKY_MS = 34L
        const val IDLE_MS = 400L
        const val SLOW_SHARE = 0.20f
        const val SMOOTH_SHARE = 0.03f
    }
}

/**
 * The self-adjusting part of the animation switch. Two slow windows in a row switch animations off; they
 * are tried again after [PROBE_MS] (longer each time, and not at all after [MAX_THROTTLES]), and kept
 * if the screen is then smooth. [now] is the clock, handed in so every rule is tested.
 */
internal class MotionGovernor(private val now: () -> Long, startThrottled: Boolean = false) {
    private val judge = JankJudge()
    var throttled = startThrottled
        private set
    private var slowInARow = 0
    private var throttles = 0
    private var probeAt = if (startThrottled) now() + PROBE_MS else 0L

    /** Feed one frame gap; returns true when [throttled] changed. */
    fun onFrameGap(gapMs: Long): Boolean {
        if (throttled && throttles < MAX_THROTTLES && probeAt > 0 && now() >= probeAt) {
            throttled = false; probeAt = 0; slowInARow = 0; judge.reset()
            return true
        }
        when (judge.onFrameGap(gapMs)) {
            JankJudge.Verdict.SLOW -> if (!throttled && ++slowInARow >= 2) {
                throttled = true; throttles++; slowInARow = 0
                probeAt = now() + PROBE_MS * throttles
                return true
            }
            JankJudge.Verdict.SMOOTH -> slowInARow = 0
            JankJudge.Verdict.NONE -> Unit
        }
        return false
    }

    companion object {
        const val PROBE_MS = 10 * 60_000L
        const val MAX_THROTTLES = 3
    }
}
