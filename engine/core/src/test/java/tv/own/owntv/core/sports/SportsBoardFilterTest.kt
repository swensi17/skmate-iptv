package tv.own.owntv.core.sports

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import tv.own.owntv.core.database.entity.ChannelEntity

class SportsBoardFilterTest {

    private fun channel(name: String) = ChannelEntity(id = name.hashCode().toLong(), sourceId = 1, name = name, streamUrl = "u")

    private fun item(sport: GuideSport, title: String, start: Long, vararg channels: String) =
        GuideSportItem(sport, title, start, start + 100, channels.map(::channel))

    private val items = listOf(
        item(GuideSport.FOOTBALL, "Benfica – Vicente", 30, "Sport TV+ HD PT"),
        item(GuideSport.FOOTBALL, "Монца – Наполи", 10, "Матч! Футбол 1 HD"),
        item(GuideSport.BASKETBALL, "Fenerbahce – Efes", 20, "S Sport 2 HD TR"),
        item(GuideSport.TENNIS, "ATP Paris", 40, "Arena Sport 4 HD RS"),
    )

    @Test fun countryFromTailHeadAlphabet() {
        assertEquals("GR", SportsBoardFilter.countryOf("Cosmote Sport 2 HD GR"))
        assertEquals("DE", SportsBoardFilter.countryOf("DE| DYN SPORT 1"))
        assertEquals("GB", SportsBoardFilter.countryOf("Sky Sports UK"))
        assertEquals("RU", SportsBoardFilter.countryOf("Старт Триумф HD"))
        assertEquals("TR", SportsBoardFilter.countryOf("Spor Smart İki"))
        assertNull(SportsBoardFilter.countryOf("Eurosport 1 HD"))
        assertNull(SportsBoardFilter.countryOf("Sport 24"))
    }

    @Test fun countriesAndSportsListed() {
        assertEquals(setOf("PT", "RS", "RU", "TR"), SportsBoardFilter.countries(items).toSet())
        assertEquals(listOf(GuideSport.FOOTBALL, GuideSport.BASKETBALL, GuideSport.TENNIS), SportsBoardFilter.sports(items))
    }

    @Test fun everythingShownWhenNothingChosen() {
        assertEquals(4, SportsBoardFilter.apply(items, "", emptySet(), emptySet(), BoardSort.TIME).size)
    }

    @Test fun timeOrderStartsWithTheEarliest() {
        assertEquals(listOf(10L, 20L, 30L, 40L), SportsBoardFilter.apply(items, "", emptySet(), emptySet(), BoardSort.TIME).map { it.startMs })
    }

    @Test fun titleAndChannelOrders() {
        assertEquals("ATP Paris", SportsBoardFilter.apply(items, "", emptySet(), emptySet(), BoardSort.TITLE).first().title)
        assertEquals("Arena Sport 4 HD RS", SportsBoardFilter.apply(items, "", emptySet(), emptySet(), BoardSort.CHANNEL).first().channels.first().name)
    }

    @Test fun sportAndCountryFilters() {
        assertEquals(2, SportsBoardFilter.apply(items, "", setOf(GuideSport.FOOTBALL), emptySet(), BoardSort.TIME).size)
        assertEquals(1, SportsBoardFilter.apply(items, "", emptySet(), setOf("TR"), BoardSort.TIME).size)
        assertEquals(0, SportsBoardFilter.apply(items, "", setOf(GuideSport.TENNIS), setOf("PT"), BoardSort.TIME).size)
    }

    @Test fun searchInAnyLayoutAndWithATypo() {
        assertEquals(listOf("Монца – Наполи"), SportsBoardFilter.apply(items, "vjywf", emptySet(), emptySet(), BoardSort.TIME).map { it.title })
        assertEquals(listOf("Fenerbahce – Efes"), SportsBoardFilter.apply(items, "fenerbache", emptySet(), emptySet(), BoardSort.TIME).map { it.title })
        assertEquals(listOf("Benfica – Vicente"), SportsBoardFilter.apply(items, "sport tv", emptySet(), emptySet(), BoardSort.TIME).map { it.title })
    }

    @Test fun relevancePutsTheViewersCountryAndKnownChannelsFirst() {
        val ru = SportsBoardFilter.apply(items, "", emptySet(), emptySet(), BoardSort.RELEVANCE, SportsBoardFilter.preferredCountries("ru", "UZ"))
        assertEquals("Монца – Наполи", ru.first().title)
    }

    @Test fun preferredCountries() {
        assertEquals(setOf("RU", "UZ"), SportsBoardFilter.preferredCountries("ru", "UZ"))
        assertEquals(setOf("GB"), SportsBoardFilter.preferredCountries("en", null))
    }

    @Test fun russianGuideTitlesAreSport() {
        assertEquals(GuideSport.FOOTBALL, SportOnChannels.sportOf("Футбол. Чемпионат России. Спартак – Зенит", null))
        assertEquals(GuideSport.ICE_HOCKEY, SportOnChannels.sportOf("Хоккей. КХЛ. ЦСКА – СКА", null))
        assertEquals(GuideSport.COMBAT, SportOnChannels.sportOf("Профессиональный бокс. Бой за титул", null))
        assertEquals(GuideSport.MOTORSPORT, SportOnChannels.sportOf("Формула-1. Гран-при Бразилии", null))
        assertEquals(GuideSport.AMERICAN_FOOTBALL, SportOnChannels.sportOf("Американский футбол. НФЛ", null))
        assertNull(SportOnChannels.sportOf("Новости дня", null))
    }

    @Test fun russianSportsChannels() {
        assertEquals(true, SportOnChannels.isSportsChannel("Матч! Арена HD"))
        assertEquals(true, SportOnChannels.isSportsChannel("Матч ТВ"))
        assertEquals(true, SportOnChannels.isSportsChannel("Боец"))
        assertEquals(false, SportOnChannels.isSportsChannel("Первый канал"))
    }
}
