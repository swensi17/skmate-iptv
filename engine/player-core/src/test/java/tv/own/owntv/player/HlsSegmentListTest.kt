package tv.own.owntv.player

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HlsSegmentListTest {
    private val base = "http://host.example/iptv/key/1/index.m3u8"

    @Test fun absoluteAndRelativeSegmentsKeepTheirOrder() {
        val text = "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:5\n#EXTINF:10,\nhttp://a.example/1.ts?md5=x\n#EXTINF:10,\n2.ts\n"
        assertEquals(listOf("http://a.example/1.ts?md5=x", "http://host.example/iptv/key/1/2.ts"), HlsSegmentList.parse(text, base))
    }

    @Test fun masterPlaylistsByteRangesAndInitSectionsAreLeftAlone() {
        assertNull(HlsSegmentList.parse("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nlow.m3u8\n", base))
        assertNull(HlsSegmentList.parse("#EXTM3U\n#EXTINF:4,\n#EXT-X-BYTERANGE:100@0\na.ts\n", base))
        assertNull(HlsSegmentList.parse("#EXTM3U\n#EXT-X-MAP:URI=\"init.mp4\"\n#EXTINF:4,\na.m4s\n", base))
        assertNull(HlsSegmentList.parse("not a playlist", base))
    }

    @Test fun averageDurationComesFromTheExtinfLines() {
        assertEquals(10.08, HlsSegmentList.averageSecs("#EXTM3U\n#EXTINF:10.080000,\na.ts\n#EXTINF:10.080000,\nb.ts\n")!!, 0.001)
        assertNull(HlsSegmentList.averageSecs("#EXTM3U\n"))
    }
}
