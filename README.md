# SkMate IPTV

Бесплатный open-source IPTV-плеер для Android TV, Google TV и Fire TV. Управление только пультом.
Без рекламы, без платных уровней, без обязательного аккаунта и телеметрии.

## Что это

- Источники: M3U/M3U8 (ссылка и файл), Xtream Codes, Stalker/Ministra, несколько плейлистов сразу.
- Гид передач (XMLTV), архив (catch-up), перемотка эфира, запись, мультиэкран.
- Два движка воспроизведения (Media3 и libmpv) с автоматическим откатом.
- Языки интерфейса: русский, узбекский (латиница), английский.
- Обновления через GitHub Releases прямо из приложения.

Полное техническое задание: [docs/SPEC.md](docs/SPEC.md). Порядок работы: [AGENTS.md](AGENTS.md).

## Установка

Последний подписанный APK всегда по одной ссылке:

```
https://github.com/swensi17/skmate-iptv/releases/latest/download/SkMate-IPTV.apk
```

На Fire TV и Android TV её удобно открыть в приложении Downloader.

## Сборка

Нужны JDK 21 и Android SDK (platform 37). Ядро берётся из GitHub Packages аккаунта `swensi17`;
даже для чтения публичных пакетов GitHub требует токен с правом `read:packages`. Токен задаётся
переменными окружения и в репозиторий не попадает:

```
export GITHUB_ACTOR=<ваш логин>
export GITHUB_TOKEN=<токен с read:packages>
./gradlew :app:assembleStandardDebug
```

Подробности: [CONTRIBUTING.md](CONTRIBUTING.md), [ARCHITECTURE.md](ARCHITECTURE.md).

## Ответственность за контент

SkMate IPTV только проигрывает. Приложение не поставляет каналы, плейлисты или подписки и не
содержит ссылок на источники. Пользователь сам отвечает за источники, которые добавляет.

## Лицензия

GPL-3.0-or-later, см. [LICENSE](LICENSE). Исходный код OwnTV и OwnTV_Core распространяется под
GPL-3.0; указания авторов сохранены в [NOTICE](NOTICE). Сторонние компоненты:
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
