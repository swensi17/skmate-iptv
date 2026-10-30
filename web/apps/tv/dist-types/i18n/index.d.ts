import { ru } from "./ru";
export type Key = keyof typeof ru;
/** For tests and a future language switch. */
export declare function setLanguage(lang: string): void;
export declare function t(key: Key, vars?: Record<string, string | number>): string;
