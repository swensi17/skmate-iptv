import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
export function ChannelRow({ channel, index, onOpen }) {
    return (_jsxs("button", { class: "row", "data-focus": `ch-${channel.id}`, onClick: () => onOpen(channel), children: [_jsx("span", { class: "sub", style: { width: 56, textAlign: "right" }, children: index + 1 }), channel.logo ? _jsx("img", { class: "logo", src: channel.logo, alt: "" }) : _jsx("span", { class: "logo" }), _jsx("span", { class: "grow", children: channel.name }), channel.group ? _jsx("span", { class: "sub", children: channel.group }) : null] }));
}
