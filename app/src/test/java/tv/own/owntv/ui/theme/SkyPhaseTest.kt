package tv.own.owntv.ui.theme

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import tv.own.owntv.features.shell.components.SkyPhase

class SkyPhaseTest {
    @Test fun nightIsAllMoon() {
        val p = SkyPhase.at(2f)
        assertEquals(1f, p.moon, 0.01f)
        assertEquals(0f, p.sun, 0.01f)
    }

    @Test fun noonIsAllSunWithFullRays() {
        val p = SkyPhase.at(13f)
        assertEquals(1f, p.sun, 0.01f)
        assertEquals(1f, p.rays, 0.01f)
        assertEquals(0f, p.horizon, 0.01f)
    }

    @Test fun morningAndEveningSitLowOnTheHorizon() {
        assertTrue(SkyPhase.at(6.5f).horizon > 0.5f)
        assertTrue(SkyPhase.at(19.5f).horizon > 0.5f)
        assertTrue(SkyPhase.at(7f).rays < SkyPhase.at(13f).rays)
    }

    @Test fun sunAndMoonAlwaysAddUpToOne() {
        var h = 0f
        while (h < 24f) { val p = SkyPhase.at(h); assertEquals(1f, p.sun + p.moon, 0.001f); h += 0.25f }
    }

    @Test fun nothingJumpsBetweenNeighbouringMinutes() {
        var prev = SkyPhase.at(0f)
        var h = 1f / 60f
        while (h < 24f) {
            val p = SkyPhase.at(h)
            assertTrue(kotlin.math.abs(p.sun - prev.sun) < 0.02f)
            assertTrue(kotlin.math.abs(p.rays - prev.rays) < 0.02f)
            prev = p; h += 1f / 60f
        }
    }

    @Test fun hourWrapsAroundMidnight() {
        assertEquals(SkyPhase.at(1f).sun, SkyPhase.at(25f).sun, 0.0001f)
        assertEquals(SkyPhase.at(23f).moon, SkyPhase.at(-1f).moon, 0.0001f)
    }
}
