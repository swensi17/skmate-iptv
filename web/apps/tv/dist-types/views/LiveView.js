import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useEffect, useMemo, useState } from "preact/hooks";
import { groupsOf } from "@skmate/core";
import { focusFirst } from "@skmate/ui";
import { t } from "../i18n";
import { ChannelRow } from "./ChannelRow";
export function LiveView({ channels, onOpen }) {
    var _a, _b;
    const groups = useMemo(() => groupsOf(channels), [channels]);
    const [group, setGroup] = useState(null);
    const shown = group === null ? channels : (_b = (_a = groups.find((g) => g.name === group)) === null || _a === void 0 ? void 0 : _a.channels) !== null && _b !== void 0 ? _b : [];
    useEffect(() => { focusFirst(document, shown[0] ? `ch-${shown[0].id}` : undefined); }, [group]);
    return (_jsxs("div", { class: "screen live", children: [_jsxs("aside", { class: "groups", children: [_jsx("h2", { children: t("navLive") }), _jsxs("button", { class: "row", "data-focus": "g-all", onClick: () => setGroup(null), "aria-pressed": group === null, children: [_jsx("span", { class: "grow", children: t("allChannels") }), _jsx("span", { class: "sub", children: channels.length })] }), groups.map((g, i) => (_jsxs("button", { class: "row", "data-focus": `g-${i}`, onClick: () => setGroup(g.name), "aria-pressed": group === g.name, children: [_jsx("span", { class: "grow", children: g.name }), _jsx("span", { class: "sub", children: g.channels.length })] }, g.name)))] }), _jsxs("section", { class: "list", children: [_jsx("div", { class: "list-head", children: t("channelsCount", { n: shown.length }) }), _jsx("div", { class: "scroll", children: shown.map((c, i) => _jsx(ChannelRow, { channel: c, index: i, onOpen: onOpen }, c.id)) })] })] }));
}
