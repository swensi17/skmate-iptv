package tv.own.owntv.core.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateUrlsTest {
    private val repo = "swensi17/skmate-iptv"

    @Test fun acceptsReleaseAssetOfOwnRepo() {
        assertTrue(UpdateUrls.isTrustedAsset("https://github.com/$repo/releases/download/v0.1.0/app.apk", repo))
    }

    @Test fun acceptsGithubCdn() {
        assertTrue(UpdateUrls.isTrustedAsset("https://objects.githubusercontent.com/x/app.apk", repo))
    }

    @Test fun rejectsPlainHttp() {
        assertFalse(UpdateUrls.isTrustedAsset("http://github.com/$repo/releases/download/v0.1.0/app.apk", repo))
    }

    @Test fun rejectsOtherRepoOrHost() {
        assertFalse(UpdateUrls.isTrustedAsset("https://github.com/evil/app/releases/download/v1/app.apk", repo))
        assertFalse(UpdateUrls.isTrustedAsset("https://github.com.evil.example/$repo/releases/download/v1/a.apk", repo))
        assertFalse(UpdateUrls.isTrustedAsset("https://user@github.com/$repo/releases/download/v1/a.apk", repo))
        assertFalse(UpdateUrls.isTrustedAsset("not a url", repo))
    }

    @Test fun readsHashForFile() {
        val hash = "a".repeat(64)
        val text = "$hash  app-arm.apk\n${"b".repeat(64)}  app-x86_64.apk\n"
        assertEquals(hash, UpdateUrls.sha256For(text, "app-arm.apk"))
        assertNull(UpdateUrls.sha256For(text, "missing.apk"))
        assertNull(UpdateUrls.sha256For("zz  app-arm.apk", "app-arm.apk"))
    }
}
