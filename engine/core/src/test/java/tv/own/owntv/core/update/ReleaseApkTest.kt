package tv.own.owntv.core.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ReleaseApkTest {
    private val split = listOf(
        "SkMate-IPTV-v2.5.0-arm.apk" to "u/arm",
        "SkMate-IPTV-v2.5.0-x86_64.apk" to "u/x86",
        "SkMate-IPTV.apk" to "u/generic",
        "SHA256SUMS.txt" to "u/sums",
        "SkMate-IPTV-v2.5.0-arm64.apk" to "u/arm64",
    )
    private val old = listOf(
        "SkMate-IPTV-v2.4.2-arm.apk" to "o/arm",
        "SkMate-IPTV-v2.4.2-x86_64.apk" to "o/x86",
        "SkMate-IPTV.apk" to "o/generic",
    )

    @Test fun each_abi_gets_its_own_file() {
        assertEquals("u/arm", pickReleaseApk(split, ReleaseAbi.ARM))
        assertEquals("u/arm64", pickReleaseApk(split, ReleaseAbi.ARM64))
        assertEquals("u/x86", pickReleaseApk(split, ReleaseAbi.X86_64))
    }

    @Test fun arm64_falls_back_to_arm_on_an_older_release() {
        assertEquals("o/arm", pickReleaseApk(old, ReleaseAbi.ARM64))
    }

    @Test fun no_apk_for_the_abi_is_null() {
        assertNull(pickReleaseApk(listOf("SkMate-IPTV-v1-arm.apk" to "a"), ReleaseAbi.X86_64))
        assertNull(pickReleaseApk(listOf("notes.txt" to "a"), ReleaseAbi.ARM))
    }
}
