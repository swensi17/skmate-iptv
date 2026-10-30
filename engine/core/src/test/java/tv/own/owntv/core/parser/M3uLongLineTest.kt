package tv.own.owntv.core.parser

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class M3uLongLineTest {
    @Test fun aHugeLineIsSkippedAndTheRestStillParses() = runBlocking {
        val huge = "#EXTM3U\n#EXTINF:-1,One\nhttp://a/1.ts\n" + "x".repeat(600_000) + "\n#EXTINF:-1,Two\nhttp://a/2.ts\n"
        val names = mutableListOf<String>()
        M3uParser().parse(huge.byteInputStream()) { names += it.name }
        assertEquals(listOf("One", "Two"), names)
    }
}
