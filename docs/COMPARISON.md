# Что проверено в SkMate IPTV и как

Раньше здесь была таблица «SkMate против TiviMate, IPTV Smarters и Kodi» с крестиками у конкурентов. Её составил автор приложения, источников у крестиков не было, а часть пунктов оказалась неверной (например, выбор движка плеера, которого в версии 2.0 нет). Таблицу убрали. Ниже только то, что можно проверить в этом репозитории, и честная граница того, что не проверено.

*English summary: [below](#english-summary).*

## Что проверено

«Тест» значит автоматический тест, который запускается в CI. «Эмулятор» значит, что функцию вручную проверили на эмуляторе Android TV.

| Возможность | Чем подтверждена |
|---|---|
| Умный поиск: раскладка, транслит, опечатки | тест [`SmartSearchTest`](../engine/core/src/test/java/tv/own/owntv/core/content/SmartSearchTest.kt), эмулятор |
| Зеркала каналов: сбой → копия из другого плейлиста | тест [`ChannelMirrorsTest`](../engine/core/src/test/java/tv/own/owntv/core/live/ChannelMirrorsTest.kt), эмулятор |
| Лестница отката при сбое (повтор, другой формат `.ts` ⇄ `.m3u8`) | тест [`LiveLadderTest`](../engine/player-core/src/test/java/tv/own/owntv/player/LiveLadderTest.kt) |
| Буфер растёт при слабой сети | тест [`StallMeterTest`](../engine/player-core/src/test/java/tv/own/owntv/player/StallMeterTest.kt) |
| Автопривязка программы по названию (без `tvg-id`) | тест [`EpgMatcherTest`](../engine/core/src/test/java/tv/own/owntv/core/epg/EpgMatcherTest.kt) |
| Гиды по умолчанию: из плейлиста, по провайдеру, общие | тест [`GuideDefaultsTest`](../engine/core/src/test/java/tv/own/owntv/core/epg/GuideDefaultsTest.kt) |
| «Скрыть повторы» | тест [`FeedDedupeTest`](../engine/core/src/test/java/tv/own/owntv/core/epg/FeedDedupeTest.kt), эмулятор |
| Сортировка каналов, подборки «Сейчас идёт» | тесты [`LiveSortTest`](../engine/core/src/test/java/tv/own/owntv/core/live/LiveSortTest.kt), [`SmartPicksTest`](../engine/core/src/test/java/tv/own/owntv/core/content/SmartPicksTest.kt), эмулятор |
| Адреса архива (catch-up) | тест [`CatchupUrlTest`](../engine/core/src/test/java/tv/own/owntv/core/epg/CatchupUrlTest.kt) |
| Шифрованная резервная копия | инструментальные тесты [`BackupRoundTripTest`](../engine/core/src/androidTest/java/tv/own/owntv/core/backup/BackupRoundTripTest.kt), [`BackupContainerTest`](../engine/core/src/androidTest/java/tv/own/owntv/core/backup/BackupContainerTest.kt) |
| Картинка в картинке, напоминания поверх экрана | эмулятор |
| Открытый код GPL-3.0, подписанные сборки | [`LICENSE`](../LICENSE), [`release.yml`](../.github/workflows/release.yml), контрольные суммы в релизе |

## Что не проверено

- Плавность и скорость открытия каналов на настоящих телевизорах и слабых приставках. Измерений нет.
- Мультивид, запись, таймшифт и воспроизведение архива: реализованы в коде, но на устройстве не проверялись.
- Проверка на вирусы (VirusTotal) для v2.0.0 не выполнена, есть только для v0.1.0. Подробности и контрольные суммы в [README](../README.md#безопасность).

## Про движки плеера

Прямой эфир играет через один движок, libVLC. Выбора движка в интерфейсе нет. В ранних версиях были ExoPlayer и mpv, в 0.1.0 остался один движок, а их настройки убрали (см. комментарий в [`VideoPlayerSettingsScreen.kt`](../app/src/main/java/tv/own/owntv/features/settings/VideoPlayerSettingsScreen.kt)). Прежние описания «три движка» и «выбор плеера для каждого плейлиста» устарели и удалены.

## О других приложениях

Сравнивать TiviMate и IPTV Smarters по пунктам мы не берёмся: официальные описания неполны, а в поиске в основном рекламные страницы, которым нельзя верить. Смотрите их официальные страницы и магазины приложений.

О Kodi есть проверяемые источники: Kodi это свободное ПО под GPL ([kodi.tv/about](https://kodi.tv/about/)); дополнение IPTV Simple Client читает M3U и XMLTV, поддерживает несколько пар «плейлист и гид» начиная с Kodi 20, гид в `.gz` и `.xz`, а архив зависит от провайдера ([kodi.wiki](https://kodi.wiki/view/Add-on:IPTV_Simple_Client), [исходный код](https://github.com/kodi-pvr/pvr.iptvsimple)). Kodi универсальный медиацентр, SkMate это Android-приложение именно под IPTV и пульт.

## О проекте

Репозиторий создан 30 октября 2026. Звёзд и форков пока нет, независимых обзоров тоже. Нашли расхождение с реальностью или своё мнение о приложении, откройте [issue](https://github.com/swensi17/skmate-iptv/issues).

## English summary

SkMate IPTV is a free, open-source (GPL-3.0) IPTV player for Android TV. This page used to hold a table with crosses against TiviMate, IPTV Smarters and Kodi, written by the author without sources, and parts of it were wrong. It was removed. What remains is what can be checked in this repository: each feature with the test that covers it. Not verified: smoothness on real TVs, multiview, recording, timeshift and catch-up playback, and VirusTotal for v2.0.0 (only v0.1.0 was scanned). Live TV uses a single engine (libVLC); older descriptions of three selectable engines were outdated. The project is new: no stars, no independent reviews.
