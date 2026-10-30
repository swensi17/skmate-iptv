import type { Channel } from "@skmate/core";
export declare function ChannelRow(props: {
    channel: Channel;
    index: number;
    favorite: boolean;
    onOpen: (c: Channel) => void;
    onFav: (c: Channel) => void;
}): import("preact").JSX.Element;
