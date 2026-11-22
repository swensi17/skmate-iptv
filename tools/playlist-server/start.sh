#!/bin/sh
# Runs the playlist service under pm2. Settings (bot token, admin ids) live outside the repository in
# /root/secrets/skmate-playlist/env (mode 600), never in git.
set -a
[ -f /root/secrets/skmate-playlist/env ] && . /root/secrets/skmate-playlist/env
set +a
export SKMATE_PL_DATA="${SKMATE_PL_DATA:-/opt/skmate-playlist/data}"
export TZ="${TZ:-Asia/Tashkent}"  # the author's time: dates in the bot, the 9:00 report
exec python3 -u /opt/skmate-playlist/skmate_playlist.py
