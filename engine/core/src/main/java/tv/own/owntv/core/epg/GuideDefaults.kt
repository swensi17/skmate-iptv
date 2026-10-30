package tv.own.owntv.core.epg

import org.json.JSONObject
import java.net.URI

/** One guide SkMate attaches on its own (see `assets/epg/guides.json`). */
data class DefaultGuide(val name: String, val url: String, val logos: Boolean = false)

/**
 * The guides a playlist gets without the user typing a single address: its own (`url-tvg`), else its
 * provider's (matched by the playlist host), then the shared guides that fill the channels the first
 * ones lack and bring logos. The table is `assets/epg/guides.json`, so a provider is added there, not here.
 */
class GuideDefaults(private val providers: List<Provider>, private val shared: List<DefaultGuide>) {

    data class Provider(val name: String, val hosts: List<String>, val guides: List<String>)

    /**
     * The guides for a playlist at [playlistUrl] whose header named [ownGuides] (`url-tvg`, possibly
     * comma-separated), in priority order and without repeats.
     */
    fun forPlaylist(playlistName: String, playlistUrl: String?, ownGuides: String?): List<DefaultGuide> {
        val own = ownGuides.orEmpty().split(',').map { it.trim() }.filter { it.startsWith("http", ignoreCase = true) }
        val first = if (own.isNotEmpty()) {
            own.map { DefaultGuide(playlistName, it) }
        } else {
            providerFor(playlistUrl)?.let { p -> p.guides.map { DefaultGuide(p.name, it) } }.orEmpty()
        }
        return (first + shared).distinctBy { it.url }
    }

    /** The provider whose host is the playlist's host or one of its parent domains. */
    fun providerFor(playlistUrl: String?): Provider? {
        val host = hostOf(playlistUrl) ?: return null
        return providers.firstOrNull { p -> p.hosts.any { h -> host == h || host.endsWith(".$h") } }
    }

    companion object {
        const val ASSET = "epg/guides.json"

        fun parse(json: String): GuideDefaults {
            val root = JSONObject(json)
            val providers = root.optJSONArray("providers")?.let { arr ->
                (0 until arr.length()).map { i ->
                    val o = arr.getJSONObject(i)
                    Provider(
                        name = o.getString("name"),
                        hosts = o.getJSONArray("hosts").let { h -> (0 until h.length()).map { h.getString(it).lowercase() } },
                        guides = o.getJSONArray("guides").let { g -> (0 until g.length()).map { g.getString(it) } },
                    )
                }
            }.orEmpty()
            val shared = root.optJSONArray("shared")?.let { arr ->
                (0 until arr.length()).map { i ->
                    val o = arr.getJSONObject(i)
                    DefaultGuide(o.getString("name"), o.getString("url"), o.optBoolean("logos", false))
                }
            }.orEmpty()
            return GuideDefaults(providers, shared)
        }

        internal fun hostOf(url: String?): String? =
            runCatching { URI(url?.trim()?.substringBefore('|')).host?.lowercase()?.removePrefix("www.") }.getOrNull()
    }
}
