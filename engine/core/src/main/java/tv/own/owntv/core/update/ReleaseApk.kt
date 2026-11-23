package tv.own.owntv.core.update

/** Which of a release's APKs this install can take. */
enum class ReleaseAbi {
    /** 32-bit arm: the default build, it installs on every arm TV. */
    ARM,

    /** The 64-bit arm build, for a TV already running it. */
    ARM64,
    X86_64,
    ;

    companion object {
        fun current(): ReleaseAbi = when {
            android.os.Build.SUPPORTED_ABIS.firstOrNull() == "x86_64" -> X86_64
            // The ABI this app runs under, not what the chip could run: a 64-bit TV with a 32-bit system
            // runs the 32-bit build, and the 64-bit file would not install there.
            android.os.Process.is64Bit() -> ARM64
            else -> ARM
        }
    }
}

/**
 * The download URL of the release APK for [abi], from (asset name, url) pairs. Releases carry
 * `-arm.apk` (32-bit arm), `-arm64.apk` and `-x86_64.apk`, plus `SkMate-IPTV.apk`, a copy of the arm one.
 * A 64-bit install falls back to the 32-bit arm file on a release without a 64-bit one. Never an APK for
 * another processor family.
 */
fun pickReleaseApk(assets: List<Pair<String, String>>, abi: ReleaseAbi): String? {
    val apks = assets.filter { it.first.endsWith(".apk", ignoreCase = true) }
    fun named(part: String) = apks.firstOrNull { it.first.contains(part, ignoreCase = true) }?.second
    val arm = apks.firstOrNull {
        !it.first.contains("x86_64", ignoreCase = true) && !it.first.contains("arm64", ignoreCase = true)
    }?.second
    return when (abi) {
        ReleaseAbi.X86_64 -> named("x86_64")
        ReleaseAbi.ARM64 -> named("arm64") ?: arm
        ReleaseAbi.ARM -> arm
    }
}
