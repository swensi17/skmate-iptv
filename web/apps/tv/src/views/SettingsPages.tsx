import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { Presence, Stepper, Toggle } from "@skmate/ui";
import { t, type Key } from "../i18n";
import { LANGUAGES } from "../i18n/languages";
import type { Settings } from "../state/settings";
import { FONTS, fontName } from "./SettingsRows";
import { BigStepper, ChoiceList, InfoCard, SHeading, SIcon, SNote, SRow, tf, useSheet, useSheetBack, EditorLayer, type RowProps } from "./SettingsKit";
import { TextEntry } from "./TextEntry";

/*
 * The sub-pages a group's row opens in the same sheet (Back returns to the row): Стекло и фон, Шрифты, Дата/время/погода,
 * Кнопки пульта, the width pages, Просмотр и списки, Меню долгого нажатия, Язык, Прокси, DNS; and the pages of the
 * list's lower block that are only text (Как пользоваться) or need a server (Синхронизация ТВ, Пульт Telegram).
 */

type Line = RowProps | { h: Key; first?: boolean } | { note: string; body?: string };

/** A page of rows under headings. */
export function Lines({ items }: { items: Line[] }) {
  return (
    <>
      {items.map((it, i) => ("h" in it ? <SHeading key={`h${i}`} text={t(it.h)} first={it.first} />
        : "note" in it ? <SNote key={`n${i}`} title={it.note} body={it.body} />
          : <SRow key={it.id} {...it} />))}
    </>
  );
}

interface P { s: Settings; set: (x: Partial<Settings>) => void }

const pct = (n: number) => tf("sa_common_percent", n);
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

/** Стекло и фон (GlassEffectPage.kt). Stored: the TV-box look draws flat panels, on Android as here. */
export function GlassPage({ s, set }: P) {
  const bg: Key[] = ["sa_settings_bg_stage", "sa_settings_bg_picture", "sa_settings_bg_plain"];
  const looks: Key[] = ["sa_settings_bg_sharp", "sa_settings_bg_soft", "sa_settings_bg_dark"];
  const picture = s.bgMode === 1;
  return (
    <Lines items={[
      { h: "sa_settings_bg_background", first: true },
      { id: "g-bg", icon: "PALETTE", title: t("sa_settings_bg_background"), line: t(bg[s.bgMode] ?? bg[0]!), onOk: () => set({ bgMode: (s.bgMode + 1) % 3 }), onStep: (d) => set({ bgMode: clamp(s.bgMode + d, 0, 2) }) },
      { id: "g-pic", icon: "FOLDER", title: t("sa_settings_bg_picture"), line: t("sa_settings_bg_none"), disabled: true },
      { id: "g-look", icon: "SPARKLE", title: t("sa_settings_bg_look"), line: picture ? t(looks[s.bgLook] ?? looks[0]!) : t("sa_settings_bg_picture_only"), disabled: !picture,
        onOk: () => set({ bgLook: (s.bgLook + 1) % 3 }), onStep: (d) => set({ bgLook: clamp(s.bgLook + d, 0, 2) }) },
      { id: "g-dim", icon: "LAYERS", title: t("sa_settings_bg_darken"), line: t("sa_settings_line_bg_darken"), end: <Stepper value={pct(s.bgDim)} />, onStep: (d) => set({ bgDim: clamp(s.bgDim + d * 5, 0, 90) }) },
      { id: "g-blur", icon: "LAYERS", title: t("sa_settings_bg_blur"), line: t("sa_settings_line_bg_blur"), end: <Stepper value={pct(s.bgBlur)} />, onStep: (d) => set({ bgBlur: clamp(s.bgBlur + d * 10, 0, 100) }) },
      { id: "g-glow", icon: "SUN", title: t("sa_settings_bg_accent_light"), line: t("sa_settings_line_bg_accent_light"), end: <Toggle on={s.bgGlow} />, onOk: () => set({ bgGlow: !s.bgGlow }) },
      { h: "sa_settings_glass_section" },
      { id: "g-glass", icon: "LAYERS", title: t("sa_settings_glass_section"), line: t("sa_settings_line_glass_switch"), end: <Toggle on={s.glassOn} />, onOk: () => set({ glassOn: !s.glassOn }) },
      { id: "g-opacity", icon: "LAYERS", title: t("sa_settings_glass_opacity"), line: t("sa_settings_line_glass_opacity"), end: <Stepper value={s.glassOn ? pct(s.glassOpacity) : "—"} />,
        onStep: (d) => { if (s.glassOn) set({ glassOpacity: clamp(s.glassOpacity + d * 5, 20, 100) }); }, disabled: !s.glassOn },
      { id: "g-reset", icon: "REFRESH", title: t("sa_common_reset"), line: tf("sa_settings_line_glass_reset", pct(50)),
        onOk: () => set({ bgMode: 0, bgLook: 0, bgDim: 40, bgBlur: 40, bgGlow: true, glassOn: true, glassOpacity: 50 }) },
      // The TV-box look draws flat panels: Android's own TV-box shell ignores these too (OwnTVShell.kt:1070-1075, 1296).
      { note: t("sa_web_tvbox_no_effect") },
    ]} />
  );
}

/** Шрифты и размер текста (FontSettingsScreen.kt): applied by state/look.ts (every text, popups their own size). */
export function FontsPage({ s, set }: P) {
  const sheet = useSheet();
  const [choosing, setChoosing] = useState(false);
  const done = () => { setChoosing(false); setTimeout(() => sheet.focus("f-font"), 0); };
  useSheetBack(choosing, done);
  const editor = choosing ? (
      <EditorLayer title={t("sa_settings_choose_font")}>
        <ChoiceList idPrefix="font" value={s.fontFamily} options={FONTS.map(([v, l]) => ({ value: v, label: l }))}
          onPick={(v) => { set({ fontFamily: v }); done(); }} onClose={done} />
      </EditorLayer>
  ) : null;
  return (
    <>{editor}<Lines items={[
      { id: "f-font", icon: "TEXT_SIZE", title: t("sa_settings_main_interface_font"), line: fontName(s.fontFamily), onOk: () => setChoosing(true) },
      { id: "f-size", icon: "TEXT_SIZE", title: t("sa_settings_font_size"), line: t("sa_settings_line_fonts"), end: <Stepper value={pct(s.fontSize)} />, onStep: (d) => set({ fontSize: clamp(s.fontSize + d * 5, 60, 140) }) },
      { id: "f-popup", icon: "TEXT_SIZE", title: t("sa_settings_popup_font_size"), line: t("sa_settings_popup_font_size_description"), end: <Stepper value={pct(s.popupFontSize)} />,
        onStep: (d) => set({ popupFontSize: clamp(s.popupFontSize + d * 5, 50, 120) }) },
      { id: "f-reset", icon: "REFRESH", title: t("sa_common_reset"), onOk: () => set({ fontFamily: "PLUS_JAKARTA_SANS", fontSize: 100 }) },
    ]} /></>
  );
}

/** The clock colour presets (WeatherSettingsScreen.kt:171-178): white = the text colour, grey = muted, the accent, the six accents. */
const CLOCK_COLORS: Array<{ v: string; k: Key; css: string }> = [
  { v: "text", k: "sa_settings_clock_color_white", css: "var(--st-text)" },
  { v: "muted", k: "sa_settings_clock_color_grey", css: "var(--st-muted)" },
  { v: "accent", k: "sa_settings_accent", css: "var(--st-accent)" },
  { v: "#52DBC8", k: "sa_settings_accent_teal", css: "#52DBC8" }, { v: "#6FB0FF", k: "sa_settings_accent_blue", css: "#6FB0FF" },
  { v: "#CBBEFF", k: "sa_settings_accent_violet", css: "#CBBEFF" }, { v: "#6FDB94", k: "sa_settings_accent_green", css: "#6FDB94" },
  { v: "#FFB95C", k: "sa_settings_accent_amber", css: "#FFB95C" }, { v: "#F2F0ED", k: "sa_settings_accent_ink", css: "#F2F0ED" },
];
type ClockField = "clockTimeColor" | "clockDateColor" | "clockWeatherColor";

/** Дата, время и погода (WeatherSettingsScreen.kt): drives the clock at the top right (HomeStatus). */
export function WeatherPage({ s, set }: P) {
  const [typing, setTyping] = useState(false);
  const [coloring, setColoring] = useState<ClockField | null>(null);
  const sheet = useSheet();
  const units = (d: number) => set({ tempUnit: d > 0 ? "f" : "c" });
  // "" = as designed: the time in the text colour, the date and the weather muted.
  const colorOf = (f: ClockField) => CLOCK_COLORS.find((c) => c.v === (s[f] || (f === "clockTimeColor" ? "text" : "muted"))) ?? CLOCK_COLORS[0]!;
  const rowOf: Record<ClockField, string> = { clockTimeColor: "w-time", clockDateColor: "w-date", clockWeatherColor: "w-weather" };
  const done = () => { const f = coloring; setColoring(null); if (f) setTimeout(() => sheet.focus(rowOf[f]), 0); };
  useSheetBack(coloring !== null, done);
  const end = (f: ClockField) => { const c = colorOf(f); return <ColorEnd label={t(c.k)} css={c.css} />; };
  const editor = coloring ? (
    <EditorLayer title={t(coloring === "clockTimeColor" ? "sa_settings_clock_time_color" : coloring === "clockDateColor" ? "sa_settings_clock_date_color" : "sa_settings_clock_weather_color")}>
      <ChoiceList idPrefix="cc" value={colorOf(coloring).v} options={CLOCK_COLORS.map((c) => ({ value: c.v, label: t(c.k) }))}
        onPick={(v) => { const f = coloring; const designed = f === "clockTimeColor" ? "text" : "muted"; set({ [f]: v === designed ? "" : v } as Partial<Settings>); done(); }} onClose={done} />
    </EditorLayer>
  ) : null;
  return (
    <>
      {editor}
      <Lines items={[
        { id: "w-on", icon: "SUN", title: t("sa_settings_show_weather"), line: t("sa_settings_line_show_weather"), end: <Toggle on={s.weatherOn} />, onOk: () => set({ weatherOn: !s.weatherOn }) },
        { id: "w-place", icon: "LANGUAGE", title: t("sa_settings_custom_location"), line: s.weatherPlace || t("sa_settings_auto"), onOk: () => setTyping(true) },
        { id: "w-unit", icon: "SUN", title: t("sa_settings_temperature_unit"), line: s.tempUnit === "f" ? "°F" : "°C", onOk: () => set({ tempUnit: s.tempUnit === "f" ? "c" : "f" }), onStep: units },
        { h: "sa_settings_clock_colors" },
        { id: "w-time", icon: "CLOCK", title: t("sa_settings_clock_time_color"), line: t("sa_settings_line_clock_time"), end: end("clockTimeColor"), onOk: () => setColoring("clockTimeColor") },
        { id: "w-date", icon: "CALENDAR", title: t("sa_settings_clock_date_color"), line: t("sa_settings_line_clock_date"), end: end("clockDateColor"), onOk: () => setColoring("clockDateColor") },
        { id: "w-weather", icon: "SUN", title: t("sa_settings_clock_weather_color"), line: t("sa_settings_line_clock_weather"), end: end("clockWeatherColor"), onOk: () => setColoring("clockWeatherColor") },
      ]} />
      <Presence show={typing}>
        {(out) => (
          <TextEntry title={t("sa_settings_custom_location")} hint={t("sa_settings_location_hint")} label={t("sa_settings_city_latlon")} value={s.weatherPlace} closing={out}
            onCancel={() => { setTyping(false); setTimeout(() => sheet.focus("w-place"), 0); }}
            onDone={(v) => { set({ weatherPlace: v }); setTyping(false); setTimeout(() => sheet.focus("w-place"), 0); }} />
        )}
      </Presence>
    </>
  );
}

function ColorEnd({ label, css }: { label: string; css: string }) {
  return <span class="set-swatch-end"><i class="set-swatch sq" style={{ background: css }} /><span class="set-hex blue">{label}</span><span class="set-chev">›</span></span>;
}

const KEY_ACTIONS: Key[] = [
  "sa_settings_live_key_action_info", "sa_settings_live_key_action_list", "sa_settings_live_key_action_history", "sa_settings_live_key_action_next",
  "sa_settings_live_key_action_previous", "sa_settings_live_key_action_last", "sa_settings_live_key_action_rewind", "sa_settings_live_key_action_forward",
  "sa_settings_live_key_action_pause", "sa_settings_live_key_action_nothing",
];
/** The usual action of each key on a channel (LiveKeyLabels.kt): OK info, ▲ ▼ next/previous, ◀ ▶ list/history. */
const LIVE_KEYS: Array<[string, Key, Key]> = [
  ["ok", "sa_settings_live_key_ok", "sa_settings_live_key_action_info"], ["up", "sa_settings_live_key_up", "sa_settings_live_key_action_previous"],
  ["down", "sa_settings_live_key_down", "sa_settings_live_key_action_next"], ["left", "sa_settings_live_key_left", "sa_settings_live_key_action_list"],
  ["right", "sa_settings_live_key_right", "sa_settings_live_key_action_history"],
];

/** Кнопки пульта (ChNavSettingsScreen.kt). Stored: the web player keeps its own keys. */
export function ChNavPage({ s, set }: P) {
  const sheet = useSheet();
  const [editing, setEditing] = useState<string | null>(null);
  const row = LIVE_KEYS.find((k) => k[0] === editing);
  const back = () => { const id = editing; setEditing(null); setTimeout(() => sheet.focus(`k-${id}`), 0); };
  useSheetBack(!!editing, back);
  const editor = row ? (
      <EditorLayer title={tf("sa_settings_live_keys_choose", t(row[1]))}>
        <ChoiceList idPrefix="key" value={s.liveKeys[row[0]] ?? row[2]} options={KEY_ACTIONS.map((k) => ({ value: k as string, label: t(k) }))}
          onPick={(v) => { const next = { ...s.liveKeys }; if (v === row[2]) delete next[row[0]]; else next[row[0]] = v; set({ liveKeys: next }); back(); }} onClose={back} />
      </EditorLayer>
  ) : null;
  const custom = Object.keys(s.liveKeys).length > 0;
  return (
    <>{editor}<Lines items={[
      { h: "sa_settings_live_keys", first: true },
      ...LIVE_KEYS.map(([k, title, usual]): Line => ({
        id: `k-${k}`, icon: "CH_NAV", title: t(title),
        line: s.liveKeys[k] ? t(s.liveKeys[k] as Key) : tf("sa_settings_live_key_default", t(usual)), onOk: () => setEditing(k),
      })),
      ...(custom ? [{ id: "k-reset", icon: "REFRESH", title: t("sa_settings_live_keys_reset"), onOk: () => set({ liveKeys: {} }) } as Line] : []),
      { id: "k-on", icon: "CH_NAV", title: t("sa_settings_remote_shortcuts_enabled"), line: t("sa_settings_line_remote_shortcuts_on"), end: <Toggle on={s.chNav} />, onOk: () => set({ chNav: !s.chNav }) },
    ]} /></>
  );
}

/** Настройка ширины панелей (PanelWidthSettingsScreen.kt): the sections and their widths. Not adjustable here yet. */
export function PanelWidthPage() {
  return (
    <Lines items={[
      { id: "pw-live", icon: "LIVE_TV", title: `${t("sa_common_nav_live_tv")} · ${t("sa_settings_live_layout_stage")}`, line: t("sa_settings_subtitle_default"), disabled: true },
      { note: t("sa_web_not_here_title"), body: t("sa_web_not_here_body") },
    ]} />
  );
}

/** Ширина столбцов телегида (GuideWidthSettingsScreen.kt). Not adjustable here yet. */
export function GuideWidthPage() {
  return (
    <Lines items={[
      { id: "gw-guide", icon: "EPG", title: t("sa_content_epg_title"), line: t("sa_settings_subtitle_default"), disabled: true },
      { note: t("sa_web_not_here_title"), body: t("sa_web_not_here_body") },
    ]} />
  );
}

/** Просмотр и списки (BrowsingListsSettingsScreen.kt): remember the last category / item per section. Stored. */
export function BrowsingPage({ s, set }: P) {
  const names: Array<[string, Key]> = [["LIVE_TV", "sa_settings_history_live"], ["MOVIES", "sa_settings_history_movies"], ["SERIES", "sa_settings_history_series"]];
  const flip = (field: "browseLastCat" | "browseLastItem", i: number) => { const next = s[field].slice(); next[i] = !next[i]; set({ [field]: next } as Partial<Settings>); };
  return (
    <Lines items={[
      { h: "sa_settings_browsing_last_category", first: true },
      ...names.map(([icon, k], i): Line => ({ id: `bc-${i}`, icon, title: t(k), end: <Toggle on={!!s.browseLastCat[i]} />, onOk: () => flip("browseLastCat", i) })),
      { h: "sa_settings_browsing_last_item" },
      ...names.map(([icon, k], i): Line => ({ id: `bi-${i}`, icon, title: t(k), end: <Toggle on={!!s.browseLastItem[i]} />, onOk: () => flip("browseLastItem", i) })),
    ]} />
  );
}

/** Меню долгого нажатия (ContentMenuSettingsScreen.kt). Not arrangeable here yet. */
export function MenusPage() {
  const rows: Array<[string, Key]> = [["LIVE_TV", "sa_common_nav_live_tv"], ["MOVIES", "sa_common_nav_movies"], ["SERIES", "sa_common_nav_series"], ["LIST_GRID", "sa_content_episodes"]];
  return (
    <Lines items={[
      ...rows.map(([icon, k], i): Line => ({ id: `cm-${i}`, icon, title: t(k), line: t("sa_settings_subtitle_default"), disabled: true })),
      { note: t("sa_web_not_here_title"), body: t("sa_web_not_here_body") },
    ]} />
  );
}

/** A page whose Android screen is not built in the web app yet: said plainly, nothing pretends to work. */
export function NotHerePage() {
  return <SNote title={t("sa_web_not_here_title")} body={t("sa_web_not_here_body")} />;
}

const ENGLISH: Record<string, string> = {
  ru: "Russian", en: "English", de: "German", fr: "French", es: "Spanish", it: "Italian", pt: "Portuguese", nl: "Dutch", sv: "Swedish", da: "Danish",
  nb: "Norwegian Bokmål", pl: "Polish", cs: "Czech", hu: "Hungarian", tr: "Turkish", eu: "Basque", ar: "Arabic", hi: "Hindi", bn: "Bengali",
  ml: "Malayalam", ja: "Japanese", ko: "Korean", "zh-CN": "Chinese (Simplified)", "zh-TW": "Chinese (Traditional)",
};

/** Язык (LanguageSettingsScreen.kt): the TV's language first, then each one named in itself; the one in use ticked. */
export function LanguagePage({ s, set }: P) {
  const tick = (on: boolean) => <span class="set-tick">{on ? <SIcon name="CHECK" size={24} /> : null}</span>;
  return (
    <Lines items={[
      { id: "lang-auto", icon: "CHECK", title: t("sa_settings_language_system_default"), line: t("sa_settings_language_system_default_description"), end: tick(s.language === "auto"), onOk: () => set({ language: "auto" }) },
      ...LANGUAGES.map((l): Line => ({ id: `lang-${l.code}`, icon: "LANGUAGE", title: l.name, line: ENGLISH[l.code], end: tick(s.language === l.code), onOk: () => set({ language: l.code }) })),
    ]} />
  );
}

/** Прокси (NetworkSettingsScreen.kt). On the web it is the guide proxy the app already has: an address the guide is fetched through. */
export function ProxyPage({ s, set }: P) {
  const [typing, setTyping] = useState(false);
  const sheet = useSheet();
  return (
    <>
      <Lines items={[
        { id: "px-on", icon: "NETWORK", title: t("sa_settings_use_proxy"), line: t("sa_web_proxy_line"), end: <Toggle on={s.proxyOn} />, onOk: () => set({ proxyOn: !s.proxyOn }) },
        { id: "px-host", icon: "PENCIL", title: t("sa_settings_host"), line: s.proxy || t("sa_web_proxy_hint"), onOk: () => setTyping(true) },
      ]} />
      <Presence show={typing}>
        {(out) => (
          <TextEntry title={t("sa_settings_host")} hint={t("sa_web_proxy_entry")} value={s.proxy} closing={out}
            onCancel={() => { setTyping(false); setTimeout(() => sheet.focus("px-host"), 0); }}
            onDone={(v) => { set({ proxy: v.trim() }); setTyping(false); setTimeout(() => sheet.focus("px-host"), 0); }} />
        )}
      </Presence>
    </>
  );
}

/** DNS (DnsSettingsScreen.kt). Stored: a web app always uses the TV's own resolver. */
export function DnsPage({ s, set }: P) {
  const [typing, setTyping] = useState(false);
  const sheet = useSheet();
  const presets: Array<[string, string]> = [["Google", "https://dns.google/dns-query"], ["Cloudflare", "https://cloudflare-dns.com/dns-query"], ["Quad9", "https://dns.quad9.net/dns-query"]];
  const at = presets.findIndex((p) => p[1] === s.dnsServer);
  return (
    <>
      <Lines items={[
        { id: "dns-on", icon: "DNS", title: t("sa_settings_dns_use_custom"), line: t(s.dnsOn && !s.dnsServer ? "sa_settings_dns_server_missing" : "sa_settings_dns_toggle_description"), end: <Toggle on={s.dnsOn} />, onOk: () => set({ dnsOn: !s.dnsOn }) },
        ...(s.dnsOn ? [
          { id: "dns-preset", icon: "DNS", title: t("sa_settings_presets"), line: at >= 0 ? presets[at]![0] : "—",
            onOk: () => set({ dnsServer: presets[(at + 1) % 3]![1] }), onStep: (d: number) => set({ dnsServer: presets[Math.max(0, Math.min(2, (at < 0 ? 0 : at) + d))]![1] }) } as Line,
          { id: "dns-server", icon: "PENCIL", title: t("sa_settings_dns_server"), line: s.dnsServer || t("sa_settings_dns_server_hint"), onOk: () => setTyping(true) } as Line,
        ] : []),
        { note: t("sa_web_dns_title"), body: t("sa_web_dns_body") },
      ]} />
      <Presence show={typing}>
        {(out) => (
          <TextEntry title={t("sa_settings_dns_server")} hint={t("sa_settings_dns_server_hint")} value={s.dnsServer} closing={out}
            onCancel={() => { setTyping(false); setTimeout(() => sheet.focus("dns-server"), 0); }}
            onDone={(v) => { set({ dnsServer: v.trim() }); setTyping(false); setTimeout(() => sheet.focus("dns-server"), 0); }} />
        )}
      </Presence>
    </>
  );
}

/** The twelve questions and answers, in order (HelpPage.kt). */
const HELP: Array<[Key, Key]> = [
  ["sa_help_q1", "sa_help_a1"], ["sa_help_q2", "sa_help_a2"], ["sa_help_q3", "sa_help_a3"], ["sa_help_q4", "sa_help_a4"],
  ["sa_help_q5", "sa_help_a5"], ["sa_help_q6", "sa_help_a6"], ["sa_help_q7", "sa_help_a7"], ["sa_help_q8", "sa_help_a8"],
  ["sa_help_q9", "sa_help_a9"], ["sa_help_q10", "sa_help_a10"], ["sa_help_q11", "sa_help_a11"], ["sa_help_q12", "sa_help_a12"],
];

/** Как пользоваться (HelpPage.kt): twelve questions, each a focusable card (OK does nothing), lines between them. */
export function HelpPage() {
  const items: ComponentChildren[] = [];
  HELP.forEach(([q, a], i) => {
    if (i > 0) items.push(<div key={`d${i}`} class="set-divider" />);
    items.push(
      <div key={q} class="st-focusable set-help" tabIndex={0} data-focus={`help-${i + 1}`}>
        <div class="set-help-q">{t(q)}</div>
        <div class="set-help-a">{t(a)}</div>
      </div>,
    );
  });
  return <div class="set-help-list">{items}</div>;
}

/**
 * Синхронизация ТВ (LocalSyncScreen.kt): the description and the two cards. A web app cannot listen on the network or
 * find another TV by itself, so both cards say so instead of pretending; the Windows app keeps its own sync window.
 */
export function SyncPage({ onDesktop }: { onDesktop: (() => void) | null }) {
  const [note, setNote] = useState(false);
  return (
    <div class="set-pad">
      <div class="set-desc">{t("sa_more_sync_description")}</div>
      <div class="set-cards">
        <InfoCard id="sync-mode" icon="PHONE" title={t("sa_local_sync_mode")} label={t("sa_common_off")} body={t("sa_more_sync_mode_description")}
          onOk={() => (onDesktop ? onDesktop() : setNote(true))} />
        <InfoCard id="sync-connect" icon="SEARCH" title={t("sa_local_sync_connect")} body={t("sa_local_sync_connect_description")}
          onOk={() => (onDesktop ? onDesktop() : setNote(true))} />
      </div>
      {note ? <div class="set-status">{t("sa_web_sync_tv")}</div> : null}
    </div>
  );
}

/**
 * Пульт через Telegram (TelegramRemoteScreen.kt): the pairing card and the two rows. Pairing talks to the SkMate
 * server and the bot's commands must reach the player; neither is built into the web app yet, so the card says the
 * code could not be fetched (Android's own failed state) and the rows explain.
 */
export function TelegramPage() {
  const [said, setSaid] = useState(false);
  return (
    <>
      <div class="set-tg-card">
        <div class="set-tg-qr"><SIcon name="SEND" size={96} /></div>
        <div class="set-tg-state">{t("sa_settings_tg_remote_failed")}</div>
        <div class="set-tg-hint">{t("sa_web_tg_body")}</div>
      </div>
      <SRow id="tg-new" icon="REFRESH" title={t("sa_settings_tg_remote_new_code")} onOk={() => setSaid(true)} />
      <SRow id="tg-own" icon="SEND" title={t("sa_settings_tg_own")} line={t("sa_settings_tg_own_token_hint")} onOk={() => setSaid(true)} />
      {said ? <div class="set-status">{t("sa_web_tg_body")}</div> : null}
    </>
  );
}

export { BigStepper };
