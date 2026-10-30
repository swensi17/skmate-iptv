# Engine

`:core` and `:player-core` of [SkMate IPTV](../README.md), built from source together with the app.

- `core`: M3U, Xtream Codes and Stalker playlists, XMLTV guide, Room database, network, settings, backups, updates and every user-visible string.
- `player-core`: libVLC for live TV, Media3 and libmpv behind one interface, fallback ladder, stall watchdog.

Dependencies go one way only: app → `player-core` → `core`. Unit tests: `./gradlew -p engine :core:testDebugUnitTest :player-core:testDebugUnitTest`.

<!-- i18n-contribution:start -->
## Help translate SkMate IPTV

Interface translations are welcome. Find your language in the [project](https://github.com/swensi17/skmate-iptv) or [open a language request ticket](https://github.com/swensi17/skmate-iptv/issues/new?template=feature_request.yml&title=%5BLanguage%5D%20Add%20) first. A maintainer will review the request and register the locale. See the [language contributor guide](tools/i18n/README.md) for identifiers, validation, and promotion policy.
<!-- i18n-contribution:end -->
