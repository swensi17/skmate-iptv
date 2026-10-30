package tv.own.owntv.core.live

import tv.own.owntv.core.content.SearchText
import tv.own.owntv.core.database.entity.ChannelEntity

/**
 * The same channel offered twice: "Первый HD" in one playlist, "Первый канал SD" in another. When one
 * copy will not play, the next is the user's best bet, so the player can hop to it instead of stopping.
 *
 * Two channels are copies when their names agree once quality marks ("HD", "4K", "backup"...) are dropped.
 * Different time zones ("+2") and regions are different names and stay different.
 */
object ChannelMirrors {
    /** How many copies one failure may try before giving up. */
    const val MAX_HOPS = 3

    private val QUALITY = mapOf(
        "4k" to 4, "uhd" to 4, "8k" to 4, "fhd" to 3, "hd" to 2, "hevc" to 2, "h265" to 2, "h264" to 2,
        "sd" to 0, "lq" to 0, "hq" to 2, "50fps" to 2, "60fps" to 2,
    )
    private val NOISE = setOf("backup", "reserve", "reserv", "резерв", "резервный", "mirror", "vip", "new", "tv", "тв") +
        setOf("канал", "channel", "ch", "live")

    /** The name with quality marks and filler words dropped: the key two copies share. */
    fun key(name: String): String =
        tokens(name).filter { it !in QUALITY && it !in NOISE }.joinToString(" ")

    /** 4 for 4K, 3 FHD, 2 HD, 1 unmarked, 0 SD: which copy looks best. */
    fun quality(name: String): Int =
        tokens(name).mapNotNull { QUALITY[it] }.maxOrNull() ?: 1

    /** The first word of the key: what to look candidates up by. */
    fun lookupWord(name: String): String? = key(name).split(' ').firstOrNull { it.length >= 2 }

    /**
     * The copies of [channel] among [candidates], best first: not tried yet, from another playlist before
     * the same one, then by closeness to the quality it had (a SD copy beats nothing, but HD comes first).
     */
    fun pick(channel: ChannelEntity, candidates: List<ChannelEntity>, tried: Set<Long>): List<ChannelEntity> {
        val k = key(channel.name)
        if (k.isEmpty()) return emptyList()
        val q = quality(channel.name)
        return candidates
            .filter { it.id != channel.id && it.id !in tried && it.streamUrl != channel.streamUrl && key(it.name) == k }
            .sortedWith(
                compareBy<ChannelEntity>({ it.sourceId == channel.sourceId }, { kotlin.math.abs(quality(it.name) - q) }, { -quality(it.name) }, { it.id }),
            )
    }

    private fun tokens(name: String): List<String> =
        SearchText.normalize(name.replace(Regex("[\\[\\](){}]"), " ")).split(' ').filter { it.isNotEmpty() }
}
