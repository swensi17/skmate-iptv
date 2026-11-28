import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { focusFirst, Stepper, Toggle } from "@skmate/ui";
import { t, type Key } from "../i18n";
import { LANGUAGES } from "../i18n/languages";
import { SearchIndex, type Channel } from "@skmate/core";
import { channelKey } from "../state/favorites";
import { FOCUS_PRESETS } from "../state/look";
import type { PlaylistEntry } from "../state/playlists";
import { ACCENTS, accentColor, bufferFor, clampZoom, type Settings } from "../state/settings";
import { BigStepper, ChoiceList, onOffText, pl, SwitchList, tf, useSheet, type Choice } from "./SettingsKit";
import { Presence } from "@skmate/ui";
import { TextEntry } from "./TextEntry";

/*
 * Every row of the Android settings groups, by its Android key (SettingsScreen.kt root rows, VideoPlayerSettingsScreen.kt
 * `vp_*` rows), and which rows each group page lists under which heading. A row knows its icon, its words, the value
 * line under it, what sits on its right, and what OK (and ◀ ▶) do; a row that edits in the sheet brings its editor.
 * Quick lists rows of the other groups by these keys, so a pinned row and its home row are the same row.
 */

export interface RowDef {
  key: string;
  icon: string;
  title: string;
  line?: string;
  end?: ComponentChildren;
  ok?: () => void;
  step?: (d: number) => void;
  /** What OK opens over the rows (a choice list, a stepper, switches), under [title]. */
  editor?: () => ComponentChildren;
  hidden?: boolean;
  /** Can be held to pin to Quick (group-page rows; not the clock's look, not sub-page rows). */
  pin?: boolean;
  disabled?: boolean;
}

export interface Confirmation { title: string; body: string; confirm: string; cancel?: string; onConfirm: () => void; onCancel?: () => void }

export interface RowsCtx {
  s: Settings;
  set: (patch: Partial<Settings>) => void;
  playlists: PlaylistEntry[];
  epgCount: number;
  /** External players this computer has (the Windows app); none on a TV. */
  players: string[];
  throttled: boolean;
  /** The channels of the playlist in use (Запуск приложения › Выбранный канал). */
  channels: readonly Channel[];
  ask: (c: Confirmation) => void;
  openUpdate: () => void;
}

export type Item = string | { h: Key; first?: boolean };

const sw = (on: boolean) => <Toggle on={on} />;
const cyc = <T,>(list: readonly T[], cur: T, d: number, wrap = true): T => {
  const i = Math.max(0, list.indexOf(cur));
  const n = wrap ? (i + d + list.length) % list.length : Math.max(0, Math.min(list.length - 1, i + d));
  return list[n] as T;
};
const pct = (n: number) => tf("sa_common_percent", n);
const secs = (n: number) => tf("sa_settings_live_buffer_seconds", n);

/** "+1 ч 30 мин", "−30 мин", "Выкл." (SettingsScreen.kt epgShiftLabel). */
export function epgShiftLabel(min: number): string {
  if (min === 0) return t("sa_common_off");
  const sign = min < 0 ? "−" : "+";
  const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
  if (h && m) return tf("sa_content_epg_shift_hours_minutes", sign, h, m);
  if (h) return tf("sa_content_epg_shift_hours", sign, h);
  return tf("sa_content_epg_shift_minutes", sign, m);
}

/** "UTC+05:00" (SettingsScreen.kt utcOffsetLabel). */
export function utcLabel(min: number): string {
  if (min === 0) return "UTC";
  const a = Math.abs(min);
  return `UTC${min < 0 ? "-" : "+"}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

const OFFSETS: number[] = [];
for (let m = -720; m <= 840; m += 15) OFFSETS.push(m);

const leadLabel = (n: number) => (n === 0 ? t("sa_settings_reminder_at_start") : tf("sa_content_remind_before", tf("sa_player_duration_minutes", n)));
const latencyLabel = (l: string, custom: number) =>
  l === "low" ? t("sa_settings_live_latency_low") : l === "stable" ? t("sa_settings_live_latency_stable") : l === "custom" ? secs(custom) : t("sa_settings_live_latency_balanced");
const vodBufferLabel = (n: number) => (n === 0 ? t("sa_settings_vod_network_auto") : n % 60 === 0 ? tf("sa_player_duration_minutes", n / 60) : secs(n));
const timeoutLabel = (n: number) => (n === 0 ? t("sa_common_never") : secs(n));

const ZOOMS: Array<{ v: Settings["zoomMode"]; k: Key }> = [
  { v: "fit", k: "sa_player_zoom_fit_screen" }, { v: "crop", k: "sa_player_zoom_fill_crop" }, { v: "stretch", k: "sa_player_zoom_stretch" },
  { v: "original", k: "sa_player_zoom_original" }, { v: "16_9", k: "sa_player_zoom_force_16_9" }, { v: "4_3", k: "sa_player_zoom_force_4_3" }, { v: "2_39", k: "sa_player_zoom_force_2_39" },
];
const THEMES: Array<{ v: Settings["theme"]; k: Key }> = [
  { v: "system", k: "sa_settings_theme_system" }, { v: "dark", k: "sa_settings_theme_dark" }, { v: "light", k: "sa_settings_theme_light" },
];
const ACCENT_NAMES: Record<Settings["accent"], Key> = {
  teal: "sa_settings_accent_teal", blue: "sa_settings_accent_blue", violet: "sa_settings_accent_violet",
  green: "sa_settings_accent_green", amber: "sa_settings_accent_amber", ink: "sa_settings_accent_ink",
};
const ACCENT_ORDER: Array<Settings["accent"]> = ["teal", "blue", "violet", "green", "amber", "ink"];
const FOCUS_WIDTHS: Key[] = ["sa_settings_focus_width_thin", "sa_settings_focus_width_normal", "sa_settings_focus_width_thick", "sa_settings_focus_width_extra"];
const NAV_SIZES: Key[] = ["sa_settings_nav_size_compact", "sa_settings_nav_size_normal", "sa_settings_nav_size_wide", "sa_settings_nav_size_extra_wide"];
const SPEEDS: Array<{ v: Settings["motionSpeed"]; k: Key }> = [
  { v: "fast", k: "sa_motion_speed_fast" }, { v: "normal", k: "sa_motion_speed_normal" }, { v: "slow", k: "sa_motion_speed_slow" },
];
const STARTUPS: Array<{ v: Settings["startup"]; k: Key }> = [
  { v: "home", k: "sa_settings_startup_home" }, { v: "last", k: "sa_settings_startup_last_channel" },
  { v: "favorites", k: "sa_settings_startup_favorites" }, { v: "channel", k: "sa_settings_startup_specific_channel" },
];
const EVERY: Array<{ v: Settings["updateEvery"]; k: Key }> = [
  { v: "start", k: "sa_update_every_start" }, { v: "6h", k: "sa_update_every_6h" }, { v: "day", k: "sa_update_every_day" },
];

/** A playlist's own value in a per-playlist list: "Имя  ·  значение". */
function PerPlaylist<V>(p: {
  playlists: PlaylistEntry[]; valueOf: (id: string) => V | undefined; label: (v: V | undefined) => string;
  options: (name: string) => Array<Choice<V | undefined>>; onPick: (id: string, v: V | undefined) => void;
}) {
  const [at, setAt] = useState<string | null>(null);
  const sheet = useSheet();
  if (at === null) {
    return (
      <ChoiceList key="pick" idPrefix="ppl" value={null as string | null}
        options={p.playlists.map((x) => ({ value: x.id as string | null, label: `${x.name}  ·  ${p.label(p.valueOf(x.id))}` }))}
        onPick={(id) => setAt(id)} onClose={sheet.closeEditor} />
    );
  }
  const entry = p.playlists.find((x) => x.id === at);
  return (
    <>
      <div class="set-editor-sub">{entry?.name ?? ""}</div>
      <ChoiceList key={at} idPrefix="ppv" value={p.valueOf(at)} options={p.options(entry?.name ?? "")}
        onPick={(v) => { p.onPick(at, v); setAt(null); }} onClose={() => setAt(null)} />
    </>
  );
}

/** Every row, by key. Built on each render from the current settings (a few dozen small objects). */
export function buildRows(c: RowsCtx, close: () => void): Record<string, RowDef> {
  const { s, set } = c;
  const list: RowDef[] = [];
  const add = (r: RowDef) => { list.push({ pin: true, ...r }); };
  const choice = <T,>(options: ReadonlyArray<Choice<T>>, value: T, pick: (v: T) => void) => () => (
    <ChoiceList options={options} value={value} onPick={(v) => { pick(v); close(); }} onClose={close} />
  );

  // ---- Быстрые настройки (the six rows that are only in Quick; any other row can be pinned there too)
  const preview = (on: boolean) => set({ preview: on });
  add({ key: "quick_live_preview", icon: "LIVE_TV", title: t("sa_settings_quick_live_preview"), line: t("sa_settings_line_quick_live_preview"), end: sw(s.preview), ok: () => preview(!s.preview) });
  add({ key: "quick_preview_sound", icon: "AUDIO", title: t("sa_settings_quick_preview_sound"), line: t("sa_settings_line_preview_sound"), end: sw(s.previewAudio), ok: () => set({ previewAudio: !s.previewAudio }) });
  add({ key: "quick_channel_numbers", icon: "LIVE_TV", title: t("sa_settings_quick_channel_numbers"), line: t("sa_settings_line_quick_channel_numbers"), end: sw(s.directTune), ok: () => set({ directTune: !s.directTune }) });
  add({ key: "quick_hdr", icon: "VIDEO", title: t("sa_settings_quick_prefer_sdr"), line: t("sa_settings_line_prefer_sdr"), end: sw(s.preferSdr), ok: () => set({ preferSdr: !s.preferSdr }) });
  add({ key: "quick_autoplay", icon: "AUTOPLAY_NEXT", title: t("sa_settings_quick_autoplay"), line: t("sa_settings_line_quick_autoplay"), end: sw(s.autoPlayNext), ok: () => set({ autoPlayNext: !s.autoPlayNext }) });
  add({ key: "quick_check_update", icon: "DOWNLOADS", title: t("sa_settings_quick_check_update"), line: t("sa_settings_line_when_app_opens"), end: sw(s.updateOnStart), ok: () => set({ updateOnStart: !s.updateOnStart }) });

  // ---- Источники каналов
  add({ key: "tab_SOURCES", icon: "PLAYLIST", title: t("sa_settings_playlists"), line: pl("sa_more_playlist_count", c.playlists.length) });
  add({ key: "tab_EPG", icon: "EPG", title: t("sa_settings_epg_sources"), line: pl("sa_settings_epg_feed_count", c.epgCount) });
  add({
    key: "epg_offset", icon: "EPG", title: t("sa_content_epg_time_offset"), line: epgShiftLabel(s.epgOffsetMin),
    editor: () => <BigStepper value={epgShiftLabel(s.epgOffsetMin)} onDone={close}
      onStep={(d) => set({ epgOffsetMin: Math.max(-720, Math.min(840, s.epgOffsetMin + d * 30)) })} />,
  });
  const reminders: Array<Choice<Settings["reminderMode"]>> = [
    { value: "ask", label: t("sa_settings_reminder_ask") }, { value: "switch", label: t("sa_settings_reminder_switch") }, { value: "notify", label: t("sa_settings_reminder_notify") },
  ];
  add({ key: "reminders", icon: "BELL", title: t("sa_settings_reminders"), line: reminders.find((r) => r.value === s.reminderMode)?.label, editor: choice(reminders, s.reminderMode, (v) => set({ reminderMode: v })) });
  add({ key: "reminder_lead", icon: "CLOCK", title: t("sa_settings_reminder_lead"), line: leadLabel(s.reminderLead),
    editor: choice(([0, 1, 5] as const).map((n) => ({ value: n, label: leadLabel(n) })), s.reminderLead, (v) => set({ reminderLead: v })) });
  add({
    key: "guide_days", icon: "EPG", title: t("sa_settings_epg_guide_days"), line: pl("sa_settings_epg_guide_days_value", s.guideDays),
    editor: () => <BigStepper value={pl("sa_settings_epg_guide_days_value", s.guideDays)} onDone={close}
      onStep={(d) => set({ guideDays: Math.max(1, Math.min(14, s.guideDays + d)) })} />,
  });
  const tzLabel = s.catchupTz === "auto" ? t("sa_settings_catchup_timezone_automatic") : s.catchupTz === "device" ? t("sa_settings_device") : utcLabel(s.catchupOffsetMin);
  add({
    key: "catchup", icon: "CATCHUP", title: t("sa_settings_catchup"), line: tzLabel,
    editor: () => (
      <>
        <ChoiceList idPrefix="tz" value={s.catchupTz} onClose={close}
          options={[{ value: "auto", label: t("sa_settings_catchup_timezone_automatic") }, { value: "device", label: t("sa_settings_device") }, { value: "manual", label: t("sa_settings_manual") }] as Array<Choice<Settings["catchupTz"]>>}
          onPick={(v) => { set({ catchupTz: v }); if (v !== "manual") close(); }} />
        {s.catchupTz === "manual" ? (
          <BigStepper value={utcLabel(s.catchupOffsetMin)} onDone={close} onStep={(d) => set({ catchupOffsetMin: Math.max(-720, Math.min(840, s.catchupOffsetMin + d * 15)) })} />
        ) : null}
      </>
    ),
  });
  const tzOf = (v: "device" | number | undefined) => (v === undefined ? t("sa_settings_live_preroll_follow") : v === "device" ? t("sa_settings_device") : utcLabel(v));
  const tzOverrides = Object.keys(s.catchupPerPlaylist).filter((id) => c.playlists.some((p) => p.id === id)).length;
  add({
    key: "catchup_sources", icon: "CATCHUP", title: t("sa_settings_catchup_timezone_per_playlist"), hidden: c.playlists.length === 0,
    line: tzOverrides === 0 ? t("sa_common_off") : pl("sa_settings_live_preroll_overrides", tzOverrides),
    editor: () => (
      <PerPlaylist<"device" | number> playlists={c.playlists} valueOf={(id) => s.catchupPerPlaylist[id]} label={tzOf}
        options={() => [{ value: undefined, label: t("sa_settings_live_preroll_follow") }, { value: "device" as const, label: t("sa_settings_device") },
          ...OFFSETS.map((m) => ({ value: m, label: utcLabel(m) }))]}
        onPick={(id, v) => { const next = { ...s.catchupPerPlaylist }; if (v === undefined) delete next[id]; else next[id] = v; set({ catchupPerPlaylist: next }); }} />
    ),
  });

  // ---- Внешний вид
  const themeAt = (d: number) => set({ theme: cyc(THEMES.map((x) => x.v), s.theme, d) });
  add({ key: "theme", icon: "THEME", title: t("sa_settings_theme"), line: t(THEMES.find((x) => x.v === s.theme)?.k ?? "sa_settings_theme_system"), ok: () => themeAt(1), step: themeAt });
  const dark = document.documentElement.getAttribute("data-theme") !== "light";
  const accentNow = accentColor(s, dark) ?? ACCENTS.ink[dark ? "dark" : "light"];
  add({
    key: "accent", icon: "PALETTE", title: t("sa_settings_accent"), line: t("sa_settings_line_accent"),
    end: <span class="set-swatch-end"><i class="set-swatch" style={{ background: accentNow }} /><span class="set-hex" style={{ color: accentNow }}>{accentNow.toUpperCase()}</span></span>,
    step: (d) => set({ accent: cyc(ACCENT_ORDER, s.accent, d), accentHex: "" }),
    editor: choice(ACCENT_ORDER.map((a) => ({ value: a, label: t(ACCENT_NAMES[a]) })), s.accentHex ? (null as unknown as Settings["accent"]) : s.accent, (v) => set({ accent: v, accentHex: "" })),
  });
  add({
    key: "focus_highlight", icon: "FOCUS_HIGHLIGHT", title: t("sa_settings_focus_highlight"), line: t("sa_settings_focus_highlight_description"),
    end: <span class="set-swatch-end"><i class="set-swatch sm" style={{ background: s.focusColor || accentNow }} /><span class="set-hex">{t(FOCUS_WIDTHS[s.focusWidth] ?? FOCUS_WIDTHS[1]!)}</span><span class="set-chev">›</span></span>,
    // The colour popup's presets and the four widths (SettingsScreen.kt FocusHighlightPopup). On the TV-box look the
    // colour reaches the ring styles only; Android reads the width nowhere but in the popup's sample.
    editor: () => (
      <SwitchListish items={[
        ...FOCUS_PRESETS.map((f) => ({ label: t(f.key as Key), swatch: f.hex || accentNow, on: s.focusColor.toUpperCase() === f.hex, ok: () => set({ focusColor: f.hex }) })),
        { label: t("sa_settings_focus_thickness"), value: t(FOCUS_WIDTHS[s.focusWidth] ?? FOCUS_WIDTHS[1]!), ok: () => set({ focusWidth: ((s.focusWidth + 1) % 4) as Settings["focusWidth"] }) },
      ]} />
    ),
  });
  add({ key: "tab_GLASS_EFFECT", icon: "SPARKLE", title: t("sa_settings_glass_bg_title"), line: `Stage · ${pct(s.glassOpacity)}` });
  // Text size right in the list (2.7.1): ◀ ▶ on the row, no page to open.
  add({
    key: "font_size", icon: "TEXT_SIZE", title: t("sa_settings_font_size"), line: t("sa_settings_line_fonts"),
    end: <Stepper value={pct(s.fontSize)} onStep={(d) => set({ fontSize: Math.max(60, Math.min(140, s.fontSize + d * 5)) })} />,
    step: (d) => set({ fontSize: Math.max(60, Math.min(140, s.fontSize + d * 5)) }),
    editor: () => <BigStepper value={pct(s.fontSize)} onDone={close} onStep={(d) => set({ fontSize: Math.max(60, Math.min(140, s.fontSize + d * 5)) })} />,
  });
  add({ key: "fonts", icon: "TEXT_SIZE", title: t("sa_settings_title_fonts"), line: `${fontName(s.fontFamily)} · ${pct(s.fontSize)}` });
  add({
    key: "popup_size", icon: "ZOOM", title: t("sa_settings_popup_size"), line: t("sa_settings_line_popup_size"), end: <Stepper value={pct(s.popupSize)} onStep={(d) => set({ popupSize: Math.max(50, Math.min(120, s.popupSize + d * 5)) })} />,
    step: (d) => set({ popupSize: Math.max(50, Math.min(120, s.popupSize + d * 5)) }),
    editor: () => <BigStepper value={pct(s.popupSize)} onDone={close} onStep={(d) => set({ popupSize: Math.max(50, Math.min(120, s.popupSize + d * 5)) })} />,
  });
  // UI zoom: below 85 % Android asks first (settings_low_zoom_warning).
  const zoomTo = (n: number) => {
    const next = clampZoom(n);
    if (next < 85 && clampZoom(s.uiScale) >= 85) {
      c.ask({ title: t("sa_settings_low_zoom_warning_title"), body: tf("sa_settings_low_zoom_warning", next), confirm: t("sa_settings_low_zoom_accept"), onConfirm: () => set({ uiScale: next }) });
      return;
    }
    set({ uiScale: next });
  };
  add({
    key: "ui_zoom", icon: "ZOOM", title: t("sa_settings_ui_zoom"), line: t("sa_settings_ui_zoom_description"),
    end: <Stepper value={pct(clampZoom(s.uiScale))} onStep={(d) => zoomTo(s.uiScale + d * 5)} />, step: (d) => zoomTo(s.uiScale + d * 5),
    editor: () => <BigStepper value={pct(clampZoom(s.uiScale))} onDone={close} onStep={(d) => zoomTo(s.uiScale + d * 5)} />,
  });
  const animOn = s.motion !== "off";
  const motionAuto = s.motion === "auto" || (s.motion === "off" && c.throttled);
  add({ key: "animations", icon: "MOTION", title: t("sa_settings_animations"), line: t("sa_settings_line_animations"), end: sw(animOn),
    ok: () => set({ motion: animOn ? "off" : "auto" }) });
  add({ key: "motion_speed", icon: "MOTION", title: t("sa_settings_motion_speed"), line: t(SPEEDS.find((x) => x.v === s.motionSpeed)?.k ?? "sa_motion_speed_normal"),
    ok: () => set({ motionSpeed: cyc(SPEEDS.map((x) => x.v), s.motionSpeed, 1) }) });
  add({ key: "motion_auto", icon: "MOTION", title: t("sa_settings_motion_auto"), line: t(s.motion === "auto" && c.throttled ? "sa_settings_motion_auto_off_now" : "sa_settings_motion_auto_desc"),
    end: sw(motionAuto), ok: () => set({ motion: s.motion === "auto" ? "on" : "auto" }) });
  add({ key: "tab_WEATHER", icon: "WEATHER", title: t("sa_settings_title_date_time_weather"),
    line: s.weatherOn ? [s.weatherPlace, s.tempUnit === "f" ? "°F" : "°C"].filter(Boolean).join(" · ") : t("sa_common_off") });

  // ---- Вид экрана
  add({ key: "navigation", icon: "MENU", title: t("sa_settings_navigation"),
    line: `${t(s.navStyle === "floating" ? "sa_settings_nav_floating" : "sa_settings_nav_docked")} · ${t(NAV_SIZES[s.navSize] ?? NAV_SIZES[0]!)}`,
    editor: () => (
      <SwitchListish items={[
        { label: t("sa_settings_nav_floating"), on: s.navStyle === "floating", ok: () => set({ navStyle: "floating" }) },
        { label: t("sa_settings_nav_docked"), on: s.navStyle === "docked", ok: () => set({ navStyle: "docked" }) },
        { label: t("sa_settings_size"), value: t(NAV_SIZES[s.navSize] ?? NAV_SIZES[0]!), ok: () => set({ navSize: (s.navSize + 1) % 4 }) },
        { label: t("sa_settings_nav_length"), value: t(s.navLength === 1 ? "sa_settings_nav_length_full" : "sa_settings_nav_length_fit"), ok: () => set({ navLength: s.navLength === 1 ? 0 : 1 }) },
      ]} note={t("sa_web_tvbox_no_effect")} />
    ) });
  const layoutAt = (d: number) => set({ liveLayout: cyc(["stage", "separate"] as const, s.liveLayout, d) });
  add({ key: "live_layout", icon: "LIVE_TV", title: t("sa_settings_live_layout"), line: t(s.liveLayout === "stage" ? "sa_settings_live_layout_stage" : "sa_settings_seg_separate"), ok: () => layoutAt(1), step: layoutAt });
  const opensAt = (d: number) => set({ liveOpensIn: cyc(["list", "guide"] as const, s.liveOpensIn, d) });
  add({ key: "live_opens_in", icon: "LIVE_TV", title: t("sa_settings_live_opens_in"), line: t(s.liveOpensIn === "list" ? "sa_settings_view_list" : "sa_settings_seg_guide"), ok: () => opensAt(1), step: opensAt });
  add({ key: "tab_CH_NAV", icon: "CH_NAV", title: t("sa_settings_ch_paging"), line: onOffText(s.chNav) });
  add({ key: "tab_PANEL_WIDTH", icon: "PANEL_WIDTH", title: t("sa_settings_panel_width"), line: t("sa_settings_subtitle_default") });
  add({ key: "tab_GUIDE_WIDTH", icon: "EPG", title: t("sa_settings_guide_width"), line: t("sa_settings_subtitle_default") });
  add({ key: "browsing_lists", icon: "LIST_GRID", title: t("sa_settings_browsing_lists"), line: t("sa_settings_line_browsing") });
  add({ key: "tab_CONTENT_MENUS", icon: "MENU", title: t("sa_settings_content_menus_title"), line: t("sa_settings_line_content_menus") });

  // ---- Категории
  add({ key: "tab_CUSTOMIZE", icon: "SORT", title: t("sa_settings_customize"), line: t("sa_settings_line_customize") });

  // ---- Настройки плеера
  const extParts = [s.extLive && t("sa_common_nav_live_tv"), s.extMovies && t("sa_common_nav_movies"), s.extSeries && t("sa_common_nav_series")].filter(Boolean) as string[];
  const setExtLive = (on: boolean) => set({ extLive: on, externalPlayer: on && c.players[0] ? (c.players[0] as Settings["externalPlayer"]) : "off" });
  add({
    key: "vp_external", icon: "PLAY", title: t("sa_settings_external_player"),
    line: extParts.length === 0 ? t("sa_common_off") : extParts.length === 3 ? t("sa_common_on") : extParts.join(", "),
    editor: () => <SwitchList items={[
      { label: t("sa_common_nav_live_tv"), on: s.extLive, toggle: () => setExtLive(!s.extLive) },
      { label: t("sa_common_nav_movies"), on: s.extMovies, toggle: () => set({ extMovies: !s.extMovies }) },
      { label: t("sa_common_nav_series"), on: s.extSeries, toggle: () => set({ extSeries: !s.extSeries }) },
    ]} />,
  });
  add({ key: "vp_tiles", icon: "GRID", title: t("setChannelTiles"), line: t("setChannelTilesHint"), end: sw(s.channelTiles), ok: () => set({ channelTiles: !s.channelTiles }) });
  add({ key: "vp_columns", icon: "LIST_GRID", title: t("sa_settings_player_panel_columns"), line: t("sa_settings_player_panel_columns_description"), end: sw(s.threeColumns), ok: () => set({ threeColumns: !s.threeColumns }) });
  add({ key: "vp_recents", icon: "HISTORY", title: t("sa_settings_player_recents"), line: t("sa_settings_player_recents_description"), end: sw(s.playerRecents), ok: () => set({ playerRecents: !s.playerRecents }) });
  add({ key: "vp_clock", icon: "CLOCK", title: t("sa_settings_player_clock"), line: t("sa_settings_player_clock_description"), end: sw(s.playerClock), ok: () => set({ playerClock: !s.playerClock }) });
  const look = (key: string, icon: string, title: Key, opts: Key[] | string[], field: "clockSize" | "clockWeight" | "clockBg" | "clockColor" | "clockAlpha", hidden = false) => {
    const labels = (opts as string[]).map((o) => (o.startsWith("sa_") ? t(o as Key) : o));
    const at = (d: number) => set({ [field]: (s[field] + d + labels.length) % labels.length } as Partial<Settings>);
    add({ key, icon, title: t(title), line: labels[s[field]] ?? labels[0], ok: () => at(1), step: at, hidden: !s.playerClock || hidden, pin: false });
  };
  look("clock_size", "ZOOM", "sa_settings_clock_size", ["sa_settings_clock_size_s", "sa_settings_clock_size_m", "sa_settings_clock_size_l"], "clockSize");
  look("clock_weight", "THEME", "sa_settings_clock_weight", ["sa_settings_clock_weight_regular", "sa_settings_clock_weight_bold"], "clockWeight");
  look("clock_bg", "PALETTE", "sa_settings_clock_bg", ["sa_settings_clock_bg_none", "sa_settings_clock_bg_dark", "sa_settings_clock_bg_light", "sa_settings_clock_bg_blue"], "clockBg");
  look("clock_color", "PALETTE", "sa_settings_clock_color", ["sa_settings_clock_color_white", "sa_settings_clock_color_yellow", "sa_settings_clock_color_blue"], "clockColor");
  look("clock_alpha", "THEME", "sa_settings_clock_transparency", [0, 25, 50, 75].map(pct), "clockAlpha", s.clockBg === 0);

  // ---- Качество картинки
  const pickZoom = (v: Settings["zoomMode"]) => set({ zoomMode: v, aspect: v === "crop" ? "cover" : v === "stretch" ? "fill" : "fit" });
  add({ key: "vp_zoom", icon: "ASPECT", title: t("sa_settings_default_zoom"), line: t(ZOOMS.find((z) => z.v === s.zoomMode)?.k ?? "sa_player_zoom_fit_screen"),
    editor: choice(ZOOMS.map((z) => ({ value: z.v, label: t(z.k), recommended: z.v === "fit" })), s.zoomMode, pickZoom) });
  add({
    key: "vp_reset_zoom", icon: "ASPECT", title: t("sa_settings_title_saved_zoom"), line: t("sa_settings_reset_player_choices_none"),
    ok: () => c.ask({ title: t("sa_settings_reset_saved_zoom_confirm"), body: t("sa_settings_reset_saved_zoom_confirm_description"), confirm: t("sa_common_reset"), onConfirm: () => undefined }),
  });
  add({ key: "vp_afr", icon: "VIDEO", title: t("sa_settings_auto_frame_rate"), line: t("sa_settings_vp_cat_frame_rate_summary"), end: sw(s.afr), ok: () => set({ afr: !s.afr }) });
  add({ key: "vp_afr_pause", icon: "PAUSE", title: t("sa_settings_afr_pause"), line: s.afrPause === 0 ? t("sa_common_off") : secs(s.afrPause),
    editor: choice([0, 1, 2, 3, 4, 5].map((n) => ({ value: n, label: n === 0 ? t("sa_common_off") : secs(n) })), s.afrPause, (v) => set({ afrPause: v })) });
  add({ key: "vp_afr_resolution", icon: "ASPECT", title: t("sa_settings_afr_resolution"), line: t("sa_settings_line_films_only"), end: sw(s.afrResolution), ok: () => set({ afrResolution: !s.afrResolution }) });

  // ---- Эфир и буфер
  const setLatency = (v: Settings["liveLatency"], custom = s.liveCustomSec) => set({ liveLatency: v, liveCustomSec: custom, buffer: bufferFor(v, custom) });
  const latencyOptions = (follow: boolean): Array<Choice<string | undefined>> => [
    ...(follow ? [{ value: undefined, label: t("sa_settings_live_preroll_follow") }] : []),
    { value: "low", label: t("sa_settings_live_latency_low") }, { value: "balanced", label: t("sa_settings_live_latency_balanced"), recommended: true },
    { value: "stable", label: t("sa_settings_live_latency_stable") }, { value: "custom", label: t("sa_settings_live_latency_custom") },
  ];
  const lowWarning = (yes: () => void, no?: () => void) => c.ask({
    title: t("sa_settings_low_latency_warning"), body: t("sa_settings_low_latency_warning_description"), confirm: t("sa_settings_low_latency_understand"), onConfirm: yes, onCancel: no,
  });
  add({
    key: "vp_live_latency", icon: "LIVE_TV", title: t("sa_settings_live_latency"), line: latencyLabel(s.liveLatency, s.liveCustomSec),
    editor: () => <LatencyEditor s={s} options={latencyOptions(false)} close={close} setLatency={setLatency} lowWarning={lowWarning} />,
  });
  const latOverrides = Object.keys(s.latencyPerPlaylist).filter((id) => c.playlists.some((p) => p.id === id)).length;
  add({
    key: "vp_latency_sources", icon: "LIVE_TV", title: t("sa_settings_live_latency_per_playlist"), hidden: c.playlists.length === 0,
    line: latOverrides === 0 ? t("sa_common_off") : pl("sa_settings_live_preroll_overrides", latOverrides),
    editor: () => (
      <PerPlaylist<string> playlists={c.playlists} valueOf={(id) => s.latencyPerPlaylist[id]}
        label={(v) => (v === undefined ? t("sa_settings_live_preroll_follow") : latencyLabel(v, s.liveCustomSec))} options={() => latencyOptions(true)}
        onPick={(id, v) => { const next = { ...s.latencyPerPlaylist }; if (v === undefined) delete next[id]; else next[id] = v; set({ latencyPerPlaylist: next }); }} />
    ),
  });
  const timeouts = (follow: boolean): Array<Choice<number | undefined>> => [
    ...(follow ? [{ value: undefined, label: t("sa_settings_live_preroll_follow") }] : []),
    ...[15, 30, 60, 0].map((n) => ({ value: n as number | undefined, label: timeoutLabel(n), recommended: n === 30 })),
  ];
  add({ key: "vp_tune_timeout", icon: "LIVE_TV", title: t("sa_settings_live_tune_timeout"), line: timeoutLabel(s.tuneTimeout),
    editor: choice(timeouts(false), s.tuneTimeout as number | undefined, (v) => set({ tuneTimeout: v ?? 30 })) });
  const toOverrides = Object.keys(s.tuneTimeoutPerPlaylist).filter((id) => c.playlists.some((p) => p.id === id)).length;
  add({
    key: "vp_tune_timeout_sources", icon: "LIVE_TV", title: t("sa_settings_live_tune_timeout_per_playlist"), hidden: c.playlists.length === 0,
    line: toOverrides === 0 ? t("sa_common_off") : pl("sa_settings_live_preroll_overrides", toOverrides),
    editor: () => (
      <PerPlaylist<number> playlists={c.playlists} valueOf={(id) => s.tuneTimeoutPerPlaylist[id]}
        label={(v) => (v === undefined ? t("sa_settings_live_preroll_follow") : timeoutLabel(v))} options={() => timeouts(true)}
        onPick={(id, v) => { const next = { ...s.tuneTimeoutPerPlaylist }; if (v === undefined) delete next[id]; else next[id] = v; set({ tuneTimeoutPerPlaylist: next }); }} />
    ),
  });
  add({ key: "vp_vod_buffer", icon: "DOWNLOADS", title: t("sa_settings_vod_buffer"), line: vodBufferLabel(s.vodBuffer),
    editor: choice([0, 10, 20, 30, 60, 120, 300].map((n) => ({ value: n, label: vodBufferLabel(n), recommended: n === 0 })), s.vodBuffer, (v) => set({ vodBuffer: v })) });
  add({ key: "vp_channel_numbers", icon: "LIVE_TV", title: t("sa_settings_channel_numbers"), line: t("sa_settings_line_channel_numbers"), end: sw(s.showNumbers), ok: () => set({ showNumbers: !s.showNumbers }) });
  add({ key: "vp_live_preview", icon: "LIVE_TV", title: t("sa_settings_quick_live_preview"), line: t("sa_settings_line_live_preview"), end: sw(s.preview), ok: () => preview(!s.preview) });
  add({ key: "vp_preview_audio", icon: "AUDIO", title: t("sa_settings_preview_audio"), line: t("sa_settings_line_preview_sound"), end: sw(s.previewAudio), ok: () => set({ previewAudio: !s.previewAudio }), hidden: !s.preview });
  // screens 2.5.4 (Android VideoPlayerSettingsScreen vp_programme_posters): a film's poster from TMDB in the logo's place.
  add({ key: "vp_programme_posters", icon: "IMAGE", title: t("sa_settings_programme_posters"), line: t("sa_settings_programme_posters_description"),
    end: sw(s.programmePosters), ok: () => set({ programmePosters: !s.programmePosters }) });
  // 2.5.8 (Android vp_info_hide): how long the channel info stays up; the same setting as the player panel's.
  add({ key: "vp_info_hide", icon: "CLOCK", title: t("sa_settings_info_hide"), line: t("seconds", { n: s.osdSeconds }),
    editor: choice(([3, 5, 8, 15, 30] as const).map((n) => ({ value: n, label: t("seconds", { n }), recommended: n === 5 })), s.osdSeconds, (v) => set({ osdSeconds: v })) });

  // ---- Мультиэкран
  const tiles = (n: number) => {
    if (n > 2 && !s.multiviewWarned) {
      c.ask({ title: t("sa_settings_multiview_warning_title"), body: t("sa_settings_multiview_warning_description"), confirm: t("sa_settings_multiview_use_anyway"),
        cancel: t("sa_settings_multiview_keep_two"), onConfirm: () => set({ multiviewTiles: n, multiviewWarned: true }), onCancel: () => set({ multiviewTiles: 2 }) });
      return;
    }
    set({ multiviewTiles: n });
  };
  add({ key: "vp_multiview", icon: "LIST_GRID", title: t("sa_settings_multiview"), line: t("sa_settings_vp_cat_multiview_summary_mobile"), end: sw(s.multiview), ok: () => set({ multiview: !s.multiview }) });
  add({ key: "vp_multiview_tiles", icon: "LIST_GRID", title: t("sa_settings_multiview_tiles_max"), line: tf("sa_settings_multiview_tiles_max_value", Math.max(2, s.multiviewTiles)), hidden: !s.multiview,
    editor: choice([2, 3, 4].map((n) => ({ value: n, label: tf("sa_settings_multiview_tiles_max_value", n) })), Math.max(2, s.multiviewTiles), (v) => tiles(v)) });
  // Mini player: only where one exists (the browser's picture-in-picture; a Samsung or LG TV has none, so the row is not shown).
  const miniHere = typeof document !== "undefined" && (document as unknown as { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled === true;
  add({ key: "vp_mini", icon: "PIP", title: t("sa_settings_mini_player_root"), line: t("sa_settings_line_mini"), hidden: !miniHere, editor: () => <MiniEditor s={s} set={set} close={close} /> });

  // ---- Запись (screens 2.5.4, RecordingSettingsScreen.kt): Android's rows and words; no value is shown, as none applies here.
  add({ key: "rec_reserve", icon: "LIVE_TV", title: t("sa_settings_recording_reserve"), line: t("sa_settings_recording_reserve_description"), pin: false });
  add({ key: "rec_watching", icon: "PLAY", title: t("sa_settings_record_watching"), line: t("sa_settings_record_watching_description"), pin: false });
  add({ key: "rec_pre_roll", icon: "HISTORY", title: t("sa_settings_recording_pre_roll"), line: t("sa_settings_recording_pre_roll_description"), pin: false });
  add({ key: "rec_post_roll", icon: "HISTORY", title: t("sa_settings_recording_post_roll"), line: t("sa_settings_recording_post_roll_description"), pin: false });

  // ---- Общие настройки
  add({ key: "tab_SPORTS", icon: "SPORTS", title: t("sa_sports_title"), line: t("sa_sports_leagues") });
  const lang = s.language === "auto" ? t("sa_settings_language_system_default") : LANGUAGES.find((l) => l.code === s.language)?.name ?? s.language;
  add({ key: "tab_LANGUAGE", icon: "LANGUAGE", title: t("sa_settings_language"), line: lang });
  add({ key: "app_startup", icon: "POWER", title: t("sa_settings_app_startup"),
    line: s.startup === "channel" && s.startupChannelName ? s.startupChannelName : t(STARTUPS.find((x) => x.v === s.startup)?.k ?? "sa_settings_startup_home"),
    editor: () => <StartupEditor s={s} set={set} channels={c.channels} close={close} /> });
  add({ key: "check_updates", icon: "REFRESH", title: t("sa_settings_check_updates"), line: t("sa_settings_check_now"), ok: c.openUpdate });
  add({ key: "update_startup", icon: "REFRESH", title: t("sa_settings_update_startup"), line: t("sa_settings_line_when_app_opens"), end: sw(s.updateOnStart), ok: () => set({ updateOnStart: !s.updateOnStart }) });
  add({ key: "update_auto", icon: "REFRESH", title: t("sa_settings_update_auto"), line: t("sa_settings_update_auto_desc"), end: sw(s.autoUpdate), ok: () => set({ autoUpdate: !s.autoUpdate }) });
  add({ key: "update_every", icon: "CLOCK", title: t("sa_settings_update_every"), line: t(EVERY.find((x) => x.v === s.updateEvery)?.k ?? "sa_update_every_6h"),
    ok: () => set({ updateEvery: cyc(EVERY.map((x) => x.v), s.updateEvery, 1) }) });
  add({ key: "update_window", icon: "CLOCK", title: t("sa_settings_update_window"), line: t(s.updateWindow === "night" ? "sa_update_window_night" : "sa_update_window_any"),
    ok: () => set({ updateWindow: s.updateWindow === "night" ? "any" : "night" }) });
  add({ key: "tab_TG_REMOTE", icon: "SEND", title: t("sa_settings_tg_remote"), line: t("sa_settings_tg_remote_description") });
  add({ key: "tab_NETWORK", icon: "NETWORK", title: t("sa_common_proxy"), line: s.proxyOn && s.proxy ? hostOf(s.proxy) : t("sa_common_off") });
  add({ key: "tab_DNS", icon: "DNS", title: t("sa_settings_dns"), line: s.dnsOn ? (s.dnsServer ? hostOf(s.dnsServer) : t("sa_common_on")) : t("sa_common_off") });
  add({ key: "vp_logging", icon: "CODE", title: t("sa_settings_detailed_playback_logging"), line: t("sa_settings_line_logging"), end: sw(s.playbackLog), ok: () => set({ playbackLog: !s.playbackLog }) });

  const out: Record<string, RowDef> = {};
  for (const r of list) out[r.key] = r;
  return out;
}

function hostOf(url: string): string {
  try { return new URL(url).host || url; } catch { return url; }
}

/** The font names Android shows (donottranslate: not translated). */
export const FONTS: Array<[string, string]> = [
  ["LORA", "Lora"], ["SYSTEM_SANS", "System"], ["MONOSPACE", "Monospace"], ["PLAYFAIR_DISPLAY", "Playfair Display"],
  ["DANCING_SCRIPT", "Dancing Script"], ["POPPINS", "Poppins"], ["PLUS_JAKARTA_SANS", "Plus Jakarta Sans"],
];
export const fontName = (id: string) => FONTS.find((f) => f[0] === id)?.[1] ?? "Plus Jakarta Sans";

/** Live delay: the four choices; Low asks first; Custom opens a 1–60 s stepper (below 8 s it warns when it closes). */
function LatencyEditor(p: {
  s: Settings; options: Array<Choice<string | undefined>>; close: () => void;
  setLatency: (v: Settings["liveLatency"], custom?: number) => void; lowWarning: (yes: () => void, no?: () => void) => void;
}) {
  const [custom, setCustom] = useState<number | null>(null);
  if (custom !== null) {
    const done = () => {
      p.setLatency("custom", custom);
      if (custom < 8) p.lowWarning(() => p.close(), () => { p.setLatency("balanced"); p.close(); });
      else p.close();
    };
    return (
      <>
        <div class="set-editor-sub">{t("sa_settings_custom_live_buffer")}</div>
        <BigStepper value={tf("sa_settings_live_buffer_seconds", custom)} onDone={done} onStep={(d) => setCustom(Math.max(1, Math.min(60, custom + d)))} />
      </>
    );
  }
  return (
    <ChoiceList value={p.s.liveLatency as string | undefined} options={p.options} onClose={p.close}
      onPick={(v) => {
        if (v === "low") { p.close(); p.lowWarning(() => p.setLatency("low")); return; }
        if (v === "custom") { setCustom(p.s.liveCustomSec || 8); return; }
        p.setLatency(v as Settings["liveLatency"]); p.close();
      }} />
  );
}

/** Mini player (MiniPlayerSettingsDialog.kt): the size 10–50 % and where it sits, as the screen is laid out. */
function MiniEditor(p: { s: Settings; set: (x: Partial<Settings>) => void; close: () => void }) {
  const pos: Array<[string, Key]> = [
    ["tl", "sa_player_mini_top_left"], ["tc", "sa_player_mini_top_center"], ["tr", "sa_player_mini_top_right"],
    ["bl", "sa_player_mini_bottom_left"], ["bc", "sa_player_mini_bottom_center"], ["br", "sa_player_mini_bottom_right"],
  ];
  return (
    <div class="set-mini">
      <div class="set-label">{t("sa_settings_size").toUpperCase()}</div>
      <BigStepper value={pct(p.s.miniSize)} onDone={p.close} onStep={(d) => p.set({ miniSize: Math.max(10, Math.min(50, p.s.miniSize + d * 5)) })} />
      <div class="set-label">{t("sa_settings_position").toUpperCase()}</div>
      <div class="set-pills">
        {pos.map(([v, k]) => (
          <button key={v} class={`st-focusable set-pill${p.s.miniPos === v ? " on" : ""}`} data-focus={`set-mini-${v}`} onClick={() => p.set({ miniPos: v })}>{t(k)}</button>
        ))}
      </div>
    </div>
  );
}

/** A popup-like list in the sheet whose lines are radios or values that change on OK (the Navigation popup's rows). */
function SwitchListish(p: { items: Array<{ label: string; on?: boolean; value?: string; swatch?: string; ok: () => void }>; note?: string }) {
  useEffect(() => { setTimeout(() => focusFirst(document, "set-nav-0"), 0); }, []);
  return (
    <div class="set-choices">
      {p.items.map((it, i) => (
        <button key={i} class={`st-focusable set-choice${it.on ? " on" : ""}`} data-focus={`set-nav-${i}`} onClick={it.ok}>
          {it.swatch ? <i class="set-swatch sm set-choice-swatch" style={{ background: it.swatch }} /> : null}
          <span class="set-choice-body"><span class="set-choice-label">{it.label}</span></span>
          {it.value !== undefined ? <span class="set-choice-value">{it.value}</span> : <span class="set-tick">{it.on ? <TickIcon /> : null}</span>}
        </button>
      ))}
      {p.note ? <div class="set-editor-note">{p.note}</div> : null}
    </div>
  );
}

/** Android caps the startup channel picker at 300 rows (SettingsViewModel.kt startupChannelResults). */
const PICK_MAX = 300;

/**
 * Запуск приложения (StartupDialogHost + StartupChannelPickerDialog): the four choices; «Выбранный канал» then lists
 * the playlist's channels (number and name, searchable, at most 300), the chosen one ticked.
 */
function StartupEditor(p: { s: Settings; set: (x: Partial<Settings>) => void; channels: readonly Channel[]; close: () => void }) {
  const [picking, setPicking] = useState(false);
  if (picking) return <StartupChannels {...p} back={() => setPicking(false)} />;
  return (
    <ChoiceList key="mode" idPrefix="su" value={p.s.startup} options={STARTUPS.map((x) => ({ value: x.v, label: t(x.k) }))} onClose={p.close}
      onPick={(v) => { if (v === "channel") { setPicking(true); return; } p.set({ startup: v }); p.close(); }} />
  );
}

/** «Выбранный канал»: the playlist's channels by number and name, searchable, at most 300 (StartupChannelPickerDialog). */
function StartupChannels(p: { s: Settings; set: (x: Partial<Settings>) => void; channels: readonly Channel[]; close: () => void; back: () => void }) {
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState(false);
  const sheet = useSheet();
  const q = query.trim();
  // The same name search as the channel list (layout and look-alike letters do not matter), numbered as in the list.
  const index = useMemo(() => new SearchIndex(p.channels, (c) => c.name), [p.channels]);
  const numbers = useMemo(() => new Map(p.channels.map((c, i) => [c.id, i + 1])), [p.channels]);
  const found = useMemo(() => (q === "" ? p.channels.slice(0, PICK_MAX) : index.search(q).map((r) => r.item).slice(0, PICK_MAX))
    .map((c) => ({ c, n: numbers.get(c.id) ?? 0 })), [q, index, numbers]);
  const chosen = p.s.startup === "channel" ? p.s.startupChannel : "";
  return (
    <>
      <div class="set-choices">
        <button class="st-focusable set-choice" data-focus="set-su-search" onClick={() => setTyping(true)}>
          <span class="set-choice-body"><span class="set-choice-label">{query || t("sa_common_search_hint")}</span></span>
        </button>
      </div>
      {found.length === 0 ? <div class="set-editor-note">{q ? tf("sa_content_no_channels_found", query.trim()) : t("sa_content_no_channels_here")}</div> : (
        <ChoiceList key={`pick-${q}`} idPrefix="suc" value={chosen} onClose={p.back}
          options={found.map((x) => ({ value: channelKey(x.c), label: `${x.n}  ${x.c.name}` }))}
          onPick={(key) => {
            const c = p.channels.find((x) => channelKey(x) === key);
            p.set({ startup: "channel", startupChannel: key, startupChannelName: c?.name ?? "" });
            p.close();
          }} />
      )}
      <Presence show={typing}>
        {(out) => (
          <TextEntry title={t("sa_settings_startup_specific_channel")} hint={t("sa_common_search_hint")} value={query} closing={out}
            onCancel={() => { setTyping(false); setTimeout(() => sheet.focus("set-su-search"), 0); }}
            onDone={(v) => { setQuery(v); setTyping(false); setTimeout(() => sheet.focus("set-su-search"), 0); }} />
        )}
      </Presence>
    </>
  );
}

function TickIcon() {
  return <svg viewBox="0 0 256 256" width={24} height={24} fill="currentColor" aria-hidden="true"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" /></svg>;
}

/** Which rows each group page lists, under which headings (SettingsScreen.kt partDefs, VideoPlayerSettingsScreen.kt parts). */
export const GROUP_ITEMS: Record<string, Item[]> = {
  sources: [{ h: "sa_settings_sources_title", first: true }, "tab_SOURCES", "tab_EPG",
    { h: "sa_settings_part_guide_catchup" }, "epg_offset", "reminders", "reminder_lead", "guide_days", "catchup", "catchup_sources"],
  appearance: [{ h: "sa_settings_part_theme", first: true }, "theme", "accent", "focus_highlight", "tab_GLASS_EFFECT",
    { h: "sa_settings_part_text" }, "fonts", "popup_size", "ui_zoom",
    { h: "sa_settings_part_extras" }, "animations", "motion_speed", "motion_auto", "tab_WEATHER"],
  layout: [{ h: "sa_settings_part_navigation", first: true }, "navigation", "live_layout", "live_opens_in", "tab_CH_NAV",
    { h: "sa_settings_part_lists" }, "tab_PANEL_WIDTH", "tab_GUIDE_WIDTH", "browsing_lists", "tab_CONTENT_MENUS"],
  content: ["tab_CUSTOMIZE"],
  player: [{ h: "sa_settings_vp_cat_player", first: true }, "vp_external", { h: "sa_settings_vp_cat_controls" }, "vp_tiles", "vp_columns", "vp_recents", "vp_clock",
    "clock_size", "clock_weight", "clock_bg", "clock_color", "clock_alpha"],
  picture: [{ h: "sa_settings_vp_cat_picture", first: true }, "vp_zoom", "vp_reset_zoom", { h: "sa_settings_vp_cat_frame_rate" }, "vp_afr", "vp_afr_pause", "vp_afr_resolution"],
  live: [{ h: "sa_settings_vp_cat_live_tuning", first: true }, "vp_live_latency", "vp_latency_sources", "vp_tune_timeout", "vp_tune_timeout_sources",
    { h: "sa_settings_vp_cat_streaming" }, "vp_vod_buffer", { h: "sa_settings_live_tv" }, "vp_channel_numbers", "vp_live_preview", "vp_preview_audio", "vp_programme_posters", "vp_info_hide"],
  // The Resume part has no rows left, so its heading is gone and this one is drawn as a second heading (26 above).
  watching: [{ h: "sa_settings_vp_cat_multiview" }, "vp_multiview", "vp_multiview_tiles", "vp_mini",
    // screens 2.5.4 (Android a8ce6c4 RecordingSettingsRows): the recording rows after the watching ones. A TV browser cannot
    // record a stream, so each opens the page that says it is only in the Android TV app.
    { h: "sa_recording_settings_group" }, "rec_reserve", "rec_watching", "rec_pre_roll", "rec_post_roll"],
  app: [{ h: "sa_settings_app_group", first: true }, "tab_SPORTS", "tab_LANGUAGE", "app_startup", "check_updates", "update_startup", "update_auto",
    "update_every", "update_window", "tab_TG_REMOTE", { h: "sa_settings_group_network" }, "tab_NETWORK", "tab_DNS", "vp_logging"],
};

/** The group a row lives in (for "Закреплено из раздела …" on a pinned player row). */
export function homeGroup(key: string): string | null {
  for (const [g, items] of Object.entries(GROUP_ITEMS)) if (items.includes(key)) return g;
  return null;
}
