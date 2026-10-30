import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useState } from "preact/hooks";
import { t } from "../i18n";
export function PlaylistsPanel(p) {
    const [url, setUrl] = useState("");
    const [error, setError] = useState(null);
    const submit = () => {
        const err = p.onAdd(url);
        setError(err);
        if (!err)
            setUrl("");
    };
    return (_jsxs("div", { class: "setting", children: [_jsx("div", { class: "setting-title", children: t("settingsPlaylists") }), p.store.list.map((pl) => (_jsxs("div", { class: "playlist", children: [_jsxs("button", { class: "row", "data-focus": `pl-${pl.id}`, "aria-pressed": p.store.activeId === pl.id, onClick: () => p.onSelect(pl.id), children: [_jsx("span", { class: "grow", children: pl.name }), p.store.activeId === pl.id ? _jsx("span", { class: "sub", children: t("playlistActive") }) : null] }), _jsx("button", { class: "btn", "data-focus": `pl-del-${pl.id}`, onClick: () => p.onAskDelete(pl.id), children: t("playlistDelete") })] }, pl.id))), _jsxs("div", { class: "add", children: [_jsx("input", { class: "field", "data-focus": "pl-url", value: url, placeholder: t("playlistUrlPlaceholder"), onInput: (e) => setUrl(e.currentTarget.value), onKeyDown: (e) => { if (e.key === "Enter")
                            submit(); } }), _jsx("button", { class: "btn", "data-focus": "pl-add", onClick: submit, children: t("playlistAdd") })] }), error ? _jsx("div", { class: "status error", children: error }) : null, !error && p.status.kind === "loading" ? _jsx("div", { class: "status", children: t("playlistLoading") }) : null, !error && p.status.kind === "error" ? _jsx("div", { class: "status error", children: p.status.message }) : null] }));
}
