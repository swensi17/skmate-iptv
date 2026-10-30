<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/banner-dark.png">
    <img src="docs/brand/banner-light.png" alt="SkMate IPTV" width="560">
  </picture>
</p>

<h1 align="center">SkMate IPTV</h1>

<p align="center"><b>Бесплатный IPTV-плеер с открытым кодом для Android TV, Google TV и Fire TV.</b><br>
M3U и Xtream Codes, телегид (EPG), архив, профили — управление только пультом, без рекламы и аккаунтов.</p>

<p align="center">
  <a href="https://github.com/swensi17/skmate-iptv/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/swensi17/skmate-iptv?label=release&color=1e88e5"></a>
  <a href="https://github.com/swensi17/skmate-iptv/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/swensi17/skmate-iptv/total?color=43a047"></a>
  <a href="LICENSE"><img alt="License GPL-3.0" src="https://img.shields.io/badge/license-GPL--3.0-blue"></a>
  <img alt="Android TV" src="https://img.shields.io/badge/Android%20TV-8.0%2B-3ddc84?logo=androidtv&logoColor=white">
  <img alt="Kotlin" src="https://img.shields.io/badge/Kotlin-Compose%20for%20TV-7f52ff?logo=kotlin&logoColor=white">
  <img alt="libVLC" src="https://img.shields.io/badge/engine-libVLC-ff8800?logo=vlcmediaplayer&logoColor=white">
</p>

<p align="center"><b>Русский</b> · <a href="docs/i18n-readme/README.en.md">English</a> · <a href="docs/i18n-readme/README.zh.md">中文</a></p>

<p align="center"><img src="docs/screenshots/live-dark.jpg" alt="SkMate IPTV — прямой эфир" width="900"></p>

## Возможности

**Источники**
- M3U / M3U8 по ссылке или из файла, Xtream Codes, Stalker/Ministra; несколько плейлистов одновременно.
- Группы провайдера (`group-title`, `#EXTGRP`), избранное, недавно просмотренные, скрытие и переименование категорий.
- Добавление плейлиста с телефона по QR-коду через локальную сеть — без набора адреса пультом.

**Телегид и архив**
- XMLTV (`url-tvg`, `.xml`, `.xml.gz`), автоматическая привязка программы по названию канала, даже без `tvg-id`.
- Сетка передач по всем каналам, описание и «что дальше» прямо в списке каналов.
- Архив (catch-up) и перемотка эфира там, где их поддерживает провайдер.

**Плеер**
- Один движок **libVLC**: HLS, MPEG-TS, H.264/HEVC, чересстрочное видео 576i, MP2/AC-3 звук.
- Каналы открываются за ~1 секунду; при обрыве потока — тихое переподключение, без перезапуска всего плеера.
- Переключение каналов кнопками ▲▼ и CH±, список каналов и категории поверх эфира (картинка не прерывается).
- Предпросмотр канала прямо в списке, плавное открытие на весь экран.

**Интерфейс**
- Сделан под пульт: всё доступно стрелками и OK, фокус всегда виден.
- Тёмная и светлая темы, акцентный цвет, масштаб интерфейса, настраиваемые анимации.
- Профили, PIN-код на категории, резервные копии и синхронизация между телевизорами.
- Языки интерфейса: русский, английский, китайский и ещё 20+.

**Обновления**
- Приложение само находит новую версию в GitHub Releases, проверяет подпись и устанавливает её.
- Можно выключить, выбрать частоту проверки (при запуске / каждые 6 часов / раз в день) и время установки (в любое время / ночью).

## Что нового в 2.0 (ветка `main`, релиз готовится)

| | |
|:-:|:-:|
| ![Нижняя панель плеера](docs/screenshots/v2-player-toolbar.jpg) | ![Понятная ошибка](docs/screenshots/v2-error-screen.jpg) |
| **Нижняя панель плеера**: иконка и подпись у каждой кнопки | **Понятная ошибка** вместо технического текста |
| ![Сортировка каналов](docs/screenshots/v2-sort-menu.jpg) | ![Добавление с телефона](docs/screenshots/v2-add-from-phone.jpg) |
| **Сортировка**: порядок провайдера, А–Я, Я–А, по номеру, недавние | **Добавление плейлиста с телефона**, подсказка про Wi-Fi |

- **Умный поиск**: любая раскладка, транслит, опечатки, поиск по передачам.
- **Спорт-доска** по странам и видам спорта, «Сейчас идёт» (спорт, кино, новости, детям).
- **Зеркала каналов**: канал не открылся — включается его копия из другого плейлиста.
- **«Починить телегид»**, «Скрыть повторы», сортировка каналов, режим слабой сети.
- **Картинка в картинке**, напоминания, один тёмный плеер, единые квадратные кнопки, плавные панели.

## Чем SkMate лучше других IPTV-плееров

| | SkMate IPTV | TiviMate | IPTV Smarters | Kodi |
|---|:-:|:-:|:-:|:-:|
| Бесплатно, без рекламы | ✅ | ❌ Premium платный | ⚠️ | ✅ |
| Открытый код | ✅ | ❌ | ❌ | ✅ |
| Умный поиск (раскладка, опечатки, передачи) | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Автопереключение на копию канала при сбое | ✅ | — | — | — |
| Спорт-доска и «Сейчас идёт» | ✅ | — | — | — |
| «Починить телегид», скрытие повторов | ✅ | — | — | — |
| Подстройка буфера под слабую сеть | ✅ | — | — | — |
| Архив, напоминания, профили с PIN | ✅ | ✅ | ⚠️ | ⚠️ |

Полное сравнение и честные оговорки: [docs/COMPARISON.md](docs/COMPARISON.md). Мы не утверждаем, что SkMate плавнее TiviMate на слабых приставках: замеры на реальных телевизорах ещё впереди.

## Частые вопросы

**Это аналог TiviMate?** Да, это бесплатная альтернатива TiviMate с открытым кодом для Android TV, Google TV и Fire TV.
**Есть ли в приложении каналы?** Нет. Это только плеер: вы добавляете свой M3U, Xtream Codes или Stalker.
**Как добавить плейлист без набора адреса пультом?** Отсканируйте QR-код на телевизоре телефоном, телефон и ТВ должны быть в одной сети Wi-Fi.
**Какой нужен Android?** Android TV / Google TV 8.0 и новее, Fire TV, приставки на arm64-v8a и armeabi-v7a.

## Скриншоты

| | |
|:-:|:-:|
| ![Прямой эфир](docs/screenshots/live-dark.jpg) | ![Телегид](docs/screenshots/guide-dark.jpg) |
| **Прямой эфир**: список, предпросмотр, телепрограмма | **Телегид**: сетка передач по всем каналам |
| ![Плеер](docs/screenshots/player-dark.jpg) | ![Каналы в плеере](docs/screenshots/player-channels-dark.jpg) |
| **Плеер**: передача, время, прогресс, что дальше | **Каналы поверх эфира** с расписанием канала |
| ![Категории](docs/screenshots/player-categories-dark.jpg) | ![Категории](docs/screenshots/categories-dark.jpg) |
| **Категории в плеере**, картинка не прерывается | **Категории** в списке каналов |
| ![Настройки](docs/screenshots/settings-dark.jpg) | ![Источники и EPG](docs/screenshots/settings-sources-dark.jpg) |
| **Настройки** — боковая панель поверх эфира | **Источники и телепрограмма (EPG)**, архив |
| ![Оформление](docs/screenshots/settings-appearance-dark.jpg) | ![Система](docs/screenshots/settings-system-dark.jpg) |
| **Оформление**: тема, акцент, масштаб, анимации | **Система**: язык, автообновление, расписание установки |
| ![Светлая тема](docs/screenshots/live-light.jpg) | ![Светлый телегид](docs/screenshots/guide-light.jpg) |
| **Светлая тема** | **Телегид в светлой теме** |

## Установка

1. Скачайте подписанный APK последней версии:
   **https://github.com/swensi17/skmate-iptv/releases/latest/download/SkMate-IPTV.apk**
2. На телевизоре удобно открыть эту ссылку в приложении **Downloader** (код можно ввести пультом).
3. Разрешите установку из этого источника и установите APK.
4. Добавьте плейлист: в приложении или с телефона по QR-коду.

Поддерживаются Android TV / Google TV 8.0+, Fire TV, ТВ-приставки на Android (arm64-v8a, armeabi-v7a).

## Безопасность

Ссылка на APK релиза v0.1.0 проверена на [VirusTotal](https://www.virustotal.com/gui/url/05d504ce01ad088e31df5fe963ef495adecafe4fdb005be10bb8738947c0ec53): **0 из 93** сканеров ничего не нашли. Исходный код открыт, сборка идёт в GitHub Actions. Контрольные суммы SHA-256 лежат в релизе (`SHA256SUMS.txt`):

- arm: `e1041da56c2d1f69f3f7f84d5cd3bd64778a03b5f7b3f708855016cd0d608dcd`
- x86_64: `a9fd75fc7f98c11a6de5051ecad078a66036df0514ddb73a34813df017dbd181`

## Сборка из исходников

Нужны JDK 21 и Android SDK (platform 37). Всё собирается из этого репозитория, токены и сторонние пакеты не нужны:

```bash
./gradlew :app:assembleStandardDebug
```

В репозитории: `app/` (приложение), `engine/` (ядро: разбор плейлистов, база, плееры), `libmpv/` (исходники и скрипты сборки libmpv), `libs/` (готовый libmpv).
Архитектура: [ARCHITECTURE.md](ARCHITECTURE.md) · участие: [CONTRIBUTING.md](CONTRIBUTING.md) · изменения: [CHANGELOG.md](CHANGELOG.md).

## Технологии

Kotlin · Jetpack Compose for TV · libVLC · Room · Koin · OkHttp · Coroutines/Flow · Coil.

## Ответственность за контент

SkMate IPTV — только плеер. Приложение не содержит и не предоставляет каналы, плейлисты или подписки. Пользователь сам отвечает за источники, которые добавляет.

## Лицензия

[GPL-3.0-or-later](LICENSE). Уведомления об авторских правах — в [NOTICE](NOTICE), сторонние компоненты — в [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Мы в сети

[Telegram](https://t.me/swensi17) · [X](https://x.com/swensi17) · [GitHub](https://github.com/swensi17)

<sub>Ключевые слова: IPTV player, Android TV, Google TV, Fire TV, M3U, M3U8, Xtream Codes, Stalker, EPG, XMLTV, catch-up, IPTV плеер, ТВ-приставка, телегид, IPTV 播放器, 电视直播.</sub>
