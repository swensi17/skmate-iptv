import type { Channel } from "@skmate/core";
export declare function ChannelRow({ channel, index, onOpen }: {
    channel: Channel;
    index: number;
    onOpen: (c: Channel) => void;
}): import("preact").JSX.Element;
