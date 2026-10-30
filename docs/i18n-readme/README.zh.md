<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../docs/brand/banner-dark.png">
    <img src="../../docs/brand/banner-light.png" alt="SkMate IPTV" width="560">
  </picture>
</p>

<h1 align="center">SkMate IPTV</h1>

<p align="center"><b>免费、开源的 IPTV 播放器，适用于 Android TV、Google TV 和 Fire TV。</b><br>
支持 M3U 与 Xtream Codes、电视节目单 (EPG)、回看、多用户——专为遥控器设计，无广告，无需账号。</p>

<p align="center">
  <a href="https://github.com/swensi17/skmate-iptv/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/swensi17/skmate-iptv?label=release&color=1e88e5"></a>
  <a href="https://github.com/swensi17/skmate-iptv/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/swensi17/skmate-iptv/total?color=43a047"></a>
  <a href="../../LICENSE"><img alt="License GPL-3.0" src="https://img.shields.io/badge/license-GPL--3.0-blue"></a>
  <img alt="Android TV" src="https://img.shields.io/badge/Android%20TV-8.0%2B-3ddc84?logo=androidtv&logoColor=white">
  <img alt="Kotlin" src="https://img.shields.io/badge/Kotlin-Compose%20for%20TV-7f52ff?logo=kotlin&logoColor=white">
  <img alt="libVLC" src="https://img.shields.io/badge/engine-libVLC-ff8800?logo=vlcmediaplayer&logoColor=white">
</p>

<p align="center"><a href="../../README.md">Русский</a> · <a href="README.en.md">English</a> · <b>中文</b></p>

<p align="center"><img src="../screenshots/live-dark.jpg" alt="SkMate IPTV 直播" width="900"></p>

## 功能

**来源**
- 通过链接或文件导入 M3U / M3U8，支持 Xtream Codes、Stalker/Ministra，可同时使用多个播放列表。
- 提供商分组（`group-title`、`#EXTGRP`）、收藏、最近观看、隐藏和重命名分类。
- 在局域网内用手机扫描二维码添加播放列表，无需用遥控器输入。

**电视节目单与回看**
- XMLTV（`url-tvg`、`.xml`、`.xml.gz`），即使没有 `tvg-id` 也能按频道名称自动匹配。
- 所有频道的节目网格，频道列表中直接显示简介和下一个节目。
- 在提供商支持时可回看和直播倒退。

**播放器**
- 单一 **libVLC** 引擎：HLS、MPEG-TS、H.264/HEVC、隔行 576i、MP2/AC-3 音频。
- 频道约 1 秒打开；流中断时静默重连，而不是重启播放器。
- 使用 ▲▼ 和 CH± 换台，频道列表和分类覆盖在画面上，播放不中断。
- 列表中的实时预览，平滑展开为全屏。

**界面**
- 为遥控器设计：方向键和确认键即可完成所有操作，焦点始终清晰可见。
- 深色与浅色主题、强调色、界面缩放、可调动画。
- 多用户、分类 PIN 锁、备份以及电视之间的同步。
- 界面语言：俄语、英语、中文等 20 多种。

**更新**
- 应用会在 GitHub Releases 上发现新版本、校验签名并自动安装。
- 可以关闭；可选择检查频率（启动时 / 每 6 小时 / 每天）和安装时间（任何时间 / 夜间）。

## 截图

| | |
|:-:|:-:|
| ![直播](../screenshots/live-dark.jpg) | ![电视指南](../screenshots/guide-dark.jpg) |
| **直播**: 频道列表、实时预览、节目信息 | **电视指南**: 所有频道的节目网格 |
| ![播放器](../screenshots/player-dark.jpg) | ![播放器中的频道](../screenshots/player-channels-dark.jpg) |
| **播放器**: 当前节目、时间、进度、下一个节目 | **画面上的频道列表** 附带频道节目表 |
| ![分类](../screenshots/player-categories-dark.jpg) | ![分类](../screenshots/categories-dark.jpg) |
| **播放器中的分类**, 画面不中断 | **分类** 频道列表中 |
| ![设置](../screenshots/settings-dark.jpg) | ![来源与 EPG](../screenshots/settings-sources-dark.jpg) |
| **设置** — 覆盖在直播上的侧边面板 | **来源与电视节目单 (EPG)**, 回看 |
| ![外观](../screenshots/settings-appearance-dark.jpg) | ![系统](../screenshots/settings-system-dark.jpg) |
| **外观**: 主题、强调色、缩放、动画 | **系统**: 语言、自动更新、安装时间 |
| ![浅色主题](../screenshots/live-light.jpg) | ![浅色电视指南](../screenshots/guide-light.jpg) |
| **浅色主题** | **浅色主题下的电视指南** |

## 安装

1. 下载最新的签名 APK：
   **https://github.com/swensi17/skmate-iptv/releases/latest/download/SkMate-IPTV.apk**
2. 在电视上用 **Downloader** 应用打开该链接。
3. 允许从该来源安装并安装 APK。
4. 在应用内或用手机扫码添加播放列表。

支持 Android TV / Google TV 8.0+、Fire TV 以及 Android 机顶盒（arm64-v8a、armeabi-v7a）。

## 安全

v0.1.0 版本的 APK 链接已在 [VirusTotal](https://www.virustotal.com/gui/url/05d504ce01ad088e31df5fe963ef495adecafe4fdb005be10bb8738947c0ec53) 检测：**93 个**扫描引擎中 **0 个**报告问题。源代码公开，构建在 GitHub Actions 中完成。SHA-256 校验值见发布页 (`SHA256SUMS.txt`)：

- arm: `e1041da56c2d1f69f3f7f84d5cd3bd64778a03b5f7b3f708855016cd0d608dcd`
- x86_64: `a9fd75fc7f98c11a6de5051ecad078a66036df0514ddb73a34813df017dbd181`

## 从源码构建

需要 JDK 21 和 Android SDK（platform 37）。核心库（[skmate-iptv-core](https://github.com/swensi17/skmate-iptv-core)）来自 GitHub Packages：

```bash
export GITHUB_ACTOR=<你的用户名> GITHUB_TOKEN=<具有 read:packages 权限的令牌>
./gradlew :app:assembleStandardDebug
```

## 技术栈

Kotlin · Jetpack Compose for TV · libVLC · Room · Koin · OkHttp · Coroutines/Flow · Coil。

## 内容声明

SkMate IPTV 只是播放器，不包含也不提供任何频道、播放列表或订阅。用户需自行对所添加的来源负责。

## 许可证

[GPL-3.0-or-later](../../LICENSE)。版权声明见 [NOTICE](../../NOTICE)，第三方组件见 [THIRD_PARTY_LICENSES.md](../../THIRD_PARTY_LICENSES.md)。

## 链接

[Telegram](https://t.me/swensi17) · [X](https://x.com/swensi17) · [GitHub](https://github.com/swensi17)
