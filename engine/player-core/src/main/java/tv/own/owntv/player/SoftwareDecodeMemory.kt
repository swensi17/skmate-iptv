package tv.own.owntv.player

import android.content.Context

/**
 * Channels this box could not play on its hardware decoder, kept across launches: the next time such a
 * channel opens straight on the software decoder, instead of a frozen picture and a reopen.
 *
 * Only a hash of each address is stored (addresses carry the subscriber's login), newest last, at most
 * [MAX_ENTRIES].
 */
internal class SoftwareDecodeMemory(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val keys: LinkedHashSet<String> =
        LinkedHashSet(prefs.getString(KEY, "").orEmpty().split(SEP).filter { it.isNotEmpty() })

    @Synchronized
    operator fun contains(url: String): Boolean = hash(url) in keys

    @Synchronized
    fun remember(url: String) {
        val h = hash(url)
        keys.remove(h)
        keys += h
        while (keys.size > MAX_ENTRIES) keys.remove(keys.first())
        prefs.edit().putString(KEY, keys.joinToString(SEP)).apply()
    }

    private fun hash(url: String): String {
        val digest = java.security.MessageDigest.getInstance(ALGORITHM).digest(url.toByteArray())
        return digest.take(HASH_BYTES).joinToString("") { "%02x".format(it) }
    }

    private companion object {
        const val PREFS = "live_software_decode"
        const val KEY = "hashes"
        const val SEP = ","
        const val ALGORITHM = "SHA-256"
        const val HASH_BYTES = 12
        const val MAX_ENTRIES = 300
    }
}
