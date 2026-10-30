import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useEffect, useMemo, useState } from "preact/hooks";
import { searchBy } from "@skmate/core";
import { focusFirst } from "@skmate/ui";
import { t } from "../i18n";
import { channelKey } from "../state/favorites";
import { ChannelRow } from "./ChannelRow";
export function SearchView({ channels, favorites, onOpen, onFav }) {
    const [query, setQuery] = useState("");
    const hits = useMemo(() => searchBy(channels, query, (c) => c.name).map((r) => r.item), [channels, query]);
    useEffect(() => { focusFirst(document, "search-input"); }, []);
    return (_jsxs("div", { class: "screen search", children: [_jsx("input", { class: "field", "data-focus": "search-input", value: query, placeholder: t("searchPlaceholder"), onInput: (e) => setQuery(e.currentTarget.value) }), _jsx("div", { class: "list-head", children: query.trim() === "" ? t("searchHint") : hits.length === 0 ? t("searchEmpty") : t("searchResults", { n: hits.length }) }), _jsx("div", { class: "scroll", children: hits.map((c, i) => _jsx(ChannelRow, { channel: c, index: i, favorite: favorites.has(channelKey(c)), onOpen: onOpen, onFav: onFav }, c.id)) })] }));
}
