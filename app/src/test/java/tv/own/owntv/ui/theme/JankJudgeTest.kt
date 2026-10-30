package tv.own.owntv.ui.theme

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class JankJudgeTest {
    private fun JankJudge.feed(gap: Long, times: Int): JankJudge.Verdict {
        var last = JankJudge.Verdict.NONE
        repeat(times) { last = onFrameGap(gap) }
        return last
    }

    @Test fun steadyFramesAreSmooth() {
        assertEquals(JankJudge.Verdict.SMOOTH, JankJudge().feed(16, JankJudge.WINDOW))
    }

    @Test fun mostlyMissedFramesAreSlow() {
        assertEquals(JankJudge.Verdict.SLOW, JankJudge().feed(60, JankJudge.WINDOW))
    }

    @Test fun idleGapsAreNotSlowFrames() {
        val j = JankJudge()
        repeat(100) { assertEquals(JankJudge.Verdict.NONE, j.onFrameGap(2_000)) }
        assertEquals(JankJudge.Verdict.SMOOTH, j.feed(16, JankJudge.WINDOW))
    }

    @Test fun governorNeedsTwoSlowWindowsInARow() {
        var t = 0L
        val g = MotionGovernor({ t })
        repeat(JankJudge.WINDOW) { g.onFrameGap(60) }
        assertFalse(g.throttled)
        var changed = false
        repeat(JankJudge.WINDOW) { changed = g.onFrameGap(60) || changed }
        assertTrue(g.throttled && changed)
    }

    @Test fun aSmoothWindowBetweenResetsTheCount() {
        val g = MotionGovernor({ 0L })
        repeat(JankJudge.WINDOW) { g.onFrameGap(60) }
        repeat(JankJudge.WINDOW) { g.onFrameGap(16) }
        repeat(JankJudge.WINDOW) { g.onFrameGap(60) }
        assertFalse(g.throttled)
    }

    @Test fun triesAgainAfterTheProbeTime() {
        var t = 0L
        val g = MotionGovernor({ t })
        repeat(2 * JankJudge.WINDOW) { g.onFrameGap(60) }
        assertTrue(g.throttled)
        t += MotionGovernor.PROBE_MS + 1
        assertTrue(g.onFrameGap(16))
        assertFalse(g.throttled)
    }

    @Test fun givesUpAfterThreeThrottles() {
        var t = 0L
        val g = MotionGovernor({ t })
        repeat(MotionGovernor.MAX_THROTTLES) {
            repeat(2 * JankJudge.WINDOW) { g.onFrameGap(60) }
            assertTrue(g.throttled)
            t += MotionGovernor.PROBE_MS * 10
            g.onFrameGap(16)
        }
        repeat(2 * JankJudge.WINDOW) { g.onFrameGap(60) }
        t += MotionGovernor.PROBE_MS * 100
        g.onFrameGap(16)
        assertTrue(g.throttled)
    }
}
