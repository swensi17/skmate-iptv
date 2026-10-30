import { jsx as _jsx, jsxs as _jsxs } from "preact/jsx-runtime";
/** Yellow on webOS (405) and on Tizen (12 once registered); `y` on a keyboard. */
const isYellow = (e) => e.keyCode === 405 || e.keyCode === 12 || e.key === "y";
export function ChannelRow(props) {
    const { channel } = props;
    return (_jsxs("button", { class: "row", "data-focus": `ch-${channel.id}`, onClick: () => props.onOpen(channel), onKeyDown: (e) => { if (isYellow(e))
            props.onFav(channel); }, children: [_jsx("span", { class: "sub", style: { width: 56, textAlign: "right" }, children: props.index + 1 }), channel.logo ? _jsx("img", { class: "logo", src: channel.logo, alt: "" }) : _jsx("span", { class: "logo" }), _jsx("span", { class: "grow", children: channel.name }), props.favorite ? _jsx("span", { class: "star", children: "\u2605" }) : null, channel.group ? _jsx("span", { class: "sub", children: channel.group }) : null] }));
}
