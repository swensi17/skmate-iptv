import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "preact/jsx-runtime";
import { useEffect, useMemo, useState } from "preact/hooks";
import { groupsOf } from "@skmate/core";
import { focusFirst } from "@skmate/ui";
import { t } from "../i18n";
import { channelKey } from "../state/favorites";
import { ChannelRow } from "./ChannelRow";
const FAV = "\u0000fav";
export function LiveView(p) {
    var _a, _b;
    const groups = useMemo(() => groupsOf(p.channels), [p.channels]);
    const favs = useMemo(() => p.channels.filter((c) => p.favorites.has(channelKey(c))), [p.channels, p.favorites]);
    const [group, setGroup] = useState(null);
    const shown = group === FAV ? favs : group === null ? p.channels : (_b = (_a = groups.find((g) => g.name === group)) === null || _a === void 0 ? void 0 : _a.channels) !== null && _b !== void 0 ? _b : [];
    useEffect(() => { focusFirst(document, shown[0] ? `ch-${shown[0].id}` : "empty-add"); }, [group, p.channels.length === 0]);
    useEffect(() => { if (group === FAV && favs.length === 0)
        setGroup(null); }, [favs.length]);
    if (p.channels.length === 0) {
        return (_jsx("div", { class: "screen empty", children: p.status.kind === "loading" ? _jsx("div", { class: "empty-title", children: t("playlistLoading") }) : (_jsxs(_Fragment, { children: [_jsx("div", { class: "empty-title", children: t("emptyTitle") }), _jsx("div", { class: "empty-hint", children: p.status.kind === "error" ? p.status.message : t("emptyHint") }), _jsxs("div", { class: "empty-actions", children: [_jsx("button", { class: "btn", "data-focus": "empty-add", onClick: p.onAddPlaylist, children: t("emptyAdd") }), _jsx("button", { class: "btn", "data-focus": "empty-demo", onClick: p.onDemo, children: t("emptyDemo") })] })] })) }));
    }
    return (_jsxs("div", { class: "screen live", children: [_jsxs("aside", { class: "groups", children: [_jsx("h2", { children: t("navLive") }), _jsxs("button", { class: "row", "data-focus": "g-all", onClick: () => setGroup(null), "aria-pressed": group === null, children: [_jsx("span", { class: "grow", children: t("allChannels") }), _jsx("span", { class: "sub", children: p.channels.length })] }), favs.length > 0 ? (_jsxs("button", { class: "row", "data-focus": "g-fav", onClick: () => setGroup(FAV), "aria-pressed": group === FAV, children: [_jsx("span", { class: "grow", children: t("favorites") }), _jsx("span", { class: "sub", children: favs.length })] })) : null, groups.map((g, i) => (_jsxs("button", { class: "row", "data-focus": `g-${i}`, onClick: () => setGroup(g.name), "aria-pressed": group === g.name, children: [_jsx("span", { class: "grow", children: g.name }), _jsx("span", { class: "sub", children: g.channels.length })] }, g.name)))] }), _jsxs("section", { class: "list", children: [_jsxs("div", { class: "list-head", children: [t("channelsCount", { n: shown.length }), " \u00B7 ", t("favHint")] }), _jsx("div", { class: "scroll", children: shown.map((c, i) => (_jsx(ChannelRow, { channel: c, index: i, favorite: p.favorites.has(channelKey(c)), onOpen: p.onOpen, onFav: p.onFav }, c.id))) })] })] }));
}
