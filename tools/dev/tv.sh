#!/usr/bin/env bash
# Fast development loop on a real TV: build the app WITH the local core sources, sign it with the
# project key, install it over the installed SkMate IPTV (data kept) and start it.
#
#   tools/dev/tv.sh            release build (R8, real speed: use it to judge smoothness)
#   tools/dev/tv.sh --fast     debug build (no R8, installs sooner, slower at runtime)
#   tools/dev/tv.sh --log      only follow the app's log on the TV
#
# Environment (all optional):
#   SKMATE_TV       adb address of the TV            (default 192.168.1.105:5555; emulator-5554 for the
#                   Android TV emulator: emulator -avd skmate_tv)
#   SKMATE_CORE     path to skmate-iptv-core          (default ../skmate-iptv-core next to this repo)
#   SKMATE_SIGNING  properties file with the key      (default ~/dev/skmate-secrets/signing.properties)
#   JAVA_HOME       JDK 21                            (default ~/dev/tools/jdk-21*/Contents/Home)
#   SKMATE_NO_LOG=1 install and start, then return instead of following the log
#
# The build carries the version code of the newest v* tag, so a dev build replaces the installed
# release of the same number and the next release from CI still installs over it. The version name
# ends in "-dev.<commit>", so the in-app updater does not offer the release it was built from.
# Nothing here prints or stores the key's passwords.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TV="${SKMATE_TV:-192.168.1.105:5555}"
CORE="${SKMATE_CORE:-$ROOT/../skmate-iptv-core}"
SIGNING="${SKMATE_SIGNING:-$HOME/dev/skmate-secrets/signing.properties}"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
PKG="uz.skmate.iptv"
MODE="release"

case "${1:-}" in
  --fast) MODE="debug" ;;
  --log) MODE="log" ;;
  "") ;;
  *) echo "usage: $0 [--fast|--log]" >&2; exit 2 ;;
esac

follow_log() {
  local pid
  pid=$("$ADB" -s "$TV" shell pidof "$PKG" | tr -d '\r' || true)
  if [ -z "$pid" ]; then echo "$PKG is not running on $TV" >&2; exit 1; fi
  echo "--- log of $PKG (pid $pid), Ctrl+C to stop ---"
  "$ADB" -s "$TV" logcat -v time --pid="$pid"
}

# A Wi-Fi TV needs "adb connect"; the Android TV emulator (SKMATE_TV=emulator-5554) is already attached.
case "$TV" in emulator-*) ;; *) "$ADB" connect "$TV" >/dev/null ;; esac
"$ADB" -s "$TV" get-state >/dev/null || { echo "TV $TV is not reachable over adb" >&2; exit 1; }
[ "$MODE" = "log" ] && follow_log

if [ -z "${JAVA_HOME:-}" ]; then
  JAVA_HOME="$(ls -d "$HOME"/dev/tools/jdk-21*/Contents/Home 2>/dev/null | head -n1)"
  export JAVA_HOME
fi
[ -f "$SIGNING" ] || { echo "signing file $SIGNING not found" >&2; exit 1; }
[ -d "$CORE" ] || { echo "core sources $CORE not found" >&2; exit 1; }

# Version: the newest release tag's code, the name marked as a dev build.
TAG="$(git -C "$ROOT" describe --tags --abbrev=0 --match 'v*' 2>/dev/null || echo v0.0.0)"
IFS='.' read -r MA MI PA <<< "${TAG#v}"
export VERSION_CODE=$(( MA * 10000 + MI * 100 + PA ))
export VERSION_NAME="${TAG#v}-dev.$(git -C "$ROOT" rev-parse --short HEAD)"

# Signing values go straight into the environment the build reads (KEYSTORE_FILE, KEYSTORE_PASSWORD,
# KEY_ALIAS, KEY_PASSWORD); they are never echoed.
set -a
# shellcheck disable=SC1090
. "$SIGNING"
set +a

# GitHub Packages: libmpv and anything not in the local core still resolve from there.
export GITHUB_ACTOR="${GITHUB_ACTOR:-$(gh api user --jq .login)}"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$(gh auth token)}"

if [ "$MODE" = "debug" ]; then export SKMATE_DEV_SIGN=1; TASK=":app:assembleStandardDebug"; OUT="standard/debug"; else TASK=":app:assembleStandardRelease"; OUT="standard/release"; fi
echo "building $VERSION_NAME ($VERSION_CODE), $MODE, core from $CORE"
(cd "$ROOT" && sh ./gradlew -q "-Powntv.corePath=$CORE" "$TASK")
APK="$(ls "$ROOT"/app/build/outputs/apk/$OUT/*.apk | head -n1)"

echo "installing on $TV"
"$ADB" -s "$TV" install -r "$APK" | tail -n1
"$ADB" -s "$TV" logcat -c
"$ADB" -s "$TV" shell monkey -p "$PKG" -c android.intent.category.LEANBACK_LAUNCHER 1 >/dev/null 2>&1
sleep 2
[ "${SKMATE_NO_LOG:-}" = "1" ] || follow_log
