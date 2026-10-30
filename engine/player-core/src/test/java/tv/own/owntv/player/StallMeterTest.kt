package tv.own.owntv.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StallMeterTest {
    private var t = 1_000_000L
    private val meter = StallMeter { t }

    @Test fun healthyConnectionAsksForNothing() {
        assertEquals(0, meter.level())
        assertEquals(0, meter.extraSecs())
    }

    @Test fun threeStallsInTwoMinutesRaiseTheLevel() {
        assertFalse(meter.onStall())
        t += 30_000
        assertFalse(meter.onStall())
        t += 30_000
        assertTrue(meter.onStall())
        assertEquals(1, meter.level())
        assertEquals(StallMeter.SECS_PER_LEVEL, meter.extraSecs())
    }

    @Test fun slowlySpacedStallsDoNot() {
        repeat(6) { assertFalse(meter.onStall()); t += 70_000 }
        assertEquals(0, meter.level())
    }

    @Test fun levelStopsAtTheCeiling() {
        repeat(30) { meter.onStall(); t += 1_000 }
        assertEquals(StallMeter.MAX_LEVEL, meter.level())
    }

    @Test fun quietTimeLowersItAgain() {
        repeat(3) { meter.onStall(); t += 1_000 }
        assertEquals(1, meter.level())
        t += StallMeter.QUIET_MS + 5_000
        assertEquals(0, meter.level())
    }
}
