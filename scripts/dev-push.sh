#!/bin/bash
# Быстрый цикл на эмуляторе: инкрементальная сборка arm64 debug, установка поверх, перезапуск.
set -e
cd "$(dirname "$0")/.."
export JAVA_HOME=${JAVA_HOME:-~/dev/tools/jdk-21.0.13+9/Contents/Home} ANDROID_HOME=${ANDROID_HOME:-~/Library/Android/sdk}
ADB=$ANDROID_HOME/platform-tools/adb
start=$(date +%s)
./gradlew -q :app:installArm64Debug 2>&1 | grep -E "^e:|FAILURE|What went wrong" -A3 || true
$ADB shell am force-stop uz.skmate.iptv
$ADB shell monkey -p uz.skmate.iptv -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
echo "готово за $(( $(date +%s) - start )) с"
