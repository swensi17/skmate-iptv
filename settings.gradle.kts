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
            url = rootDir.resolve("libs/maven").toURI()
            content { includeGroup("uz.skmate.iptv") }
        }
    }
}

// The engine (:core, :player-core) is built from source in /engine; Gradle substitutes it for the
// uz.skmate.iptv:core and :player-core dependencies.
includeBuild("engine")

rootProject.name = "SkMateIPTV"
include(":app")
// Baseline-profile generator. Test-only module: it ships nothing to users, it records
// the cold-start journey on a device and writes the profile :app packages.
include(":baselineprofile")
 