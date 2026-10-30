import { useEffect, useState } from "preact/hooks";
import type { Channel } from "@skmate/core";
import { Icon, installDpad, watchFrames, type IconName } from "@skmate/ui";
import { t, type Key } from "./i18n";
import { demoChannels } from "./state/playlist";
import { applyAll, load, save, type Settings } from "./state/settings";
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
  const [playing, setPlaying] = useState<Channel | null>(null);
  const [settings, setSettings] = useState<Settings>(load);
  const [throttled, setThrottled] = useState(false);
  const [channels] = useState<Channel[]>(demoChannels);

  useEffect(() => { applyAll(settings, throttled); save(settings); }, [settings, throttled]);
  useEffect(() => watchFrames(() => setThrottled(true)), []);

  // Back: player → list, any section but the first → the first, in the first → leave the app to the TV.
  useEffect(() => installDpad(() => {
    if (playing) { setPlaying(null); return true; }
    if (section !== "live") { setSection("live"); return true; }
    return false;
  }), [playing, section]);

  if (playing) return <PlayerView channel={playing} />;

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
        {section === "live" ? <LiveView channels={channels} onOpen={setPlaying} /> : null}
        {section === "search" ? <SearchView channels={channels} onOpen={setPlaying} /> : null}
        {section === "settings" ? <SettingsView settings={settings} onChange={setSettings} /> : null}
      </main>
    </>
  );
}
