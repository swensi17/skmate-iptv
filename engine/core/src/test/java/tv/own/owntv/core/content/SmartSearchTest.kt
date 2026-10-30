package tv.own.owntv.core.content

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SmartSearchTest {

    @Test
    fun normalizeFoldsCaseYoAccentsAndApostrophes() {
        assertEquals("первый канал", SearchText.normalize("  ПЕРВЫЙ   Канал "))
        assertEquals("елка", SearchText.normalize("Ёлка"))
        assertEquals("cafe", SearchText.normalize("Café"))
        assertEquals("ozbekiston", SearchText.normalize("O‘zbekiston"))
        assertEquals("tv 1000", SearchText.normalize("TV-1000"))
        assertEquals("йошкар ола", SearchText.normalize("Йошкар-Ола"))
        assertEquals("ўзбекистон", SearchText.normalize("Ўзбекистон"))
        assertEquals("", SearchText.normalize("--- "))
    }

    @Test
    fun wrongLayoutIsRecognised() {
        assertEquals("телеканал", KeyboardLayouts.swapped("ntktrfyfk"))
        assertEquals("комедия", KeyboardLayouts.swapped("rjvtlbz"))
        assertEquals("discovery", KeyboardLayouts.swapped("вшысщмукн"))
        assertNull(KeyboardLayouts.swapped("1234"))
    }

    @Test
    fun transliterationBothWays() {
        assertEquals("kino", KeyboardLayouts.toLatin("кино"))
        assertEquals("kharkiv", KeyboardLayouts.toLatin("харкив"))
        assertEquals("xorazm", KeyboardLayouts.toLatin("хоразм", uzbek = true))
        assertEquals("кино", KeyboardLayouts.toCyrillic("kino"))
        assertEquals("шоу", KeyboardLayouts.toCyrillic("shou"))
        assertEquals("тошкент", KeyboardLayouts.toCyrillic("toshkent", uzbek = true))
        assertEquals("ҳаёт", KeyboardLayouts.toCyrillic("hayot", uzbek = true))
    }

    @Test
    fun variantsStartWithTypedAndStayBounded() {
        val v = QueryVariants.of("Ntktrfyfk")
        assertEquals("ntktrfyfk", v.typed)
        assertTrue("телеканал" in v.all)
        assertTrue(v.all.size <= QueryVariants.MAX_VARIANTS)
        assertEquals(v.all, v.all.distinct())
        assertTrue(QueryVariants.of("   ").all.isEmpty())
    }

    @Test
    fun variantsCoverTranslit() {
        assertTrue("кино" in QueryVariants.of("kino").all)
        assertTrue("kino" in QueryVariants.of("КИНО").all)
    }

    @Test
    fun likeFormsCoverSqliteCaseSensitivity() {
        val forms = QueryVariants.of("первый").likeForms()
        assertTrue("первый" in forms)
        assertTrue("ПЕРВЫЙ" in forms)
        assertTrue("Первый" in forms)
        assertTrue(forms.size <= QueryVariants.MAX_LIKE_FORMS)
    }

    @Test
    fun fuzzyPrefixesTakeTheLongestWord() {
        assertEquals(listOf("dis"), QueryVariants.of("the discovry").fuzzyPrefixes().take(1))
        assertTrue(QueryVariants.of("tv").fuzzyPrefixes().isEmpty())
    }

    @Test
    fun rankOrdersExactPrefixWordSubstringFuzzy() {
        val q = QueryVariants.of("disc")
        assertEquals(SearchRank.EXACT, SearchRank.score("Disc", q))
        assertEquals(SearchRank.PREFIX, SearchRank.score("Discovery Channel", q))
        assertEquals(SearchRank.WORD_PREFIX, SearchRank.score("Animal Discovery", q))
        assertEquals(SearchRank.SUBSTRING, SearchRank.score("Nordisc", q))
        assertNull(SearchRank.score("Sports", q))
    }

    @Test
    fun rankMatchesAcrossLayoutAndCase() {
        assertEquals(SearchRank.PREFIX, SearchRank.score("ПЕРВЫЙ КАНАЛ HD", QueryVariants.of("gthdsq")))
        assertEquals(SearchRank.PREFIX, SearchRank.score("Кино ТВ", QueryVariants.of("KINO")))
        assertEquals(SearchRank.EXACT, SearchRank.score("Ёлки", QueryVariants.of("елки")))
    }

    @Test
    fun rankAllowsOneTypoFromFourLettersTwoFromEight() {
        assertEquals(SearchRank.FUZZY, SearchRank.score("Discovery", QueryVariants.of("dsicovery")))
        assertEquals(SearchRank.FUZZY, SearchRank.score("Discovery Channel", QueryVariants.of("discovry")))
        assertEquals(SearchRank.FUZZY, SearchRank.score("National Geographic", QueryVariants.of("natinoal geografic")))
        assertEquals(SearchRank.FUZZY, SearchRank.score("Sport", QueryVariants.of("spot")))
        assertNull(SearchRank.score("Sport", QueryVariants.of("spxt")))
        assertEquals(SearchRank.FUZZY, SearchRank.score("Discovery", QueryVariants.of("dxxcovery")))
        assertNull(SearchRank.score("Discovery", QueryVariants.of("dxxxovery")))
    }

    @Test
    fun rankMultiWordPrefixes() {
        assertEquals(SearchRank.WORD_PREFIX, SearchRank.score("Discovery Channel HD", QueryVariants.of("disc ch")))
        assertEquals(SearchRank.WORD_PREFIX, SearchRank.score("Discovery Channel HD", QueryVariants.of("ch disc")))
    }

    @Test
    fun damerauLevenshtein() {
        assertEquals(0, SearchRank.damerauLevenshtein("abc", "abc"))
        assertEquals(1, SearchRank.damerauLevenshtein("abc", "acb"))
        assertEquals(1, SearchRank.damerauLevenshtein("abc", "abcd"))
        assertEquals(2, SearchRank.damerauLevenshtein("kitten", "sittin"))
        assertEquals(2, SearchRank.damerauLevenshtein("abcdef", "xbcdyf", 1))
    }
}
