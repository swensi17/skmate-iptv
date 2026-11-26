package tv.own.owntv.player

import org.junit.Assert.assertEquals
import org.junit.Test

class ResolutionLabelTest {
    @Test
    fun `heights are named as TVs name them`() {
        assertEquals("SD 576p", resolutionLabel(576))
        assertEquals("HD 720p", resolutionLabel(720))
        assertEquals("FHD 1080p", resolutionLabel(1088))
        assertEquals("2K 1440p", resolutionLabel(1440))
        assertEquals("UHD 2160p", resolutionLabel(2160))
    }

    @Test
    fun `an odd height stays as it is`() {
        assertEquals("HD 800p", resolutionLabel(800))
    }
}
