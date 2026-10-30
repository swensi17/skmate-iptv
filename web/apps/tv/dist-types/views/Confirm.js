import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
import { useEffect } from "preact/hooks";
import { focusFirst } from "@skmate/ui";
import { t } from "../i18n";
/** A question before something is lost. Focus starts on Cancel, so a stray OK never deletes. */
export function Confirm(props) {
    useEffect(() => { focusFirst(document, "confirm-cancel"); }, []);
    return (_jsx("div", { class: "scrim", "data-modal": true, children: _jsxs("div", { class: "dialog", role: "alertdialog", "aria-label": props.title, children: [_jsx("div", { class: "dialog-title", children: props.title }), _jsx("div", { class: "dialog-body", children: props.body }), _jsxs("div", { class: "dialog-actions", children: [_jsx("button", { class: "btn", "data-focus": "confirm-cancel", onClick: props.onCancel, children: t("confirmCancel") }), _jsx("button", { class: "btn", "data-focus": "confirm-ok", onClick: props.onConfirm, children: props.confirm })] })] }) }));
}
