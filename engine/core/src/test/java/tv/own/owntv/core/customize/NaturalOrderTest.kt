package tv.own.owntv.core.customize

import org.junit.Assert.assertEquals
import org.junit.Test

class NaturalOrderTest {
    @Test
    fun numberedGroupsComeInNumberOrder() {
        val names = listOf("14. Rest", "1. Federal", "10. Sport", "8. UHD", "2. News", "Kids", "a")
        assertEquals(
            listOf("1. Federal", "2. News", "8. UHD", "10. Sport", "14. Rest", "a", "Kids"),
            names.sortedWith(NaturalOrder),
        )
    }

    @Test
    fun caseDoesNotMatter() {
        assertEquals(0, NaturalOrder.compare("News", "news"))
    }
}
