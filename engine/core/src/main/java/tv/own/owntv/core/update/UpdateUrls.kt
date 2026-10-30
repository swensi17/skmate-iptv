package tv.own.owntv.core.update

import java.net.URI

/** Address and checksum rules for in-app updates, kept free of Android types so they are unit-testable. */
internal object UpdateUrls {
    const val CHECKSUMS_NAME = "SHA256SUMS.txt"

    private val githubHosts = setOf("github.com")
    private val cdnHosts = setOf("objects.githubusercontent.com", "release-assets.githubusercontent.com")

    /** True only for an https asset of [repo]'s own releases on GitHub (or its CDN after the redirect). */
    fun isTrustedAsset(url: String, repo: String): Boolean {
        val uri = runCatching { URI(url) }.getOrNull() ?: return false
        if (uri.scheme != "https" || uri.userInfo != null) return false
        val host = uri.host?.lowercase() ?: return false
        if (uri.port != -1 && uri.port != 443) return false
        return when (host) {
            in githubHosts -> uri.path.orEmpty().startsWith("/$repo/releases/download/")
            in cdnHosts -> true
            else -> false
        }
    }

    /** The hash listed for [name] in a `sha256sum` style file, lower-case, or null. */
    fun sha256For(text: String, name: String): String? = text.lineSequence()
        .map { it.trim().split(Regex("\\s+"), limit = 2) }
        .firstOrNull { it.size == 2 && it[1].trimStart('*') == name && it[0].matches(Regex("[0-9a-fA-F]{64}")) }
        ?.get(0)?.lowercase()

    fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }
}
