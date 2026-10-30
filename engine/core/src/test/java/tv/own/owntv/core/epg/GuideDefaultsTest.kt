package tv.own.owntv.core.epg

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

class GuideDefaultsTest {

    private val defaults = GuideDefaults.parse(
        """
        {"providers":[{"name":"TV Team","hosts":["tv.team","troya.tv"],"guides":["http://epg.team/tvteam.xml"]}],
         "shared":[{"name":"Shared","url":"http://example.org/ru2.xml.gz","logos":true}]}
        """.trimIndent(),
    )

    @Test
    fun ownGuideComesFirstAndProviderIsSkipped() {
        val guides = defaults.forPlaylist("My list", "http://tv.team/pl/21/abc/playlist.m3u8", "http://a.example/epg.xml, http://b.example/epg.xml.gz")
        assertEquals(listOf("http://a.example/epg.xml", "http://b.example/epg.xml.gz", "http://example.org/ru2.xml.gz"), guides.map { it.url })
        assertEquals("My list", guides.first().name)
    }

    @Test
    fun providerGuideWhenThePlaylistNamesNone() {
        val guides = defaults.forPlaylist("My list", "http://tv.team/pl/21/abc/playlist.m3u8", null)
        assertEquals(listOf("http://epg.team/tvteam.xml", "http://example.org/ru2.xml.gz"), guides.map { it.url })
        assertEquals("TV Team", guides.first().name)
    }

    @Test
    fun providerMatchesMirrorsAndSubdomainsButNotLookalikes() {
        assertEquals("TV Team", defaults.providerFor("http://www.troya.tv/pl/1/x/playlist.m3u8")?.name)
        assertEquals("TV Team", defaults.providerFor("http://s1.tv.team/pl.m3u|User-Agent=x")?.name)
        assertNull(defaults.providerFor("http://nottv.team/pl.m3u"))
        assertNull(defaults.providerFor("not a url"))
    }

    @Test
    fun sharedGuidesOnlyForAnUnknownPlaylistAndNoRepeats() {
        assertEquals(listOf("http://example.org/ru2.xml.gz"), defaults.forPlaylist("x", "http://other.example/a.m3u", "").map { it.url })
        assertEquals(1, defaults.forPlaylist("x", null, "http://example.org/ru2.xml.gz").size)
        assertEquals(true, defaults.forPlaylist("x", null, null).single().logos)
    }

    @Test
    fun shippedTableParses() {
        val file = File("src/main/assets/${GuideDefaults.ASSET}")
        val shipped = GuideDefaults.parse(file.readText())
        assertEquals("TV Team", shipped.providerFor("http://tv.team/pl/21/abc/playlist.m3u8")?.name)
    }
}
