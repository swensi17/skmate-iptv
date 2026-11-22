package tv.own.owntv.core.customize

/**
 * Names compared the way people read them: runs of digits by their value, the rest letter by letter
 * without case. "2. News" comes before "10. Sport", not after it as plain text order puts it.
 *
 * A total order, safe for any name a playlist sends: only ASCII 0–9 count as digits, a run of digits
 * always sorts before any other character, and names that read the same are settled by plain text order,
 * so a sort never sees an inconsistent answer.
 */
object NaturalOrder : Comparator<String> {
    override fun compare(a: String, b: String): Int {
        var i = 0
        var j = 0
        while (i < a.length && j < b.length) {
            val da = isAsciiDigit(a[i])
            val db = isAsciiDigit(b[j])
            when {
                da && db -> {
                    val ei = digitsEnd(a, i)
                    val ej = digitsEnd(b, j)
                    val c = compareNumbers(a.substring(i, ei), b.substring(j, ej))
                    if (c != 0) return c
                    i = ei
                    j = ej
                }
                da -> return -1
                db -> return 1
                else -> {
                    val c = a[i].lowercaseChar().compareTo(b[j].lowercaseChar())
                    if (c != 0) return c
                    i++
                    j++
                }
            }
        }
        val rest = (a.length - i).compareTo(b.length - j)
        return if (rest != 0) rest else a.compareTo(b)
    }

    private fun compareNumbers(x: String, y: String): Int {
        val nx = x.trimStart('0')
        val ny = y.trimStart('0')
        if (nx.length != ny.length) return nx.length.compareTo(ny.length)
        return nx.compareTo(ny)
    }

    private fun isAsciiDigit(c: Char) = c in '0'..'9'

    private fun digitsEnd(s: String, from: Int): Int {
        var k = from
        while (k < s.length && isAsciiDigit(s[k])) k++
        return k
    }
}
