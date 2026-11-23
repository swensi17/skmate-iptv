# libVLC для эфира

Эфир играет libVLC. В приложении лежит своя сборка libVLC 3.7.7 (та же версия, что `org.videolan.android:libvlc-all` в `engine/player-core`), только с модулями, нужными для эфира.

- что выключено: `modules-out.txt`, по строке на модуль, регулярные выражения по имени `lib<имя>_plugin.a`
- сборка: workflow `libVLC` (`.github/workflows/libvlc.yml`), запуск вручную, образы и контрибы VideoLAN
- результат: `libvlc.so` и `libvlcjni.so` для `armeabi-v7a`, `arm64-v8a`, `x86_64` кладутся в `app/src/main/jniLibs/<abi>/`, при упаковке они заменяют библиотеки из `libvlc-all`, java-часть остаётся из `libvlc-all`
- версия libVLC меняется вместе: `libvlc-all` в `engine/player-core/build.gradle.kts`, `VLC_ANDROID_TAG` и `LIBVLCJNI_HASH` в workflow (хеш из `buildsystem/compile.sh` vlc-android на этом теге)

Что остаётся в сборке: http/https, HLS и DASH, udp, rtp, rtsp, rtmp через avio, TS, ES, MP4, MKV, MediaCodec и avcodec, деинтерлейс, субтитры и телетекст.

Размер `libvlc.so`: arm64 45,9 → 34,1 МБ, armeabi-v7a 38,0 → 29,0 МБ. APK `-arm` 41,9 → 37,1 МБ.

После новой сборки проверить эфир на эмуляторе и на телевизоре: HLS, TS, канал 576i, звук AC3/EAC3, несколько звуковых дорожек, субтитры.
