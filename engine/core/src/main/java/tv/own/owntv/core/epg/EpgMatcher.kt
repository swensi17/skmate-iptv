package tv.own.owntv.core.epg

import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope

/**
 * Smart EPG matching: pairs a channel with a guide channel by *name* when the provider's
 * tvg-id is missing or doesn't line up with the EPG feed's ids.
 *
 * Two pure pieces, both easy to unit-test:
 *  - [normalizeForEpg] strips the cosmetic noise IPTV names carry (quality tags, country brackets,
 *    separators) so "DE| FUSS-TV 3 ᴴᴰ" and "fusstv3.de" reduce to comparable tokens.
 *  - [jaroWinkler] scores two normalized strings 0..1; [bestEpgMatch] picks the top candidate.
 *
 * Nothing here touches the DB or DataStore — callers feed in candidates and persist the winner into
 * the existing `CustomizationStore.epgMatches`, so no new table/migration is needed.
 */
object EpgMatcher {

    /** Score at/above which a match is trustworthy enough to apply automatically. */
    const val AUTO_THRESHOLD = 0.92

    /** Score at/above which a match is worth showing for human review (below = ignored). */
    const val REVIEW_THRESHOLD = 0.74

    /** Loose score at/above which a picker entry counts as "related" and floats to the top —
     *  it only affects ordering (never applies a match), so it can be far below [REVIEW_THRESHOLD]. */
    const val PICKER_SUGGEST_THRESHOLD = 0.55

    // Cosmetic tokens that say nothing about *which* channel this is.
    private val NOISE = setOf(
        "hd", "fhd", "uhd", "sd", "4k", "8k", "hq", "lq",
        "hevc", "h265", "h264", "fps", "raw", "vip", "backup", "feed", "alt",
        "1080p", "1080", "720p", "720", "480p", "540p", "2160p", "fullhd",
        "multi", "multisub", "latino",
    )

    // Country/region codes IPTV names tag on as a leading/trailing group prefix ("DE| …", "… UK"),
    // plus the spelled-out country names EPG feeds use ("MTV France" ↔ "FR| MTV").
    // Only stripped at the ends (never mid-name), so a real word in the middle is never lost.
    private val COUNTRY = setOf(
        "us", "uk", "ca", "au", "nz", "ie", "za", "in", "pk",
        "de", "at", "ch", "fr", "es", "pt", "it", "nl", "be", "lu",
        "pl", "cz", "sk", "hu", "ro", "bg", "gr", "tr", "ru", "ua",
        "se", "no", "dk", "fi", "is", "ee", "lv", "lt", "hr", "rs", "si",
        "br", "mx", "ar", "cl", "co", "pe", "ve", "ae", "sa", "qa", "eg",
        "usa", "america", "canada", "australia", "ireland", "england", "scotland", "wales",
        "france", "germany", "deutschland", "austria", "switzerland", "spain", "espana",
        "italy", "italia", "portugal", "netherlands", "holland", "belgium",
        "poland", "polska", "czech", "czechia", "slovakia", "hungary", "romania", "bulgaria",
        "greece", "turkey", "turkiye", "russia", "ukraine",
        "sweden", "norway", "denmark", "finland", "iceland", "croatia", "serbia", "slovenia",
        "brazil", "brasil", "mexico", "argentina", "chile", "colombia", "peru", "venezuela",
        "egypt", "arabia", "arabic",
    )

    // Spelled-out channel numbers normalize to digits so "BBC One" and "BBC 1" compare equal.
    private val NUMBER_WORDS = mapOf(
        "one" to "1", "two" to "2", "three" to "3", "four" to "4", "five" to "5",
        "six" to "6", "seven" to "7", "eight" to "8", "nine" to "9", "ten" to "10",
        "eins" to "1", "zwei" to "2", "drei" to "3",
    )

    /** Cyrillic letters that look like Latin ones, and back: guides type "РБК НD" and "Культуpa". */
    private const val CYRILLIC_LOOKALIKES = "аеорсхукнмтві"
    private const val LATIN_LOOKALIKES = "aeopcxykhmtbi"

    /** A word typed in two alphabets, written in the one its letters can all be read in (most of them, if both). */
    private fun oneScript(word: String): String {
        val cyr = word.filter { it in '\u0400'..'\u04FF' }
        val lat = word.filter { it in 'a'..'z' }
        if (cyr.isEmpty() || lat.isEmpty()) return word
        val toLatin = cyr.all { it in CYRILLIC_LOOKALIKES }
        val toCyrillic = lat.all { it in LATIN_LOOKALIKES }
        val (from, to) = when {
            toLatin && (!toCyrillic || lat.length > cyr.length) -> CYRILLIC_LOOKALIKES to LATIN_LOOKALIKES
            toCyrillic -> LATIN_LOOKALIKES to CYRILLIC_LOOKALIKES
            else -> return word
        }
        return String(CharArray(word.length) { i -> word[i].let { c -> from.indexOf(c).takeIf { it >= 0 }?.let(to::get) ?: c } })
    }

    /** A frame rate written after the quality tag ("РБК HD 50"): not a channel number. */
    private val FRAME_RATES = setOf("25", "30", "50", "60")
    private val QUALITY = setOf("hd", "fhd", "uhd", "sd", "4k", "hq", "fullhd")

    /**
     * "5 канал" is "Пятый канал" in another feed, and guides drop the word "канал" as often as they keep
     * it ("Первый HD"). So a number before "канал" becomes its ordinal and a trailing "канал" goes. The
     * ordinal stays a word: as a digit, "Пятый канал" would read as "Channel 5".
     */
    private val RU_ORDINALS = mapOf(
        "1" to "первый", "2" to "второй", "3" to "третий", "4" to "четвертый", "5" to "пятый",
        "6" to "шестой", "7" to "седьмой", "8" to "восьмой", "9" to "девятый", "10" to "десятый",
    )
    private const val RU_CHANNEL = "канал"

    /**
     * A time-zone copy of a channel: "НТВ +2", "Россия 24 +3 (Омск)". The shift is not part of the
     * name (a "+2" read as a channel number kept "НТВ +8" from ever matching "НТВ"), so it is taken
     * off and compared on its own — the same shift wins, the plain channel is the fallback.
     */
    private val TZ_SHIFT = Regex("(?<![\\p{L}\\p{N}])[+\u2212-](\\d{1,2})(?![\\p{N}])")

    /** The time-zone shift written in [raw] ("+2" → 2), 0 when there is none. */
    fun tzShift(raw: String): Int = TZ_SHIFT.findAll(raw).lastOrNull()?.let { m ->
        val n = m.groupValues[1].toInt()
        if (n > MAX_TZ_SHIFT) 0 else if (m.value.first() == '+') n else -n
    } ?: 0

    private const val MAX_TZ_SHIFT = 12

    /** Taken off a score when the two time-zone shifts differ, so the same shift is preferred. */
    private const val TZ_MISMATCH_PENALTY = 0.03

    private val BRACKETS = Regex("[\\[(\\{][^\\])}]*[\\])}]")
    private val SEPARATORS = Regex("[._\\-:|/+]")
    // Letters and digits of ANY script, not just ASCII: an a-z0-9 class erases Cyrillic, Greek and
    // CJK names entirely, and bestEpgMatch bails out on the resulting empty target — so channels in
    // those scripts could never match a guide entry.
    private val NON_ALNUM = Regex("[^\\p{L}\\p{N} ]")
    private val SPACES = Regex("\\s+")

    /**
     * Reduce a raw channel/EPG name to a comparable token string: lowercase, bracketed tags removed,
     * separators flattened to spaces, cosmetic/quality words dropped, non-alphanumerics stripped.
     * e.g. "DE| FUSS-TV 3 [HD]" -> "fuss 3", "FussTV3.de" -> "fusstv3 de" ... then noise filtered.
     */
    /**
     * Memo for [normalizeForEpg]. Normalising is four regex passes plus a token walk, and the picker
     * re-normalises the *same* channel names on every keystroke — measured at 1.9 s to rank 3,958 rows,
     * of which the normalisation is the bulk. The candidate set repeats heavily across
     * keystrokes, so a bounded cache removes almost all of the repeat cost.
     *
     * Bounded and LRU because the auto-matcher runs this over whole catalogues during sync; an unbounded
     * map would quietly hold every channel name in the app.
     */
    private const val NORMALIZE_CACHE_MAX = 4_096
    private val normalizeCache = object : LinkedHashMap<String, String>(512, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?): Boolean =
            size > NORMALIZE_CACHE_MAX
    }

    fun normalizeForEpg(raw: String): String {
        synchronized(normalizeCache) { normalizeCache[raw] }?.let { return it }
        val computed = normalizeUncached(raw)
        synchronized(normalizeCache) { normalizeCache[raw] = computed }
        return computed
    }

    private fun normalizeUncached(raw: String): String {
        // NFKC first, so decorative compatibility spellings fold to plain letters: "ᴴᴰ" becomes "HD"
        // and is dropped as NOISE below, and halfwidth katakana returns to its normal form.
        // Compose (NFKC), not decompose (NFKD): decomposing would leave combining marks that
        // NON_ALNUM turns into spaces, splitting "Чайка" into two tokens and degrading "ﾊﾟ" to "ハ".
        var s = java.text.Normalizer.normalize(raw, java.text.Normalizer.Form.NFKC).lowercase().replace('ё', 'е')
        s = s.replace(BRACKETS, " ")
        s = s.replace(TZ_SHIFT, " ")
        s = s.replace(SEPARATORS, " ")
        s = s.replace(NON_ALNUM, " ")
        val words = s.split(SPACES).filter { it.isNotBlank() }.map(::oneScript)
        val tokens = words.filterIndexed { i, t -> t !in NOISE && !(t in FRAME_RATES && i > 0 && words[i - 1] in QUALITY) }
            .map { NUMBER_WORDS[it] ?: it }.toMutableList()
        for (i in 0 until tokens.size - 1) if (tokens[i + 1] == RU_CHANNEL) RU_ORDINALS[tokens[i]]?.let { tokens[i] = it }
        if (tokens.size > 1 && tokens.last() == RU_CHANNEL && tokens[tokens.size - 2].any { it.isLetter() }) tokens.removeAt(tokens.size - 1)
        // Drop a country/region tag at either end — but only if a wordy token remains, so channels
        // that ARE a country plus a number ("France 24", "France 2") keep their name.
        fun canDropCountryAt(index: Int) = tokens.size > 1 && tokens[index] in COUNTRY &&
            tokens.filterIndexed { i, _ -> i != index }.any { t -> t.any { it.isLetter() } }
        if (canDropCountryAt(0)) tokens.removeAt(0)
        if (tokens.isNotEmpty() && canDropCountryAt(tokens.size - 1)) tokens.removeAt(tokens.size - 1)
        return tokens.joinToString(" ").trim()
    }

    // ---- Combined similarity: Jaro-Winkler OR token overlap, guarded by channel numbers ----

    // \p{N}, not \d: NON_ALNUM keeps digits of every script, so the guard below has to see them too.
    // Java's \d is ASCII-only, which would let "قناة ٢" and "قناة ٣" look like the same channel.
    private val DIGIT_RUN = Regex("\\p{N}+")

    /** Two names that differ only in spacing: sure enough to link on its own. */
    private const val SPACING_ONLY = 0.97

    /** Different channel numbers ("MTV 2" vs "MTV 3") can never even reach review. */
    private const val DIGIT_MISMATCH_CAP = 0.60

    /** A number on only one side ("MTV" vs "MTV 2") stays below auto-apply — review at best. */
    private const val DIGIT_MISSING_CAP = 0.90

    /**
     * Similarity of two already-normalized names (0..1): the better of Jaro-Winkler (typos,
     * concatenated ids like "fusstv3") and token overlap (reordered words, "MTV France HD" vs
     * "France MTV"), then capped when the embedded channel numbers disagree — string similarity
     * alone happily matches "Sky Sports 2" to "Sky Sports 3", which is always wrong.
     */
    fun scoreNormalized(a: String, b: String): Double =
        scoreNormalized(a, b, digitRuns(a), digitRuns(b))

    /**
     * [scoreNormalized] with both digit-run lists supplied by the caller.
     *
     * A bulk scan compares one name against every candidate, so recomputing each side's digit runs
     * inside the loop re-runs the same regex millions of times over a catalogue — it dominated the
     * scan's allocation. Callers that already know the runs (see [Prepared]) pass them in.
     */
    internal fun scoreNormalized(
        a: String,
        b: String,
        da: List<String>,
        db: List<String>,
        ta: Set<String> = tokens(a),
        tb: Set<String> = tokens(b),
    ): Double {
        if (a.isEmpty() || b.isEmpty()) return 0.0
        if (a == b) return 1.0
        // "TF1 Series" and "TF 1 Series": the same name, spaced differently.
        if (a.length > 3 && a.replace(" ", "") == b.replace(" ", "")) return SPACING_ONLY
        var score = maxOf(jaroWinkler(a, b), tokenDice(ta, tb))
        if (da != db) {
            val cap = if (da.isNotEmpty() && db.isNotEmpty()) DIGIT_MISMATCH_CAP else DIGIT_MISSING_CAP
            score = minOf(score, cap)
        }
        return score
    }

    /** Sørensen–Dice over the two token sets — order-insensitive word overlap. */
    private fun tokenDice(ta: Set<String>, tb: Set<String>): Double {
        if (ta.isEmpty() || tb.isEmpty()) return 0.0
        val inter = ta.count { it in tb }
        return 2.0 * inter / (ta.size + tb.size)
    }

    /**
     * Sorted digit runs with leading zeros dropped, so "MTV 02" and "mtv2" both yield ["2"].
     * Digits are read by numeric value rather than by character, so a run written in another script
     * compares equal to its ASCII spelling — "MTV ٢" and "MTV 2" are the same channel.
     */
    /**
     * The words of a normalized name. Worked out once per name in a bulk scan: splitting both names on
     * every one of millions of comparisons was most of the scan's time and garbage on a weak TV.
     */
    internal fun tokens(s: String): Set<String> = s.split(' ').toSet()

    private fun digitRuns(s: String): List<String> =
        DIGIT_RUN.findAll(s).map { run ->
            val digits = run.value
            // Fast path: almost every run is already ASCII, and this sits in the scoring loop —
            // two calls per candidate per channel, millions of times over a full catalogue.
            val canonical = if (digits.all { it in '0'..'9' }) digits else buildString(digits.length) {
                for (ch in digits) {
                    val value = Character.digit(ch, 10)
                    append(if (value >= 0) Character.forDigit(value, 10) else ch)
                }
            }
            canonical.trimStart('0').ifEmpty { "0" }
        }.toList().sorted()

    /**
     * Jaro–Winkler similarity (0..1) — tolerant of typos/transpositions and biased toward common
     * prefixes, which suits channel names well. Operates on already-normalized strings.
     */
    fun jaroWinkler(a: String, b: String): Double {
        if (a == b) return 1.0
        if (a.isEmpty() || b.isEmpty()) return 0.0

        val jaro = jaro(a, b)
        // Winkler boost: up to 4 leading chars shared, factor 0.1.
        var prefix = 0
        val max = minOf(4, minOf(a.length, b.length))
        while (prefix < max && a[prefix] == b[prefix]) prefix++
        return jaro + prefix * 0.1 * (1 - jaro)
    }

    private fun jaro(a: String, b: String): Double {
        val matchDistance = maxOf(a.length, b.length) / 2 - 1
        val aMatches = BooleanArray(a.length)
        val bMatches = BooleanArray(b.length)
        var matches = 0
        for (i in a.indices) {
            val start = maxOf(0, i - matchDistance)
            val end = minOf(i + matchDistance + 1, b.length)
            for (j in start until end) {
                if (bMatches[j] || a[i] != b[j]) continue
                aMatches[i] = true
                bMatches[j] = true
                matches++
                break
            }
        }
        if (matches == 0) return 0.0

        var transpositions = 0
        var k = 0
        for (i in a.indices) {
            if (!aMatches[i]) continue
            while (!bMatches[k]) k++
            if (a[i] != b[k]) transpositions++
            k++
        }
        val m = matches.toDouble()
        return (m / a.length + m / b.length + (m - transpositions / 2.0) / m) / 3.0
    }

    /** A guide channel to match against — its stable id plus optional human display name. */
    data class Candidate(val epgChannelId: String, val displayName: String?)

    /**
     * A [Candidate] with its names pre-normalized, so a bulk scan normalizes each candidate once.
     * The digit runs are precomputed for the same reason — they are compared on every scoring call.
     */
    data class Prepared(
        val epgChannelId: String,
        val displayName: String?,
        val normName: String,
        val normId: String,
        internal val normNameDigits: List<String> = digitRuns(normName),
        internal val normIdDigits: List<String> = digitRuns(normId),
        internal val normNameTokens: Set<String> = tokens(normName),
        internal val normIdTokens: Set<String> = tokens(normId),
        internal val shift: Int = 0,
    )

    /** The chosen guide channel for a source channel, with the confidence that picked it. */
    data class Result(val epgChannelId: String, val displayName: String?, val score: Double)

    /** Pre-normalize a candidate list once before scanning many channels against it. */
    fun prepare(candidates: List<Candidate>): List<Prepared> = candidates.map {
        val normName = it.displayName?.let(::normalizeForEpg) ?: ""
        val normId = normalizeForEpg(it.epgChannelId)
        Prepared(it.epgChannelId, it.displayName, normName, normId, digitRuns(normName), digitRuns(normId), shift = tzShift(it.displayName ?: it.epgChannelId))
    }

    /**
     * Best guide candidate for [channelName], or null if nothing clears [minScore]. Each candidate is
     * scored on its display name *and* its id (some feeds only have meaningful ids), best of the two.
     */
    fun bestEpgMatch(
        channelName: String,
        candidates: List<Candidate>,
        minScore: Double = REVIEW_THRESHOLD,
    ): Result? = bestEpgMatchPrepared(channelName, prepare(candidates), minScore)

    /** [bestEpgMatch] over a pre-[prepare]d candidate list — the hot path for bulk auto-matching. */
    fun bestEpgMatchPrepared(
        channelName: String,
        candidates: List<Prepared>,
        minScore: Double = REVIEW_THRESHOLD,
    ): Result? {
        val target = normalizeForEpg(channelName)
        if (target.isEmpty()) return null
        val targetDigits = digitRuns(target)
        val targetTokens = tokens(target)
        val targetShift = tzShift(channelName)
        var best: Result? = null
        for (c in candidates) {
            val byName = scoreNormalized(target, c.normName, targetDigits, c.normNameDigits, targetTokens, c.normNameTokens)
            val byId = scoreNormalized(target, c.normId, targetDigits, c.normIdDigits, targetTokens, c.normIdTokens)
            val score = maxOf(byName, byId) - if (c.shift != targetShift) TZ_MISMATCH_PENALTY else 0.0
            if (score >= minScore && (best == null || score > best.score)) {
                best = Result(c.epgChannelId, c.displayName, score)
                if (score == 1.0) break // perfect match — can't beat it
            }
        }
        return best
    }

    /**
     * [bestEpgMatchPrepared] for a whole catalogue at once, scored across all cores.
     *
     * Auto-matching scans every unmatched channel against every guide candidate, so the work grows
     * as channels × candidates: a 1,786-channel lineup against a 1,907-channel guide is ~3.4M
     * scorings. On desktop-class hardware that is seconds; on a 2020 Android TV (armeabi-v7a) the
     * single-threaded loop ran for half an hour of CPU time without finishing, leaving the guide
     * empty behind its "channel ids don't match" banner the whole time.
     *
     * The rows are independent, so splitting them changes nothing but wall clock — the same
     * candidate wins for each name, and results come back in the caller's order. This mirrors
     * [rankForPickerParallel], which already exists for the same reason on the picker path.
     *
     * Returns one entry per name, `null` where nothing cleared [minScore]. Below
     * [PARALLEL_MIN_ITEMS] names the coroutine overhead outweighs the win, so it stays sequential.
     */
    suspend fun bestEpgMatchBulk(
        channelNames: List<String>,
        candidates: List<Prepared>,
        minScore: Double = REVIEW_THRESHOLD,
    ): List<Result?> {
        if (channelNames.isEmpty() || candidates.isEmpty()) return List(channelNames.size) { null }
        if (channelNames.size < PARALLEL_MIN_ITEMS) {
            return channelNames.map { bestEpgMatchPrepared(it, candidates, minScore) }
        }
        // Half the cores: the scan runs in the background (often right at start-up), and taking every core left
        // a weak TV's interface without one, which froze it until the system closed the app.
        val workers = kotlin.math.max(1, Runtime.getRuntime().availableProcessors() / 2)
        val chunkSize = (channelNames.size + workers - 1) / workers
        return coroutineScope {
            channelNames.chunked(chunkSize)
                .map { chunk ->
                    async(Dispatchers.Default) {
                        chunk.map { bestEpgMatchPrepared(it, candidates, minScore) }
                    }
                }
                .flatMap { it.await() }
        }
    }

    /**
     * Whether a picker search for [query] should list a candidate named [displayName] with id [id].
     *
     * This replaces a SQL `LIKE` on the raw text, which had two independent faults. SQLite's `LOWER()`
     * folds **ASCII only**, so a query typed in lowercase Cyrillic or Greek could never match an
     * uppercase display name — those channels were unreachable through the search box no matter what
     * was typed. And a raw substring cannot see through punctuation or spelled-out numbers, so `bbc1`
     * did not find "BBC One" even though the matcher scores that pair 1.0 and would auto-apply it.
     *
     * Both sides therefore go through [normalizeForEpg] — the same normalizer that decides matches, so
     * what the search finds and what the matcher believes can no longer disagree. The comparison is
     * tried twice: as normalized, which handles punctuation and word order ("sky sport" → "Sky-Sports
     * HD"), and with spaces removed, which is what lets `bbc1` reach "BBC One" (normalizing to
     * `bbc 1`, tightening to `bbc1`).
     *
     * A query that normalizes away to nothing — "HD", a lone bracket — falls back to a plain
     * lowercase substring, so it still filters instead of matching the entire guide.
     */
    fun matchesSearch(query: String, displayName: String?, id: String): Boolean {
        val raw = query.trim()
        if (raw.isEmpty()) return true
        if (normalizeForEpg(raw).isEmpty()) {
            val needle = raw.lowercase()
            return displayName?.lowercase()?.contains(needle) == true || id.lowercase().contains(needle)
        }
        return matchesNormalizedSearch(
            query = raw,
            normName = displayName?.let(::normalizeForEpg).orEmpty(),
            normId = normalizeForEpg(id),
        )
    }

    /**
     * [matchesSearch] against names that are **already normalized** — what the stored `normName` /
     * `normId` columns hold since database v41.
     *
     * Identical in behaviour; the only difference is that the candidate's normalization has already
     * happened. That matters because the picker filters a few thousand candidates on every keystroke,
     * and normalizing each one is an NFKC pass plus four regexes that always produce the same answer
     * for a feed that only changes when it is synced.
     *
     * A row that predates the columns arrives here with an empty string, which simply cannot match —
     * so callers must fall back to normalizing on the fly rather than passing a blank through.
     */
    fun matchesNormalizedSearch(query: String, normName: String, normId: String): Boolean {
        val target = normalizeForEpg(query.trim())
        if (target.isEmpty()) return true
        val tight = target.replace(" ", "")
        for (candidate in arrayOf(normName, normId)) {
            if (candidate.isEmpty()) continue
            if (candidate.contains(target)) return true
            if (candidate.replace(" ", "").contains(tight)) return true
        }
        return false
    }

    /**
     * Order picker entries for the manual "Match EPG" dialog: everything scoring at least
     * [PICKER_SUGGEST_THRESHOLD] against [channelName] floats to the top (best first), the rest keep
     * their incoming (alphabetical) order. Ranking only — nothing here applies a match.
     */
    fun <T> rankForPicker(
        channelName: String,
        items: List<T>,
        displayName: (T) -> String?,
        epgChannelId: (T) -> String,
    ): List<T> {
        val target = normalizeForEpg(channelName)
        if (target.isEmpty() || items.isEmpty()) return items
        return order(items, items.map { scoreOne(target, it, displayName, epgChannelId) })
    }

    /**
     * [rankForPicker], scored across all cores.
     *
     * Measured on a real TV: 3,958 candidates took 1.9 s to rank on one thread, which is
     * two seconds of nothing happening after a keystroke. The work is pure CPU over independent rows, so
     * splitting it is free of behaviour change — the scores, the threshold partition and the final order
     * are identical, only the wall clock differs.
     *
     * Below [PARALLEL_MIN_ITEMS] the coroutine overhead outweighs the win, so it stays sequential.
     */
    suspend fun <T> rankForPickerParallel(
        channelName: String,
        items: List<T>,
        displayName: (T) -> String?,
        epgChannelId: (T) -> String,
    ): List<T> {
        val target = normalizeForEpg(channelName)
        if (target.isEmpty() || items.isEmpty()) return items
        if (items.size < PARALLEL_MIN_ITEMS) return rankForPicker(channelName, items, displayName, epgChannelId)
        val workers = kotlin.math.max(2, Runtime.getRuntime().availableProcessors())
        val chunkSize = (items.size + workers - 1) / workers
        val scores = coroutineScope {
            val parts = ArrayList<Deferred<List<Double>>>()
            for (chunk in items.chunked(chunkSize)) {
                parts += async(Dispatchers.Default) {
                    chunk.map { item -> scoreOne(target, item, displayName, epgChannelId) }
                }
            }
            parts.flatMap { it.await() }
        }
        return order(items, scores)
    }

    private fun <T> scoreOne(
        target: String,
        item: T,
        displayName: (T) -> String?,
        epgChannelId: (T) -> String,
    ): Double {
        val byName = displayName(item)?.let { scoreNormalized(target, normalizeForEpg(it)) } ?: 0.0
        val byId = scoreNormalized(target, normalizeForEpg(epgChannelId(item)))
        return maxOf(byName, byId)
    }

    /** Suggested entries (best first), then everything else in its incoming order. */
    private fun <T> order(items: List<T>, scores: List<Double>): List<T> {
        val scored = items.zip(scores)
        val (suggested, rest) = scored.partition { it.second >= PICKER_SUGGEST_THRESHOLD }
        return suggested.sortedByDescending { it.second }.map { it.first } + rest.map { it.first }
    }

    private const val PARALLEL_MIN_ITEMS = 400
}
