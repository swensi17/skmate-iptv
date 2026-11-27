# Remote-key parity: SkMate TV web vs Android TV

Read-only audit. Android source: `skmate-android-main` at `origin/main` (aa8feb0). Android paths are relative to
`app/src/main/java/tv/own/owntv/` unless they start with `engine/`. Web paths are relative to `web/apps/tv/src`
(`packages/ui/src` for the shared UI).

Method and honesty note:
- Everything here comes from **reading the code** on both sides. I could **not** press real keys in the browser: the Browser pane refused to open `http://127.0.0.1:5173` (navigation denied), so no row is "verified live".
- Android code is newer than `android-design-spec.md` section 2d in places (passive info, recent-channels row, tools row); the web player already follows the newer code, so the player is mostly SAME.
- Status: SAME, DIFFERENT, MISSING (Android has it, web does not), WEB-ONLY (web has it, Android does not).
- Rows marked "(being fixed by another agent)" belong to the Settings sheet, in-player settings and add-source.

Counts after the home / shell / search / guide pass (169 rows; 7 in the Settings group are another agent's): SAME 159, DIFFERENT 3, MISSING 3, WEB-ONLY 4. Rows marked "SAME (nearest)" differ in content, not in the key (see the note in the row). Not driven on a real TV: Tizen / webOS key repeats for Long Back, the Menu key code 82 on a real remote.

## Top 15 user-visible differences (ranked)

1. **Remote-button settings do nothing.** Settings > Remote buttons stores `liveKeys` (jobs of OK and the arrows) and the `chNav` toggle (`state/settings.ts:116,194`, `views/SettingsPages.tsx:162-175`), but `PlayerView.tsx`, `LiveView.tsx` and `VirtualList.tsx` never read them. Android applies them (`player/PlayerHud.kt:660-770`, `ui/components/ChNavPaging.kt`).
2. **Menu key (KEYCODE_MENU, 82) is not handled** on a channel row, in the guide side panel and in the guide grid. Android opens the channel menu / poster / programme menu (`features/live/LiveScreen.kt:999`, `LiveGuideSide.kt:448`, `features/epg/EpgScreen.kt:901`). Web reacts only to the browser `contextmenu` event (mouse, PC keyboard); the guide accepts `ContextMenu`/93 but not 82.
3. **List paging by CH+/CH-, rewind/forward is cruder.** Android: skip size from settings, long press = first/last row, rewind/forward page too, also in the categories column (`ChNavPaging.kt:17-94`, `LiveScreen.kt:769-805`). Web: fixed 10, no long press, no rewind/forward, categories column not paged (`packages/ui/src/VirtualList.tsx:21-67`, `LiveView.tsx:382-392`).
4. **Category long-press OK menu is missing** on Home (hide / move / restore: `LiveScreen.kt:640-647,1461-1467`). Web categories only select.
5. **Sport card**: long OK menu and the Play / Play-Pause / FF keys that start the match are missing (`features/sports/SportsHubScreen.kt:476-487`).
6. **Profile avatar in the rail**: long OK opens the avatar picker (`features/shell/components/StageRail.kt:487-488`); the web has no avatar picker.
7. **Media keys**: Stop (pauses), rewind/forward on a film, Next/Prev = next/previous episode: Android gets these through the MediaSession (`engine/player-core/.../PlaybackSession.kt:266-286`); web `VodPlayer` ignores Stop and Next/Prev, and its seek step is fixed instead of Settings > seek step.
8. **Search field**: Android Back only ends typing and keeps the text; up/down end typing and move on (`ui/stage/StageControls.kt:148-175`). Web popup: Back = Cancel and **restores the old text**; no up/down exit (`views/SearchField.tsx`, `views/TextEntry.tsx:41-50`).
9. **Search, right arrow on a channel row** goes to the schedule under the preview (`features/search/SearchScreen.kt:446`); web does nothing.
10. **PIN dialog** is a text field + Cancel/OK on Android (`features/profiles/ProfileComponents.kt:60-100`); web is an on-screen digit pad (`views/PinDialog.tsx`). Both take the remote's digits, the focus flow differs.
11. **Update dialog**: up/down scroll the release notes while focus stays on the buttons (`features/update/UpdateDialog.kt:77-90`); web notes cannot be scrolled with the remote.
12. **Profile lock screen, Back**: swallowed on web (`App.tsx:200`); on Android Back leaves the app (no handler in `ProfileGate.kt`).
13. **Held-key pacing** (`MainActivity.kt:85-107`): Android drops key repeats until the previous step is drawn; web has none, a held arrow can queue up on a weak TV.
14. **Long Back (about 1 s) closes the app** on Android (`MainActivity.kt:66-75`); the web has no equivalent (the TV OS may do it itself).
15. **Small ones**: the setting "Left/right rewind live" does not exist on web; Yellow = favourite on a row (`views/ChannelRow.tsx:14,67`) and Info = menu in multiview (`views/MultiviewScreen.tsx:69`) exist only on the web; Back during digit entry clears it on web only.

Suggested order: 1, 2, 3, 7 (daily use on real remotes), then 4, 8, 12, 11, the rest.

---

## 0. Global / shell

| Key / action | Android | Web | Status | Fix |
|---|---|---|---|---|
| Esc / BrowserBack as Back | `MainActivity.kt:76-80` maps Esc to Back | `packages/ui/src/dpad.ts isBack` (Esc, BrowserBack, 461, 10009) | SAME | none |
| Back, one step at a time | `features/shell/OwnTVShell.kt:1032-1065` | `App.tsx:199-224` same order | SAME | none |
| Double Back to exit on Home, 2000 ms toast | `OwnTVShell.kt:1072`, `:2656` | `App.tsx:54-57,221`, toast `homePressBackAgain` | SAME | none |
| Back on guide opens the rail; guide-as-live Back returns to the list | `OwnTVShell.kt:1052`, `EpgScreen.kt:293` | `App.tsx:216-218` | SAME | none |
| Back on a section other than Home goes Home | `OwnTVShell.kt:1053` | `App.tsx:219` | SAME | none |
| Long Back closes the app | `MainActivity.kt:66-75` | `installDpad(onBack, onLongBack)` counts Back repeats (12 or 1 s) and calls `exitApp()`; needs the TV to send repeats for 10009 / 461: not checked on a real TV, Tizen and webOS may close the app themselves | SAME (key repeats) | `dpad.ts` + `App.tsx` onLongBack |
| Long Back toggles focus into the docked mini player | `OwnTVShell.kt:1077-1130` | no docked mini player on web | MISSING | not needed until a mini player exists |
| Held arrows / CH pacing | `MainActivity.kt:85-107` | `makeRepeatGate` in `dpad.ts` (capture on window, rAF twice, as the Choreographer gate); arrows, CH, PageUp/Down; unit test `dpadPacing.test.ts` | SAME | drops a repeat until the previous step had a frame |
| Menu key (82) | handled per screen | `isMenuKey` in `dpad.ts` (82, `Menu`, `ContextMenu`, 93; 82 only when `key` is not a letter, the PC letter R) used by the channel row, the categories, the guide and its side panel; the player and multiview keep their own checks (other agent) | SAME (home, guide) | `platform/index.ts` CODES untouched (other agent) |
| User-bound remote shortcuts | `PlayerHud.kt:660-713`, `engine/core/.../RemoteShortcuts.kt` | `liveKeys` / `chNav` stored, never applied | SAME | `liveKeys` read in `PlayerView.tsx runLiveJob` + `liveKeys.ts` (Android `LiveKeyMap`, `free`, run-on-key-up for OK, repeats only for zap / rewind); `chNav` gates the paging (`chNav.ts`) and the last-channel key; skip sizes `chNavUp/Down` (default 10) and `seekStep` are new `Settings` fields (Settings pages need their rows) |
| Colour keys | no factory binding | yellow = favourite removed from `ChannelRow` (Android has no colour binding); red/green/blue/yellow stay registered but do nothing on these screens | SAME | removed |
| Mouse / air-remote click | `PlayerHud.kt:596-609` edge clicks; rows `onClick` | `PlayerView.tsx:794-806` same 22 % edges; rows `onClick` | SAME | none |
| Right click as Back | none | desktop mouse only, no TV remote sends it; kept on purpose for the Windows / browser build | WEB-ONLY (kept) | kept |

## 1. Agreement screen

| Key | Android | Web | Status | Fix |
|---|---|---|---|---|
| Up / Down | scroll the text, focus stays (`features/setup/TermsOfUseScreen.kt:79-90`) | same, smooth glide (`views/Terms.tsx:78-85`) | SAME | none |
| Left / Right | between Decline / Accept | spatial | SAME | none |
| OK | Accept (focus starts on it, `:70-74`) / Decline exits | same | SAME | none |
| Back | leaves the app (no handler) | `exitApp()` (`Terms.tsx:86`) | SAME | in a desktop browser nothing happens, expected |

## 2. Wizard

| Key | Android | Web | Status | Fix |
|---|---|---|---|---|
| Up / Down | Compose focus search | spatial (`dpad.ts`) | SAME | none |
| Left / Right on stepper / segmented rows (zoom, font, theme, avatar) | `SetupWizard.kt:415-445,543` onStep, avatar wraps | `views/Wizard.tsx:158-165` onStep, focus stays; the profile step now has the avatar row (six pictures from the chosen one, Left / Right wrap, `Wizard.tsx` `AvatarStrip`) | SAME | done |
| Right on a secret field | shows/hides (`features/settings/SettingsStage.kt:1455`) | `Wizard.tsx:188-194` | SAME | none |
| OK on a text field | IME | entry popup | DIFFERENT | by design (TV keyboard); see section 13 |
| Back | previous step (`WizardFrame.kt:115`) | `Wizard.tsx:360-380`, closes language/zoom question first | SAME | none |

## 3. Home: channel list, toolbar, preview, categories

| Key | Android | Web | Status | Fix |
|---|---|---|---|---|
| Up / Down on rows | step by row number (`LiveScreen.kt:1020-1021`) | `VirtualList.tsx:50-67` | SAME | none |
| Up on first row | to the toolbar | `onToolsKey` / spatial | SAME | none |
| Down past last row | stays | `LiveView.tsx:379` | SAME | none |
| Left on a row | categories (`:1001-1008`); guide over the list: closes it | `LiveView.tsx:373` `openCats` | SAME | none |
| Left in search field | categories (`:880-891`) | `LiveView.tsx:367` | SAME | none |
| Right on a row | guide of that channel after the sheet settles (`:1009-1018`) | `LiveView.tsx:374-378` | SAME | none |
| Right on last toolbar item | stays | `LiveView.tsx:368` | SAME | none |
| OK short on row | fullscreen (`:1034-1037`) | `views/ChannelRow.tsx:78-83` on key-up | SAME | none |
| OK long on row | menu on the remote's repeat (`:988-996`) | 600 ms timer (`ChannelRow.tsx:17,72`) | SAME | fine for TVs without repeat |
| Menu key on row | same menu (`:999`) | `ChannelRow.onKeyDown` `isMenuKey` opens the channel menu | SAME | done |
| Yellow on row | none | favourite is in the channel menu only, as on Android | SAME (removed) | removed |
| CH+ / CH- / rewind / forward | page by skip setting, long = first/last, off on "All" (`LiveScreen.kt:769-805`) | owned by the Remote-buttons agent (`chNav.ts`, `VirtualList`); the Home list passes `endJump={group !== ALL}` so a long press does nothing on "All", as Android | SAME | `LiveView` `endJump` |
| CH+/- / rewind / forward in categories column | pages (`shell/components/CategoryBrowserOverlay.kt:139`) | categories column uses `createPager()` from `chNav.ts` (short = skip, long = first / last, highlight only) | SAME | `LiveView.onCatsKey/onCatsKeyUp` |
| Categories: Up / Down | walk, stop at ends | `onCatsKey` | SAME | none |
| Categories: Right | back to channels | `LiveView.tsx:383` | SAME | none |
| Categories: Left | opens side menu | left to the app | SAME | none |
| Categories: OK | select, preview keeps playing | `pickCategory` | SAME | none |
| Categories: OK long on provider group / custom category | menu: hide, move, restore (`LiveScreen.kt:640-647,1461-1467`) | long OK (600 ms) or Menu on a provider group opens Move / Hide / Restore / Cancel (`CategoryMenu.tsx`, `state/categories.ts`, kept per profile in `skmate.liveCategories.v1`). Move = Android `MoveOrderOverlay` (carry with Up/Down, OK puts down / picks up, Save, Cancel). Built-ins (Favourites, Recent, Archive, All) have no menu, as on Android. DIFFERENCE: the web has no per-channel hide / move / custom categories, so "Restore to playlist default" restores what exists here: hidden categories and the saved category order | SAME (nearest) | `LiveView`, `CategoryMenu.tsx` |
| Back with categories open | closes them, focus to current row (`:567`) | `LiveView.tsx:283-293` | SAME | none |
| Back in search with a query | clears (`LiveStage.kt:753`) | same capture handler | SAME | none |
| Sort tool / Guide-view tool OK | popup / guide | same | SAME | none |
| Play / Stop / Info on Home | no action | none | SAME | none |

## 4. Side menu rail

| Key | Android | Web | Status | Fix |
|---|---|---|---|---|
| Left from content, nothing to the left | opens rail (`OwnTVShell.kt:1340-1350`) | collapsed rail reachable by Left (`dpad.ts:55`) | SAME | none |
| Up / Down in rail | move, avatar after the last | `App.tsx:646-655`, stop at ends | SAME | none |
| Right in rail | screen entry (categories if open, else current row) | `closeMenuToContent` (`App.tsx:638`) | SAME | none |
| Left in rail | nothing | swallowed | SAME | none |
| OK on item | switch section; same section closes menu; gear opens sheet | `goTo` / `openSheet` (`App.tsx:461-480`) | SAME | none |
| Back in rail | closes menu, focus to entry | `App.tsx:213-214` | SAME | none |
| OK on avatar | switch profile | opens profile page of the sheet | SAME | none |
| OK long on avatar | avatar picker (`StageRail.kt:487-488`, `OwnTVShell.kt:1212`) | 600 ms hold on `nav-profile` opens `AvatarPicker` (760 wide, none tile + 7 pictures in rows of 5, current ringed and focused, OK picks and closes); stored as `Profile.avatar`; the rail shows it. Own-picture tile left out (no file chooser on the TV browser), as Android leaves it out where the host has none | SAME | `App.tsx`, `AvatarPicker.tsx`, `avatars.ts` |
| Full-screen item | none | only drawn on the desktop (`useFullScreen`); not on TVs | WEB-ONLY (kept) | kept |

## 5. Sport

| Key | Android | Web | Status | Fix |
|---|---|---|---|---|
| Arrows between cards and tools | focus search | spatial | SAME | none |
| OK on card | opens match | `views/SportView.tsx:96` | SAME | none |
| OK long on card | match menu with its channels (`SportsHubScreen.kt:292,339,359`) | Android's TV-box Sport screen is `SportsBoard` (`SportsHubScreen.kt:182-196`, `simple = TvBoxNav`): one-line rows, no hold and no cards. `MatchCard` with the hold menu only exists in the non-TV-box layout, which the web does not have | SAME (not in TV-box) | nothing to add |
| Play / Play-Pause / FF on card | plays the match on key-up (`:484-487`) | same reason: `OnChannelsRow` has no media-key handling on Android TV-box | SAME (not in TV-box) | nothing to add |
| Tools OK (country, sort, more) | popups | `BoardMenu`, Back closes (`useOwnBack`) | SAME | none |
| Back | to Home via shell | shell | SAME | none |

## 6. Search

| Key | Android | Web | Status | Fix |
|---|---|---|---|---|
| OK on field | IME | entry popup (`SearchField.tsx`) | DIFFERENT | by design |
| Back while typing | ends typing, keeps text (`StageControls.kt:153-160`) | `TextEntry`: Back = Done, keeps the text; the Cancel button puts the old text back | SAME | `TextEntry.tsx` (shared: also the settings / wizard fields) |
| Up / Down while typing | end typing, move focus (`:162-175`) | search fields pass `leave`: Up / Down end typing, the box gets the focus and the arrow is pressed on it (`moveFrom`) | SAME | `SearchEntry`, `SearchField` |
| Down from field | first filter / recent | `SearchView.tsx:192-198` | SAME | none |
| Up from first result | to the filter | `SearchView.tsx:199-206` | SAME | none |
| Right on a channel row | schedule under the preview (`SearchScreen.kt:446`) | `SearchView.onListKey` + `Schedule` under the preview: Right enters it when a next programme exists, Left goes back to the row, Down stops on the last line, OK opens the channel | SAME | done |
| OK on result | go to / play | `goTo` | SAME | none |
| Back with a query | clears query, filters, focus to field (`:244-252`) | `SearchView.tsx:179-190` | SAME | none |
| Back from "Go to" lands on the row | `lastFocusKey` | `lastKey` restore | SAME | none |

## 7. Guide

| Key | Android | Web | Status | Fix |
|---|---|---|---|---|
| Up / Down rows | `EpgScreen.kt:913-914` | `views/GuideView.tsx:244-255` | SAME | none |
| Right in row stage | into programmes (`:908-909`) | `enterCell` | SAME | none |
| Left / Right in programme stage | cursor step | same | SAME | none |
| Left in row stage | to the side menu | left to the app | SAME | none |
| OK short | row: enter; programme: play/open (`:894-900`) | `GuideView.tsx:262-267` | SAME | none |
| OK long | programme/channel menu | repeat or 500 ms (`:219-229`) | SAME | none |
| Menu key | `Key.Menu` (`:901`) | `GuideView` uses `isMenuKey` | SAME | done |
| Back in programmes | back to row stage (`:294`) | `GuideView.tsx:268-277` | SAME | none |
| Back in row stage | opens rail | `App.tsx:218` | SAME | none |
| Guide side panel: Left close, Right days, OK play, hold OK poster, Back | `LiveGuideSide.kt:381-448` | `views/GuideSide.tsx:90-130` | SAME | none |
| Guide side panel: Menu key shows poster | `LiveGuideSide.kt:448` | `GuideSide.onKey` `isMenuKey` -> poster | SAME | done |

## 8. Player: live HUD (default key map, user bindings off)

| Key | Android | Web | Status | Fix |
|---|---|---|---|---|
| OK, HUD hidden | tiles row (`player/PlayerHud.kt:789-795`) | `show("tiles")` (`views/PlayerView.tsx:573`) | SAME | none |
| OK on the passive info | tiles (`:696-710`) | `hud.passive` | SAME | none |
| OK on info | paused: resume; else tiles | `:602` | SAME | none |
| OK on timeline | presses the focused transport key | `:614-619` | SAME | none |
| OK on tile | acts on key-up (`TvBoxLiveHud.kt:67-76`) | `onKeyUp` (`:631-640`) | SAME | none |
| Up, hidden | next channel (`:869-870`) | `zap(1)` (`:566`) | SAME | none |
| Down, hidden | previous channel | `zap(-1)` | SAME | none |
| Up / Down, hidden, behind live or archive | zap (`canZap && isLive`) | shows the timeline (`:553-556`) | SAME | Android `canZap && isLive` zaps a recording too (isLive = live channel); the web timeline detour is removed |
| Left / Right, hidden | channel list / history (`:891-896`); archive: scrub (`:808-823`) | `:567-571`, scrub steps by repeat | SAME | none |
| Left / Right, hidden, live with guide, setting "Left/right rewind live" on | scrubs (`:878-896`) | setting missing, always panels | SAME | `Settings.liveLeftRightRewinds` (default off) read in `PlayerView.tsx`; the Settings row (Android string `settings_live_left_right_rewinds`) is for the Settings agent |
| Left / Right on info | hide + panel (`:850-863`) | `:612-613` | SAME | none |
| Left / Right on timeline | walk transport keys | `:605-612` | SAME | none |
| Left / Right on tiles | previous/next tile, walls | `:586-592` | SAME | none |
| Up on info | hide HUD | `:621` | SAME | none |
| Down on info | timeline if archive/guide data, else tiles | `:619` | SAME | none |
| Up on timeline | info | `:618` | SAME | none |
| Down on timeline | tiles | `:617` | SAME | none |
| Up on tiles | timeline, else info | `:593` | SAME | none |
| Down on recent-channels row | opens tools row | `:580` | SAME | none |
| Back: HUD hidden | leave player | `:559` | SAME | none |
| Back: info or tiles | hide all at once (`PlayerHud.kt:366-372`) | `:561` | SAME | none |
| Back: timeline | back to info | `:560` | SAME | none |
| Back: panel / dialog | close it | `:520-523` | SAME | none |
| Back with digits pending | not handled | clears the entry | SAME | removed: Back leaves like any Back (Android has no digit handler) |
| CH+ / CH- | zap +1 / -1, swallowed (`:654-660`) | `:545-546` | SAME | none |
| Media Next / Prev | zap (`:865-866`) | `:545-546` | SAME | none |
| Previous-channel key (10190) | LAST_CHANNEL binding | `lastChannel` (`:548`) | SAME | now only with Remote buttons on, acts on key-up (Android shortcut path) |
| Channel-list key (10073) | user binding only | opens channels when hidden (`:569`) | WEB-ONLY (kept) | Android has no factory binding, but only a remote that has this key sends it, so it is harmless: kept |
| 0-9 | direct tune, 5 digits, 2 s, OK submits (`:612-650`) | `:524-529`, `MAX_DIRECT_TUNE_DIGITS = 5` | SAME | setting honoured on both |
| Play / Pause / Play-Pause, HUD shown | toggles (MediaSession) | `playPause()` (`:577`) | SAME | none |
| Play / Pause, HUD hidden | shows info, key swallowed (`:906-908`) | any key shows info (`:574`) | SAME | none |
| Stop | MediaSession pauses | not mapped | SAME | `stop` pauses while the HUD is shown (hidden: any key shows the info, as Android's catch box) |
| Rewind / Forward on live | nothing (MediaSession seeks non-live only) | wake only | SAME | none |
| Info, Menu, colour keys | HUD hidden: info; shown: nothing | `:574` | SAME | none |
| Mouse: left/right 22 % edges, centre toggles | `:596-609` | `:794-806` | SAME | none |
| Mouse move shows HUD | no | `:644` | WEB-ONLY (kept) | no TV remote sends mouse moves except LG's pointer, where waking the HUD matches LG's own players: kept |

## 9. Player panels (channels, history, categories, guide under the picture)

| Key | Android | Web | Status | Fix |
|---|---|---|---|---|
| Up / Down list | row by row | `VirtualList` | SAME | none |
| Left in list | categories (history: close) (`shell/components/TvBoxChannelPanel.kt:259-262`) | `views/PlayerPanel.tsx:279` | SAME | none |
| Right in list | guide / poster under the picture (`:262-265`) | `:280-285` | SAME | none |
| OK | play channel | row click | SAME | none |
| OK long | none (`ChannelListOverlay.kt:222`) | none | SAME | none |
| Left on categories | side menu | `:272` | SAME | none |
| Right / Back on categories | back to channels | `:273-276` | SAME | none |
| Menu rail: Right / Back | to the entry | `:266-271` | SAME | none |
| Poster: OK opens big, OK/Back closes | `:366` | `:213-217,232` | SAME | none |
| Under-picture lines: walls, OK plays, Left back to list | `:357-367,642-644` | `:224-247` | SAME | none |
| Back | closes that layer | `p.onDismiss()` | SAME | none |
| CH+/- / rewind / forward | categories page 10, long = first/last; channel panel not wired | lists page 9, cats 10, no long press | SAME | categories `VirtualList` pages by the setting, long = first / last; the channel / history lists have `paging={false}` (not wired on Android) |
| Digits with a panel open | ignored | ignored (`:519`) | SAME | none |

## 10. Classic HUD (archive from the guide, films, episodes)

| Key | Android | Web | Status | Fix |
|---|---|---|---|---|
| Left / Right, hidden | seek by Settings seek step, HUD shows the bar (`PlayerHud.kt:878-896`) | fixed step `VOD_SEEK_STEP_S` (`views/VodPlayer.tsx:131`, `PlayerView.tsx:660`) | SAME | `VodPlayer.tsx` and the classic branch read `Settings.seekStep` (default 10 s) |
| Left / Right on the seek bar | +/- step (`PlayerHudControls.kt:411-412`) | `VodPlayer.tsx:133` | SAME | none |
| Left / Right between buttons | focus search | spatial | SAME | none |
| OK, hidden | shows HUD | `show("ch-play")` | SAME | none |
| OK on a button | action | action | SAME | none |
| Back | hide HUD, then leave | `VodPlayer.tsx:123-125` | SAME | none |
| Play / Pause | toggles | `togglePause` | SAME | none |
| Rewind / Forward | MediaSession seek step | `:128` fixed step | SAME | wind by the seek step while the HUD is shown; hidden: the key shows the HUD (Android catch box) |
| Media Next / Prev | next / previous episode (`PlaybackSession.kt:285-286`) | not mapped | SAME | `VodPlayer` maps `next` / `prev`; `prev?: {label, play}` is a new prop: App.tsx must pass the previous episode |
| Stop | pause | not mapped | SAME | `VodPlayer` pauses on Stop while the HUD is shown |
| Next-episode card: OK / Back | OK plays, Back dismisses | `VodPlayer.tsx:123` | SAME | none |

## 11. Player dialogs (aspect, sleep, audio, subtitles), error, loading

| Key | Android | Web | Status | Fix |
|---|---|---|---|---|
| Up / Down / OK in dialogs | options | dialog options | SAME | none |
| Subtitle delay stepper Left / Right | `PlayerHudDialogs.kt:385-398` | not read | SAME | check live |
| Back in a dialog | dismiss (`:83,207,237,316,332`), focus back on the tile | `PlayerView.tsx:520-523` + `lastTile` | SAME | none |
| Error: OK = Retry, Back leaves | yes | `:535-540` | SAME | none |
| Error: arrows | swallowed | `:539` | SAME | none |
| Loading | keys pass through | same | SAME | none |

## 12. Multiview

| Key | Android | Web | Status | Fix |
|---|---|---|---|---|
| Arrows between tiles | focus search | spatial | SAME | none |
| OK short | pick channel / give sound | `views/MultiviewScreen.tsx:76-80` | SAME | none |
| OK long | tile menu on the release, held 500 ms (`MultiviewScreen.kt:171-186`) | same, on key-up (`MultiviewScreen.tsx`) | SAME | none |
| Menu key | `features/multiview/MultiviewScreen.kt:170` | `ContextMenu` / 82 (`:69`) | SAME | none |
| Info key | none | opens the menu (`:69`, 457) | SAME | removed: Info does nothing in multiview; OK now acts on key-up (500 ms = menu), as `MultiviewScreen.kt:171-186` |
| Back | exit (`:92`); picker: one step | `:112-118` | SAME | none |

## 13. Popups: text entry, PIN, confirm, profile, update

| Key | Android | Web | Status | Fix |
|---|---|---|---|---|
| Text field: OK | IME, Done ends | popup, OK = Done (`TextEntry.tsx:74`) | SAME | none |
| Text field: Back | ends typing, keeps text | see Search row | SAME | done |
| PIN: input | text field, 4-6 digits, IME (`ProfileComponents.kt:60-100`) | `PinDialog` is a popup with a PIN field (digits, 6 at most), Cancel / OK, OK dimmed below 4; the focus lands in the field and the remote's digits type. Test `pinDialog.test.ts`. Not driven with real keys on a TV | SAME | `PinDialog.tsx` |
| PIN: Back | dismiss | `App.tsx:206` | SAME | none |
| Confirm: Back = Cancel; focus starts on Cancel | yes | `Confirm.tsx:13,14` | SAME | none |
| Profile lock screen: Back | leaves app | `App.tsx` calls `exitApp()` (a desktop browser stays, nothing to leave to) | SAME | done |
| Profile edit sheet | rows + popups | `views/ProfilesPanel.tsx` | SAME | none |
| Update dialog: Up / Down scroll notes | `UpdateDialog.kt:77-90` | `UpdateDialog.Notes` scrolls the notes 200 px per press while focus stays on the buttons; at the ends the arrow goes on | SAME | done |
| Update dialog: OK / Back | install / dismiss | `UpdateDialog.tsx:27,53` | SAME | none |
| Popups give focus back to the opener | yes | `useReturnFocus`, `focusFirst(id)` | SAME | none |

## 14. Settings sheet, in-player settings, add source (being fixed by another agent)

| Key | Android | Web | Status | Fix |
|---|---|---|---|---|
| Up / Down rows, OK activates | `features/settings/SettingsStage.kt` | `views/SettingsKit.tsx` | SAME (being fixed by another agent) | none |
| Left / Right only on stepper / segmented rows | `:797,972` | `SettingsKit.tsx:131,303` | SAME (being fixed by another agent) | none |
| Left closes a choice list like Back | `:717` | `SettingsKit.tsx:271` | SAME (being fixed by another agent) | none |
| OK long on a group row = pin to Quick | `:934-963` | `SettingsKit.tsx:93,111,123-139` | SAME (being fixed by another agent) | none |
| Back one level | `:665,1232,1271,1340` | `SettingsSheet.tsx:185` | SAME (being fixed by another agent) | none |
| Text field rows: OK edit, Back stops | `:1455,1517` | `TextEntry` popup | DIFFERENT (being fixed by another agent) | see section 13 |
| Remote buttons page choices | applied in player and lists | stored only | MISSING (being fixed by another agent) | wire into PlayerView / VirtualList (top item 1) |
| Panel width / Guide width pages | adjustable | disabled "not here" (`SettingsPages.tsx:182-200`) | MISSING (being fixed by another agent) | out of key scope |

Add-source keys were not compared in depth (the screen is being rewritten); recheck after the other agent finishes.

## 15. Focus traps (code-read, not run)

- Every dialog uses `[data-modal]`; `installDpad` limits arrows to the top dialog and `useOwnBack` gives Back one step at a time. No dead end found in the code for: agreement, wizard, rail, categories, player panels, guide side panel, multiview picker, confirm, PIN, text entry, update.
- Player error screen: arrows swallowed, only Retry and Back remain; Back always leaves. OK.
- Profile lock screen: Back is swallowed; the only way out is a profile or a PIN. Android lets Back leave the app. Minor trap on web.
- Search with no results and no recent searches: Down from the field does nothing (`SearchView.tsx:192-198` returns); Up / Left / Back still work. Worth a live check.
- After closing popups focus returns through `focusFirst(id)` or `useReturnFocus` everywhere I read; the player returns to the last tile (`lastTile`). Not verified live.
- Rail: leave with Right or Back, Left stays. Reachable from each screen by Left at the left edge (guide row stage, categories, player panel).

## 16. Not verified

- Anything dynamic: real key presses, Tizen / webOS key codes, focus after popups, timing of 500-600 ms holds.
- Android behaviour that depends on settings (custom `liveKeys`, remote shortcuts) was read, not run.
- CH+/- while watching an archive recording from the guide: web zaps channels (`PlayerView.tsx:545` runs before the classic branch); I did not check whether Android zaps there.
- The WEB-ONLY row "Up / Down hidden behind live" was not found in the Android source I read; it may exist in a part I did not open.

## 17. Player side update (live-tested in the browser with synthetic key events)

- Fixed: remote-button jobs (`liveKeys`) and the `chNav` switch in the player; CH+/CH-/rewind/forward paging in every `VirtualList` (skip 10 by default, 600 ms = first / last row, off with the switch); left/right rewind live setting field; seek step on films; Stop; media Next / Prev on films; no digit-Back special case; Back repeats ignored in the player, panel, multiview and film player; multiview Info removed, OK on key-up.
- Kept on purpose: channel-list key (10073) and mouse-move HUD (harmless extras, see rows).
- Open for other agents: Settings rows for `liveLeftRightRewinds`, `seekStep`, `chNavUp/Down` (new `Settings` fields, defaults as Android); the Settings page shows OK = info / up = **previous** / down = **next** as the usual jobs, Android's are up = next, down = previous (`LiveKeys.kt defaultFor`); `LiveView` should pass `endJump={false}` for the "All" list and has its own categories column; `App.tsx` should pass `prev` to `VodPlayer`.
