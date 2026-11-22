package tv.own.owntv.core.settings

/** The remote's own five keys, as the full-screen channel player reads them with its controls hidden. */
enum class LiveKey { OK, UP, DOWN, LEFT, RIGHT }

/** What one of those keys does while a channel plays full screen. */
enum class LiveKeyAction {
    /** The channel's info line and the player's tiles. */
    INFO,
    CHANNEL_LIST,
    HISTORY,
    NEXT_CHANNEL,
    PREVIOUS_CHANNEL,

    /** Back to the channel watched before this one. */
    LAST_CHANNEL,

    /** Back in time where the channel keeps an archive; without one the key keeps its usual job. */
    REWIND,
    FORWARD,
    PLAY_PAUSE,
    NOTHING,
}

/**
 * The viewer's choice per key. A key left alone does what it always did, including the older
 * "left and right rewind" switch, so nobody's remote changes under them by an update.
 */
data class LiveKeyMap(private val chosen: Map<LiveKey, LiveKeyAction> = emptyMap()) {
    operator fun get(key: LiveKey): LiveKeyAction = chosen[key] ?: defaultFor(key)

    /** Whether the viewer picked something other than the key's usual job. */
    fun isCustom(key: LiveKey): Boolean = chosen[key]?.let { it != defaultFor(key) } ?: false

    fun with(key: LiveKey, action: LiveKeyAction): LiveKeyMap =
        LiveKeyMap(if (action == defaultFor(key)) chosen - key else chosen + (key to action))

    fun encode(): String = chosen.entries.sortedBy { it.key.ordinal }.joinToString(",") { "${it.key.name}=${it.value.name}" }

    companion object {
        val DEFAULT = LiveKeyMap()

        fun defaultFor(key: LiveKey): LiveKeyAction = when (key) {
            LiveKey.OK -> LiveKeyAction.INFO
            LiveKey.UP -> LiveKeyAction.NEXT_CHANNEL
            LiveKey.DOWN -> LiveKeyAction.PREVIOUS_CHANNEL
            LiveKey.LEFT -> LiveKeyAction.CHANNEL_LIST
            LiveKey.RIGHT -> LiveKeyAction.HISTORY
        }

        /** Unknown keys and actions (a newer backup, a typo) are dropped; the rest is kept. */
        fun decode(raw: String?): LiveKeyMap = LiveKeyMap(
            raw.orEmpty().split(',').mapNotNull { part ->
                val (k, v) = part.split('=').takeIf { it.size == 2 } ?: return@mapNotNull null
                val key = LiveKey.entries.firstOrNull { it.name == k.trim() } ?: return@mapNotNull null
                val action = LiveKeyAction.entries.firstOrNull { it.name == v.trim() } ?: return@mapNotNull null
                key to action
            }.toMap(),
        )
    }
}
