package tv.own.owntv.core.customize

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.sign
import kotlin.random.Random

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
    fun differentNamesNeverCompareEqual() {
        assertTrue(NaturalOrder.compare("News", "news") != 0)
        assertTrue(NaturalOrder.compare("a01", "a1") != 0)
    }

    /** Random names from digits, letters, punctuation and non-ASCII digits: the order stays a total order. */
    @Test
    fun orderIsConsistentForAnyNames() {
        val alphabet = "0123456789aAbBzZ .-!٣٤١۵"
        val rnd = Random(42)
        val names = List(300) { String(CharArray(rnd.nextInt(0, 7)) { alphabet[rnd.nextInt(alphabet.length)] }) }
        for (x in names) {
            assertEquals(0, NaturalOrder.compare(x, x))
            for (y in names) {
                assertEquals(NaturalOrder.compare(x, y).sign, -NaturalOrder.compare(y, x).sign)
            }
        }
        for (k in 0 until 20_000) {
            val (x, y, z) = Triple(names.random(rnd), names.random(rnd), names.random(rnd))
            if (NaturalOrder.compare(x, y) <= 0 && NaturalOrder.compare(y, z) <= 0) {
                assertTrue("$x <= $y <= $z", NaturalOrder.compare(x, z) <= 0)
            }
        }
        names.sortedWith(NaturalOrder)
    }
}
