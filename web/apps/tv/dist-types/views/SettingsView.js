import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useEffect } from "preact/hooks";
import { focusFirst } from "@skmate/ui";
import { t } from "../i18n";
function Segmented(props) {
    return (_jsx("div", { class: "seg", role: "radiogroup", children: props.options.map(([v, label]) => (_jsx("button", { class: "seg-item", "data-focus": `${props.id}-${v}`, "aria-pressed": props.value === v, onClick: () => props.onPick(v), children: t(label) }, v))) }));
}
export function SettingsView({ settings, onChange }) {
    useEffect(() => { focusFirst(document, `theme-${settings.theme}`); }, []);
    return (_jsxs("div", { class: "screen settings", children: [_jsx("h2", { children: t("navSettings") }), _jsxs("div", { class: "setting", children: [_jsx("div", { class: "setting-title", children: t("settingsTheme") }), _jsx(Segmented, { id: "theme", value: settings.theme, options: [["system", "themeSystem"], ["dark", "themeDark"], ["light", "themeLight"]], onPick: (theme) => onChange(Object.assign(Object.assign({}, settings), { theme })) })] }), _jsxs("div", { class: "setting", children: [_jsx("div", { class: "setting-title", children: t("settingsMotion") }), _jsx(Segmented, { id: "motion", value: settings.motion, options: [["auto", "motionAuto"], ["on", "motionOn"], ["off", "motionOff"]], onPick: (motion) => onChange(Object.assign(Object.assign({}, settings), { motion })) }), _jsx("div", { class: "setting-hint", children: t("settingsMotionHint") })] })] }));
}
