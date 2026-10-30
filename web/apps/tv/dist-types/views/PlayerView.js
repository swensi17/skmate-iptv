import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useEffect, useRef, useState } from "preact/hooks";
import { defaultEngines, PlayerLadder } from "@skmate/player";
import { t } from "../i18n";
export function PlayerView({ channel }) {
    const video = useRef(null);
    const [state, setState] = useState("loading");
    useEffect(() => {
        const el = video.current;
        if (!el)
            return;
        const ladder = new PlayerLadder(defaultEngines());
        setState("loading");
        const source = channel.headers ? { url: channel.url, headers: channel.headers } : { url: channel.url };
        ladder.play(el, source).then(() => setState("playing"), () => setState("failed"));
        return () => ladder.stop();
    }, [channel]);
    return (_jsxs("div", { class: "player", children: [_jsx("video", { ref: video, class: "video", autoplay: true, playsInline: true }), _jsxs("div", { class: "player-top", children: [_jsx("div", { class: "player-title", children: channel.name }), state === "loading" ? _jsx("div", { class: "player-note", children: t("playerLoading") }) : null] }), state === "failed" ? (_jsxs("div", { class: "player-error", children: [_jsx("div", { class: "player-error-title", children: t("playerFailed") }), _jsx("div", { class: "player-note", children: t("playerFailedHint") })] })) : null] }));
}
