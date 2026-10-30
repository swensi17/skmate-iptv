package tv.own.owntv.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import tv.own.owntv.core.player.EnginePreference

/** Every live channel opens on the one live engine (libVLC): no setting, pin, DRM flag or learned refusal changes that. */
class LiveRoutingTest {

    @Test
    fun `live always opens on the one live engine`() {
        for (setting in EnginePreference.entries) {
            for (pin in listOf(null, true, false)) {
                val r = LiveRouting.decide(setting, pin, drmProtected = false, panelRefusesSegments = true)
                assertFalse(r.onMpv)
                assertEquals(EnginePreference.EXO_ONLY, r.preference)
            }
        }
    }
}
