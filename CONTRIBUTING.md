# Как участвовать в SkMate IPTV


## Правила

- Приложение **только плеер**: никаких встроенных каналов, плейлистов и ссылок на источники.
- Платформа: **Android TV, Google TV, Fire TV**. Всё управляется пультом (стрелки и ОК), фокус всегда
  виден и запоминается.
- **Ни одной строки текста в коде.** Тексты лежат в ресурсах ядра (`skmate-iptv-core`,
  `core/src/main/res/values*/strings*.xml`). Языки интерфейса: русский, узбекский (латиница),
  английский. Проверка `verifyI18nLiterals` роняет сборку на тексте в коде.
- Название приложения задаётся в одном месте: `tools/brand/brand.json` в ядре, затем
  `python3 tools/brand/apply_name.py`. Значок и баннер: `tools/brand/render_skmate.py`.
- Код и дизайн чужих проприетарных приложений не копируем. Каждая новая зависимость проходит
  проверку лицензии (`licensee`), несовместимые с GPL-3.0 блокируют сборку.
- Секреты (токены, ключ подписи, пароли, ссылки с логинами) не попадают в репозиторий, логи и отчёты.

## Git

- Ветка `main` защищена: изменения через pull request, CI должен быть зелёным.
- Сообщения коммитов по [Conventional Commits](https://www.conventionalcommits.org/ru/): `feat:`,
  `fix:`, `docs:`, `build:`, `ci:`, `chore:`, `refactor:`, `test:`. Один коммит, одно логическое изменение.
- Значимое изменение добавляет строку в `CHANGELOG.md`.
- Задача готова, когда есть код, тесты, запись в CHANGELOG, запушенный коммит и зелёный CI.

## Сборка

Нужны JDK 21 и Android SDK (platform 37). Всё собирается из этого репозитория, токены не нужны:

```
./gradlew :app:assembleStandardDebug
```

## Проверки (то же, что в CI)

```
./gradlew testStandardDebugUnitTest lintStandardDebug :app:licenseeAndroidStandardRelease
python3 tools/licenses/gen_third_party.py check
ktlint --baseline=config/lint/ktlint-baseline.xml "app/src/**/*.kt"
java -jar detekt-cli-1.23.8-all.jar --input app/src/main/java,app/src/test --baseline config/lint/detekt-baseline.xml --build-upon-default-config
```

Проверка на реальных приставках обязательна: эмулятор не воспроизводит фокус пульта и звук HDMI.

## Выпуск

1. Раздел `## vX.Y.Z` в `CHANGELOG.md`.
2. Тег `vX.Y.Z` на `main`: `release.yml` собирает подписанные APK, считает SHA-256 и публикует релиз.
3. Ядро выпускается вместе с приложением, отдельных тегов нет.
