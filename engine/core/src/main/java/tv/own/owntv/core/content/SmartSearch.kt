package tv.own.owntv.core.content

import java.text.Normalizer

/**
 * What a typed search means, before any table is read.
 *
 * A viewer with a remote types little and types badly: Caps Lock on, the wrong keyboard layout
 * ("ntktrfyfk" for "телеканал"), Latin letters for a Russian name ("kino"), one letter off. Each of
 * these is turned into the spellings it could have meant ([QueryVariants]), and every row that comes
 * back is ordered by how well its name answers the typed text ([SearchRank]). Pure Kotlin on purpose:
 * it runs the same on a JVM test as on a television.
 */
object SearchText {

    /** Lower case, ё as е, no accents, no apostrophes, one space between words. */
    fun normalize(s: String): String {
        val lower = s.lowercase().replace('ё', 'е').replace('Ё', 'е')
        val decomposed = Normalizer.normalize(lower, Normalizer.Form.NFD)
        val sb = StringBuilder(decomposed.length)
        var pendingSpace = false
        for (ch in decomposed) {
            val type = Character.getType(ch)
            if (type == Character.NON_SPACING_MARK.toInt() || type == Character.COMBINING_SPACING_MARK.toInt()) {
                // NFD splits й into и + breve and ў into у + breve; those are letters of their own, not accents.
                if (ch == BREVE && sb.isNotEmpty()) {
                    when (sb.last()) {
                        'и' -> sb.setCharAt(sb.length - 1, 'й')
                        'у' -> sb.setCharAt(sb.length - 1, 'ў')
                    }
                }
                continue
            }
            if (ch in APOSTROPHES) continue
            if (ch.isLetterOrDigit()) {
                if (pendingSpace && sb.isNotEmpty()) sb.append(' ')
                pendingSpace = false
                sb.append(ch)
            } else {
                pendingSpace = true
            }
        }
        return sb.toString()
    }

    /** The words of a normalized string. */
    fun words(normalized: String): List<String> = if (normalized.isEmpty()) emptyList() else normalized.split(' ')

    private const val BREVE = '\u0306'
    private val APOSTROPHES = setOf('\'', '’', '‘', 'ʻ', 'ʼ', '`', '´')
}

/** The ЙЦУКЕН ↔ QWERTY key pairs, and the Latin ↔ Cyrillic spellings of the same sounds. */
object KeyboardLayouts {
    private const val EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,./`"
    private const val RU = "йцукенгшщзхъфывапролджэячсмитьбю.ё"

    private val enToRu: Map<Char, Char> = EN.zip(RU).toMap()
    private val ruToEn: Map<Char, Char> = RU.zip(EN).toMap()

    /** "ntktrfyfk" → "телеканал", "ьщмшу" → "movie"; null when nothing in [s] is a letter of either layout. */
    fun swapped(s: String): String? {
        var latin = 0
        var cyrillic = 0
        for (ch in s) {
            if (ch in 'a'..'z') latin++ else if (ch in 'а'..'я' || ch == 'ё') cyrillic++
        }
        if (latin == 0 && cyrillic == 0) return null
        val map = if (latin >= cyrillic) enToRu else ruToEn
        val sb = StringBuilder(s.length)
        for (ch in s) sb.append(map[ch] ?: ch)
        return sb.toString()
    }

    private val cyrToLatRu: Map<Char, String> = mapOf(
        'а' to "a", 'б' to "b", 'в' to "v", 'г' to "g", 'д' to "d", 'е' to "e", 'ж' to "zh", 'з' to "z",
        'и' to "i", 'й' to "y", 'к' to "k", 'л' to "l", 'м' to "m", 'н' to "n", 'о' to "o", 'п' to "p",
        'р' to "r", 'с' to "s", 'т' to "t", 'у' to "u", 'ф' to "f", 'х' to "kh", 'ц' to "ts", 'ч' to "ch",
        'ш' to "sh", 'щ' to "shch", 'ъ' to "", 'ы' to "y", 'ь' to "", 'э' to "e", 'ю' to "yu", 'я' to "ya",
        'ў' to "o", 'қ' to "q", 'ғ' to "g", 'ҳ' to "h",
    )

    /** The Uzbek Latin spelling: x for х, h for ҳ, j for ж, g for ғ (apostrophes are dropped anyway). */
    private val cyrToLatUz: Map<Char, String> = cyrToLatRu + mapOf(
        'х' to "x", 'ж' to "j", 'ц' to "s", 'ҳ' to "h", 'ғ' to "g", 'ў' to "o", 'щ' to "sh", 'й' to "y",
    )

    /** Latin letter groups to Cyrillic, longest first, so "sh" is one letter and not "s" + "h". */
    private val latToCyrRu: List<Pair<String, String>> = listOf(
        "shch" to "щ", "sch" to "щ", "sh" to "ш", "ch" to "ч", "zh" to "ж", "kh" to "х", "ts" to "ц",
        "yu" to "ю", "ya" to "я", "yo" to "е", "ye" to "е", "iy" to "ий", "yi" to "ы",
        "a" to "а", "b" to "б", "c" to "ц", "d" to "д", "e" to "е", "f" to "ф", "g" to "г", "h" to "х",
        "i" to "и", "j" to "ж", "k" to "к", "l" to "л", "m" to "м", "n" to "н", "o" to "о", "p" to "п",
        "q" to "к", "r" to "р", "s" to "с", "t" to "т", "u" to "у", "v" to "в", "w" to "в", "x" to "кс",
        "y" to "й", "z" to "з",
    )

    private val latToCyrUz: List<Pair<String, String>> = listOf(
        "sh" to "ш", "ch" to "ч", "ng" to "нг", "yu" to "ю", "ya" to "я", "yo" to "ё", "ts" to "ц",
        "a" to "а", "b" to "б", "d" to "д", "e" to "е", "f" to "ф", "g" to "г", "h" to "ҳ",
        "i" to "и", "j" to "ж", "k" to "к", "l" to "л", "m" to "м", "n" to "н", "o" to "о", "p" to "п",
        "q" to "қ", "r" to "р", "s" to "с", "t" to "т", "u" to "у", "v" to "в", "x" to "х", "y" to "й",
        "z" to "з", "c" to "ц", "w" to "в",
    )

    fun toLatin(s: String, uzbek: Boolean = false): String {
        val map = if (uzbek) cyrToLatUz else cyrToLatRu
        val sb = StringBuilder(s.length + 4)
        for (ch in s) sb.append(map[ch] ?: ch.toString())
        return sb.toString()
    }

    fun toCyrillic(s: String, uzbek: Boolean = false): String {
        val table = if (uzbek) latToCyrUz else latToCyrRu
        val sb = StringBuilder(s.length)
        var i = 0
        while (i < s.length) {
            var matched = false
            for ((lat, cyr) in table) {
                if (s.startsWith(lat, i)) {
                    sb.append(cyr)
                    i += lat.length
                    matched = true
                    break
                }
            }
            if (!matched) {
                sb.append(s[i])
                i++
            }
        }
        return sb.toString()
    }

    fun hasLatin(s: String): Boolean = s.any { it in 'a'..'z' }
    fun hasCyrillic(s: String): Boolean = s.any { it in 'а'..'я' || it == 'ё' || it in "ўқғҳ" }
}

/**
 * The spellings a typed query may have meant, each normalized, the typed one first.
 *
 * Bounded on purpose: a handful of LIKE scans per keystroke is cheap, a dozen is not.
 */
class QueryVariants private constructor(val typed: String, val all: List<String>) {

    /** The forms to try with `LIKE '%…%'`, which is case-sensitive for non-ASCII letters in SQLite. */
    fun likeForms(): List<String> = all.flatMap { v ->
        listOf(v, v.uppercase(), v.split(' ').joinToString(" ") { w -> w.replaceFirstChar { it.uppercase() } })
    }.distinct().take(MAX_LIKE_FORMS)

    /**
     * Short prefixes for the fuzzy pass: the first [FUZZY_PREFIX] letters of each variant's longest
     * word, so a name one letter off further along still comes back as a candidate.
     */
    fun fuzzyPrefixes(): List<String> = all.mapNotNull { v ->
        SearchText.words(v).maxByOrNull { it.length }?.takeIf { it.length >= SearchRank.FUZZY_MIN_WORD }?.take(FUZZY_PREFIX)
    }.distinct()

    companion object {
        const val MAX_VARIANTS = 6
        const val MAX_LIKE_FORMS = 9
        const val FUZZY_PREFIX = 3

        fun of(query: String): QueryVariants {
            val typed = SearchText.normalize(query)
            if (typed.isEmpty()) return QueryVariants(typed, emptyList())
            val out = LinkedHashSet<String>()
            out += typed
            KeyboardLayouts.swapped(typed)?.let { out += SearchText.normalize(it) }
            val candidates = out.toList()
            for (c in candidates) {
                if (KeyboardLayouts.hasCyrillic(c)) {
                    out += SearchText.normalize(KeyboardLayouts.toLatin(c))
                    out += SearchText.normalize(KeyboardLayouts.toLatin(c, uzbek = true))
                }
                if (KeyboardLayouts.hasLatin(c)) {
                    out += SearchText.normalize(KeyboardLayouts.toCyrillic(c))
                    out += SearchText.normalize(KeyboardLayouts.toCyrillic(c, uzbek = true))
                }
            }
            return QueryVariants(typed, out.filter { it.isNotEmpty() }.take(MAX_VARIANTS))
        }
    }
}

/** How well a name answers the typed text: the smaller the better, null when it does not at all. */
object SearchRank {
    const val EXACT = 0
    const val PREFIX = 1
    const val WORD_PREFIX = 2
    const val SUBSTRING = 3
    const val FUZZY = 4

    /** Rows a table match returned but none of the rules above explain (word order, FTS tokens). */
    const val OTHER = 5

    const val FUZZY_MIN_WORD = 4

    /** Typos allowed in a word of a given length: one from four letters, two from eight. */
    fun allowedEdits(len: Int): Int = when {
        len >= 8 -> 2
        len >= FUZZY_MIN_WORD -> 1
        else -> 0
    }

    fun score(name: String, variants: QueryVariants): Int? = score(SearchText.normalize(name), variants.all)

    fun score(normalizedName: String, variants: List<String>): Int? {
        var best: Int? = null
        val words = SearchText.words(normalizedName)
        for (v in variants) {
            val s = when {
                normalizedName == v -> EXACT
                normalizedName.startsWith(v) -> PREFIX
                words.any { it.startsWith(v) } -> WORD_PREFIX
                normalizedName.contains(v) -> SUBSTRING
                allWordsPrefix(words, v) -> WORD_PREFIX
                allWordsFuzzy(words, v) -> FUZZY
                else -> null
            }
            if (s != null && (best == null || s < best)) best = s
            if (best == EXACT) break
        }
        return best
    }

    /** Every word of the query starts some word of the name ("disc ch" → "Discovery Channel"). */
    private fun allWordsPrefix(nameWords: List<String>, v: String): Boolean {
        val qs = SearchText.words(v)
        return qs.size > 1 && qs.all { q -> nameWords.any { it.startsWith(q) } }
    }

    /** Every word of the query is a word of the name, up to [allowedEdits] letters off. */
    private fun allWordsFuzzy(nameWords: List<String>, v: String): Boolean {
        val qs = SearchText.words(v)
        if (qs.isEmpty()) return false
        return qs.all { q ->
            val max = allowedEdits(q.length)
            nameWords.any { w ->
                w.startsWith(q) || (max > 0 && (damerauLevenshtein(q, w, max) <= max || prefixDistance(q, w, max) <= max))
            }
        }
    }

    /** Edits between [q] and the first `q.length` letters of [w]: "discovry" against "discovery channel". */
    private fun prefixDistance(q: String, w: String, max: Int): Int {
        if (w.length <= q.length) return max + 1
        return damerauLevenshtein(q, w.substring(0, minOf(w.length, q.length + max)), max)
    }

    /**
     * Edit distance counting a swap of two neighbours as one edit, cut off at [max] + 1: the usual
     * two-row dynamic programme with a third row for the transposition.
     */
    fun damerauLevenshtein(a: String, b: String, max: Int = Int.MAX_VALUE): Int {
        if (a == b) return 0
        if (kotlin.math.abs(a.length - b.length) > max) return max + 1
        if (a.isEmpty()) return b.length
        if (b.isEmpty()) return a.length
        var prevPrev = IntArray(b.length + 1)
        var prev = IntArray(b.length + 1) { it }
        var cur = IntArray(b.length + 1)
        for (i in 1..a.length) {
            cur[0] = i
            var rowMin = cur[0]
            for (j in 1..b.length) {
                val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                var d = minOf(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
                if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) {
                    d = minOf(d, prevPrev[j - 2] + 1)
                }
                cur[j] = d
                if (d < rowMin) rowMin = d
            }
            if (rowMin > max) return max + 1
            val t = prevPrev
            prevPrev = prev
            prev = cur
            cur = t
        }
        return prev[b.length]
    }
}
