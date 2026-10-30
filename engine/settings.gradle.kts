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
        google()
        mavenCentral()
        // libmpv (mpv + FFmpeg) prebuilt AAR; its source and build scripts are in /libmpv.
        maven {
            name = "Libmpv"
            url = rootDir.resolve("../libs/maven").toURI()
            content { includeGroup("uz.skmate.iptv") }
        }
    }
}

rootProject.name = "SkMateIptvCore"
// Shared engine: data, sync, parsers, Room, backup, EPG, and every user-visible string. No UI
// framework beyond Compose runtime, so the same module backs the TV app and the mobile app.
include(":core")
// Playback engine: libmpv + the Media3/ExoPlayer handoff, the fallback ladder, watchdogs and the
// stream diagnostics. Depends on :core; renders nothing, so each app supplies its own HUD.
include(":player-core")
