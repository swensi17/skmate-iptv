import { type Channel } from "@skmate/core";
interface Props {
    channels: Channel[];
    favorites: ReadonlySet<string>;
    onOpen: (c: Channel) => void;
    onFav: (c: Channel) => void;
}
export declare function SearchView({ channels, favorites, onOpen, onFav }: Props): import("preact").JSX.Element;
export {};
