import { useEffect, useMemo, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { Icon, installDpad, watchFrames, type IconName } from "@skmate/ui";
import { applyLanguage, t, type Key } from "./i18n";
import { channelKey, loadFavorites, saveFavorites, toggle } from "./state/favorites";
import { applyAll, DEFAULTS, load, save, type Settings } from "./state/settings";
import { GuideContext } from "./state/GuideContext";
import { useGuide } from "./state/useGuide";
import { usePlaylists } from "./state/usePlaylists";
import { Confirm } from "./views/Confirm";
import { GuideView } from "./views/GuideView";
import { LiveView } from "./views/LiveView";
import { PlayerView } from "./views/PlayerView";
import { SearchView } from "./views/SearchView";
import { SettingsSheet, type Page } from "./views/SettingsSheet";
import { SportView } from "./views/SportView";

type Section = "live" | "guide" | "sport" | "search";
/** The middle of the rail: the places you go; Settings sits apart at the bottom and opens as a sheet. */
const NAV: Array<[Section, IconName, Key]> = [
  ["live", "live_tv", "navLive"],
  ["guide", "epg", "navGuide"],
  ["sport", "sports", "navSport"],
  ["search", "search", "navSearch"],
];

export function App() {
  const [section, setSection] = useState<Section>("live");
  const [playing, setPlaying] = useState<{ list: readonly Channel[]; index: number } | null>(null);
  const [settings, setSettings] = useState<Settings>(load);
  const [throttled, setThrottled] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [sheetPage, setSheetPage] = useState<Page | null>(null);
  const pl = usePlaylists();
  const guide = useGuide(pl.channels, pl.active, pl.headerGuides, settings);
  const guideValue = useMemo(() => ({ data: guide.data, now: guide.now }), [guide.data, guide.now]);
  applyLanguage(settings.language); // before anything is drawn: the whole screen speaks one language

  useEffect(() => { applyAll(settings, throttled); save(settings); }, [settings, throttled]);
  useEffect(() => watchFrames(() => setThrottled(true)), []);
  useEffect(() => { saveFavorites(favorites); }, [favorites]);

  // Back: dialog → closes, player → list, any section but the first → the first, in the first → leave the app to the TV.
  useEffect(() => installDpad(() => {
    if (deleting) { setDeleting(null); return true; }
    if (resetting) { setResetting(false); return true; }
    if (sheet) { if (sheetPage) setSheetPage(null); else setSheet(false); return true; }
    if (playing) { setPlaying(null); return true; }
    if (section !== "live") { setSection("live"); return true; }
    return false;
  }), [deleting, resetting, sheet, sheetPage, playing, section]);

  const open = (c: Channel, list: readonly Channel[]) => setPlaying({ list, index: Math.max(0, list.findIndex((x) => x.id === c.id)) });
  const toggleFavorite = (c: Channel) => setFavorites((f) => toggle(f, channelKey(c)));
  const doomed = deleting ? pl.store.list.find((p) => p.id === deleting) : undefined;

  if (playing) {
    const current = playing.list[playing.index] as Channel;
    return (
      <GuideContext.Provider value={guideValue}>
      <PlayerView
        channels={playing.list} index={playing.index} favorites={favorites} onJump={(index) => setPlaying((cur) => (cur ? { list: cur.list, index } : cur))}
        onStep={(d) => setPlaying((cur) => (cur ? { list: cur.list, index: (cur.index + d + cur.list.length) % cur.list.length } : cur))}
        onFav={toggleFavorite} onExit={() => setPlaying(null)}
        settings={settings} onChangeSettings={setSettings}
      />
      </GuideContext.Provider>
    );
  }

  return (
    <GuideContext.Provider value={guideValue}>
      <nav class="rail">
        <div class="rail-mid">
          {NAV.map(([id, icon, label]) => (
            <button class="rail-item" key={id} data-focus={`nav-${id}`} data-label={t(label)} aria-label={t(label)} aria-current={section === id} onClick={() => setSection(id)}>
              <Icon name={icon} />
            </button>
          ))}
        </div>
        <button class="rail-item rail-bottom" data-focus="nav-settings" data-label={t("navSettings")} aria-label={t("navSettings")} aria-current={sheet} onClick={() => { setSheetPage(null); setSheet(true); }}>
          <Icon name="settings" />
        </button>
      </nav>
      <main class="content">
        {section === "live" ? (
          <LiveView
            channels={pl.channels} favorites={favorites} status={pl.status} settings={settings}
            onOpen={open} onFav={toggleFavorite}
            onAddPlaylist={() => { setSheetPage("playlists"); setSheet(true); }} onDemo={pl.addDemo}
          />
        ) : null}
        {section === "guide" ? <GuideView channels={pl.channels} favorites={favorites} status={guide.status} onRefresh={() => void guide.sync()} onOpen={open} /> : null}
        {section === "sport" ? <SportView channels={pl.channels} favorites={favorites} onOpen={open} onFav={toggleFavorite} /> : null}
        {section === "search" ? <SearchView channels={pl.channels} favorites={favorites} onOpen={open} onFav={toggleFavorite} /> : null}
      </main>
      {sheet ? (
        <SettingsSheet
          page={sheetPage} onPage={setSheetPage} onClose={() => setSheet(false)}
          settings={settings} onChange={setSettings} store={pl.store} status={pl.status}
          onAddPlaylist={pl.add} onSelectPlaylist={pl.select} onAskDeletePlaylist={setDeleting}
          onAskReset={() => setResetting(true)}
          guide={{ data: guide.data, status: guide.status, outcomes: guide.outcomes, onRefresh: () => void guide.sync(), onClear: guide.clear }}
          channelCount={pl.channels.length} active={pl.active} headerGuides={pl.headerGuides}
        />
      ) : null}
      {resetting ? (
        <Confirm
          title={t("setResetTitle")} body={t("setResetHint")} confirm={t("setResetDo")}
          onCancel={() => setResetting(false)}
          onConfirm={() => { setSettings(DEFAULTS); setResetting(false); }}
        />
      ) : null}
      {doomed ? (
        <Confirm
          title={t("confirmDeleteTitle")} body={doomed.name} confirm={t("playlistDelete")}
          onCancel={() => setDeleting(null)}
          onConfirm={() => { pl.remove(doomed.id); setDeleting(null); }}
        />
      ) : null}
    </GuideContext.Provider>
  );
}
