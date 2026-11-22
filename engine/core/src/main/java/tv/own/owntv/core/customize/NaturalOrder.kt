package tv.own.owntv.core.customize

/**
 * Names compared the way people read them: runs of digits by their value, the rest letter by letter
 * without case. "2. News" comes before "10. Sport", not after it as plain text order puts it.
 */
object NaturalOrder : Comparator<String> {
    override fun compare(a: String, b: String): Int {
        var i = 0
        var j = 0
        while (i < a.length && j < b.length) {
            val ca = a[i]
            val cb = b[j]
            if (ca.isDigit() && cb.isDigit()) {
                val ei = digitsEnd(a, i)
                val ej = digitsEnd(b, j)
                val na = a.substring(i, ei).trimStart('0')
                val nb = b.substring(j, ej).trimStart('0')
                if (na.length != nb.length) return na.length - nb.length
                val c = na.compareTo(nb)
                if (c != 0) return c
                i = ei
                j = ej
            } else {
                val c = ca.lowercaseChar().compareTo(cb.lowercaseChar())
                if (c != 0) return c
                i++
                j++
            }
        }
        return (a.length - i) - (b.length - j)
    }

    private fun digitsEnd(s: String, from: Int): Int {
        var k = from
        while (k < s.length && s[k].isDigit()) k++
        return k
    }
}
