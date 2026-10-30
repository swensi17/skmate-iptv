import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "preact/jsx-runtime";
import { useEffect, useState } from "preact/hooks";
import { Icon, installDpad, watchFrames } from "@skmate/ui";
import { t } from "./i18n";
import { demoChannels } from "./state/playlist";
import { applyAll, load, save } from "./state/settings";
import { LiveView } from "./views/LiveView";
import { PlayerView } from "./views/PlayerView";
import { SearchView } from "./views/SearchView";
import { SettingsView } from "./views/SettingsView";
const NAV = [
    ["live", "live_tv", "navLive"],
    ["search", "search", "navSearch"],
    ["settings", "settings", "navSettings"],
];
export function App() {
    const [section, setSection] = useState("live");
    const [playing, setPlaying] = useState(null);
    const [settings, setSettings] = useState(load);
    const [throttled, setThrottled] = useState(false);
    const [channels] = useState(demoChannels);
    useEffect(() => { applyAll(settings, throttled); save(settings); }, [settings, throttled]);
    useEffect(() => watchFrames(() => setThrottled(true)), []);
    // Back: player → list, any section but the first → the first, in the first → leave the app to the TV.
    useEffect(() => installDpad(() => {
        if (playing) {
            setPlaying(null);
            return true;
        }
        if (section !== "live") {
            setSection("live");
            return true;
        }
        return false;
    }), [playing, section]);
    if (playing)
        return _jsx(PlayerView, { channel: playing });
    return (_jsxs(_Fragment, { children: [_jsx("nav", { class: "rail", children: NAV.map(([id, icon, label]) => (_jsx("button", { class: "rail-item", "data-focus": `nav-${id}`, "aria-label": t(label), "aria-current": section === id, onClick: () => setSection(id), children: _jsx(Icon, { name: icon }) }, id))) }), _jsxs("main", { class: "content", children: [section === "live" ? _jsx(LiveView, { channels: channels, onOpen: setPlaying }) : null, section === "search" ? _jsx(SearchView, { channels: channels, onOpen: setPlaying }) : null, section === "settings" ? _jsx(SettingsView, { settings: settings, onChange: setSettings }) : null] })] }));
}
