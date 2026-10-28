pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}
plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        // A libmpv built on this PC (OwnTV_libmpv's buildscripts/wsl_build.sh), only while
        // the build command carries -Powntv.libmpvLocalRepo=<folder> (never a file) — core's :player-core then asks
        // for version "local". Core's settings carry the same lines.
        providers.gradleProperty("owntv.libmpvLocalRepo").orNull?.let { dir ->
            maven {
                name = "LocalLibmpv"
                url = uri(file(dir))
                content { includeVersion("uz.skmate.iptv", "libmpv", "local") }
            }
        }
        google()
        mavenCentral()
        // SkMate IPTV's GitHub Packages: uz.skmate.iptv:core and :player-core (built from
        // https://github.com/swensi17/skmate-iptv-core) and uz.skmate.iptv:libmpv, the mpv engine
        // (mirror of OwnTV_libmpv, source in https://github.com/swensi17/skmate-iptv-libmpv).
        // GitHub asks for a token with read:packages even for public packages. It comes from the
        // environment (GITHUB_ACTOR / GITHUB_TOKEN) or gpr.user / gpr.key in ~/.gradle/gradle.properties,
        // never from a file in this repository.
        maven {
            name = "SkMate"
            url = uri("https://maven.pkg.github.com/swensi17/skmate-iptv-core")
            credentials {
                username = System.getenv("GITHUB_ACTOR") ?: providers.gradleProperty("gpr.user").orNull
                password = System.getenv("GITHUB_TOKEN") ?: providers.gradleProperty("gpr.key").orNull
            }
            content { includeGroup("uz.skmate.iptv") }
        }
    }
}

// Local development: build against core's own source instead of the published artifact, so a core
// edit reaches this app with no publish step. Gradle substitutes the dependency automatically
// because OwnTV_Core publishes under the same group and artifact ids this app asks for. CI leaves
// owntv.corePath unset and resolves the pinned version instead.
// Set it in ~/.gradle/gradle.properties, never here:  owntv.corePath=E:/MEGA/CODE/AI/OwnTV_Core
providers.gradleProperty("owntv.corePath").orNull?.takeIf { it.isNotBlank() }?.let { includeBuild(it) }

rootProject.name = "SkMateIPTV"
include(":app")
// Baseline-profile generator. Test-only module: it ships nothing to users, it records
// the cold-start journey on a device and writes the profile :app packages.
include(":baselineprofile")
 