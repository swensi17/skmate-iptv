import { useEffect, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { Icon, installDpad, watchFrames, type IconName } from "@skmate/ui";
import { applyLanguage, t, type Key } from "./i18n";
import { channelKey, loadFavorites, saveFavorites, toggle } from "./state/favorites";
import { applyAll, DEFAULTS, load, save, type Settings } from "./state/settings";
import { usePlaylists } from "./state/usePlaylists";
import { Confirm } from "./views/Confirm";
import { LiveView } from "./views/LiveView";
import { PlayerView } from "./views/PlayerView";
import { SearchView } from "./views/SearchView";
import { SettingsView } from "./views/SettingsView";

type Section = "live" | "search" | "settings";
const NAV: Array<[Section, IconName, Key]> = [
  ["live", "live_tv", "navLive"],
  ["search", "search", "navSearch"],
  ["settings", "settings", "navSettings"],
];

export function App() {
  const [section, setSection] = useState<Section>("live");
  const [playing, setPlaying] = useState<{ list: readonly Channel[]; index: number } | null>(null);
  const [settings, setSettings] = useState<Settings>(load);
  const [throttled, setThrottled] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const pl = usePlaylists();
  applyLanguage(settings.language); // before anything is drawn: the whole screen speaks one language

  useEffect(() => { applyAll(settings, throttled); save(settings); }, [settings, throttled]);
  useEffect(() => watchFrames(() => setThrottled(true)), []);
  useEffect(() => { saveFavorites(favorites); }, [favorites]);

  // Back: dialog → closes, player → list, any section but the first → the first, in the first → leave the app to the TV.
  useEffect(() => installDpad(() => {
    if (deleting) { setDeleting(null); return true; }
    if (resetting) { setResetting(false); return true; }
    if (playing) { setPlaying(null); return true; }
    if (section !== "live") { setSection("live"); return true; }
    return false;
  }), [deleting, resetting, playing, section]);

  const open = (c: Channel, list: readonly Channel[]) => setPlaying({ list, index: Math.max(0, list.findIndex((x) => x.id === c.id)) });
  const toggleFavorite = (c: Channel) => setFavorites((f) => toggle(f, channelKey(c)));
  const doomed = deleting ? pl.store.list.find((p) => p.id === deleting) : undefined;

  if (playing) {
    const current = playing.list[playing.index] as Channel;
    return (
      <PlayerView
        channels={playing.list} index={playing.index} favorite={favorites.has(channelKey(current))}
        onStep={(d) => setPlaying((cur) => (cur ? { list: cur.list, index: (cur.index + d + cur.list.length) % cur.list.length } : cur))}
        onFav={toggleFavorite} onExit={() => setPlaying(null)}
        settings={settings} onChangeSettings={setSettings}
      />
    );
  }

  return (
    <>
      <nav class="rail">
        {NAV.map(([id, icon, label]) => (
          <button class="rail-item" key={id} data-focus={`nav-${id}`} aria-label={t(label)} aria-current={section === id} onClick={() => setSection(id)}>
            <Icon name={icon} />
          </button>
        ))}
      </nav>
      <main class="content">
        {section === "live" ? (
          <LiveView
            channels={pl.channels} favorites={favorites} status={pl.status}
            onOpen={open} onFav={toggleFavorite}
            onAddPlaylist={() => setSection("settings")} onDemo={pl.addDemo}
          />
        ) : null}
        {section === "search" ? <SearchView channels={pl.channels} favorites={favorites} onOpen={open} onFav={toggleFavorite} /> : null}
        {section === "settings" ? (
          <SettingsView
            settings={settings} onChange={setSettings} store={pl.store} status={pl.status}
            onAddPlaylist={pl.add} onSelectPlaylist={pl.select} onAskDeletePlaylist={setDeleting}
            onAskReset={() => setResetting(true)}
          />
        ) : null}
      </main>
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
    </>
  );
}
