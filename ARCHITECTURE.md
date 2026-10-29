# Архитектура SkMate IPTV

SkMate IPTV — нативный IPTV-плеер для Android TV на Kotlin и Jetpack Compose for TV, GPL-3.0 (см. [NOTICE](NOTICE)).

## Репозитории и модули

```
skmate-iptv (этот репозиторий)          skmate-iptv-core                    skmate-iptv-libmpv
  :app  ──────────────────────────────▶  :player-core ──▶ :core               исходники libmpv
  :baselineprofile                        (движки)          (данные)           (AAR в GitHub Packages)
```

Зависимости идут только вниз: приложение → `player-core` → `core`. Ядро ничего не импортирует из
приложения; всё, что ему нужно от приложения, передаётся через хуки при запуске (например,
`CoreBuildInfo.releaseRepo`, версия, флаги сборки).

| Модуль | Где | Что внутри |
|---|---|---|
| `:app` | этот репозиторий | Экраны Compose for TV, навигация пультом, DI (Koin), запуск, иконки-алиасы |
| `:baselineprofile` | этот репозиторий | Генератор Baseline Profile (холодный старт, прокрутка) |
| `:core` | skmate-iptv-core | Парсеры M3U / XMLTV / Xtream / Stalker, Room + FTS4 + Paging, сеть (OkHttp), EPG, catch-up, резервные копии, обновления, настройки (DataStore), фоновые задачи (WorkManager), **все строки интерфейса** |
| `:player-core` | skmate-iptv-core | Движки Media3 (ExoPlayer) и libmpv за общим интерфейсом, лестница отката, сторож зависаний, диагностика потока |

Пакеты публикуются в GitHub Packages репозитория `swensi17/skmate-iptv-core` под группой
`uz.skmate.iptv` (`core`, `player-core`, `libmpv`). Версия ядра одна на оба модуля, приложение
закрепляет её в `gradle/libs.versions.toml` (`owntvCore`).

## Имена

Пакеты Kotlin (`tv.own.owntv…`) и внутренние имена ресурсов (`owntv_…`) — внутренние идентификаторы,
пользователь их не видит.
Пользователь видит только то, что задано в ядре: `tools/brand/brand.json` (название) и
`tools/brand/render_skmate.py` (значок, баннер, экран запуска). `applicationId` приложения —
`uz.skmate.iptv`, поэтому SkMate IPTV ставится рядом с SkMate IPTV и не пересекается с ним.

## Сборка и выпуск

- `build.yml` на каждый push и pull request: ktlint, detekt, юнит-тесты, Android lint, проверка
  лицензий, `assembleDebug`.
- `release.yml` по тегу `v*`: подписанные APK (arm и x86_64), `SHA256SUMS.txt`, mapping R8, релиз.
- Приложение проверяет `releases/latest` этого репозитория и ставит обновление через PackageInstaller.
- Код версии из тега: `vX.Y.Z` → `X*10000 + Y*100 + Z`.

## Планы по ТЗ

Три режима стабильности (раздел 6), строгая проверка обновлений (SHA-256, сертификат, белый список
хостов, раздел 8), узбекский язык и функции разделов 14–15 добавляются по этапам из раздела 10 ТЗ.
