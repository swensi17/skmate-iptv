import { type Channel } from "@skmate/core";
export declare function LiveView({ channels, onOpen }: {
    channels: Channel[];
    onOpen: (c: Channel) => void;
}): import("preact").JSX.Element;
