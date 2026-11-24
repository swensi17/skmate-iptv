package tv.own.owntv.features.settings

/**
 * Public XMLTV guides offered as one switch each in Settings → EPG sources. Each covers the usual
 * Russian-language lineup with channel logos, so a playlist without `tvg-id`s or logos gets both once
 * its channels are matched by name. Checked 2026-11-25: every address answers 200 with a gzip feed.
 */
object EpgCatalog {
    data class Guide(val name: String, val url: String)

    val guides = listOf(
        Guide("TV Team", "http://epg.team/tvteam.xml.gz"),
        Guide("it999 RU (epg.one)", "http://epg.it999.ru/ru2.xml.gz"),
        Guide("it999 Edem", "http://epg.it999.ru/edem.xml.gz"),
        Guide("epg.one", "http://epg.one/epg.xml.gz"),
    )
}
