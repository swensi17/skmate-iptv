#!/bin/bash
# Те же проверки, что и в CI: если здесь зелено, на GitHub не будет красного.
# Запуск: scripts/pre-push-check.sh
set -euo pipefail
cd "$(dirname "$0")/.."
KTLINT="${KTLINT:-$HOME/dev/tools/ktlint}"
DETEKT="${DETEKT:-$HOME/dev/tools/detekt-cli-1.23.8-all.jar}"

echo "== i18n"
python3 tools/i18n/check_hardcoded_strings.py verify --bootstrap
python3 tools/i18n/check_text_overflow.py
python3 tools/i18n/check_number_locale.py
(cd engine && python3 tools/i18n/validate_strings.py --report text >/dev/null && python3 tools/i18n/gen_supported_locales.py check && python3 tools/i18n/check_text_overflow.py && python3 tools/i18n/check_number_locale.py && python3 tools/i18n/check_hardcoded_strings.py verify --bootstrap)
# Регрессионные тесты инструментов перевода (в CI это engine-strings): ловят, например, подстановку без xliff:g
if ! I18N_TESTS=$(cd engine && python3 tools/i18n/test_i18n_tools.py 2>&1); then
    echo "$I18N_TESTS" | grep -E "^(FAIL|ERROR)|Error|differ"
    exit 1
fi
echo "== ktlint"
"$KTLINT" --baseline=config/lint/ktlint-baseline.xml "app/src/**/*.kt" "baselineprofile/src/**/*.kt"
echo "== detekt"
java -jar "$DETEKT" --input app/src/main/java,app/src/test --baseline config/lint/detekt-baseline.xml --build-upon-default-config
echo "== сборка и тесты"
./gradlew :app:testStandardDebugUnitTest :engine:core:testDebugUnitTest --console=plain -q
echo "всё зелено, можно пушить"
