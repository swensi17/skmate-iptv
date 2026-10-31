import { createContext } from "preact";

/** How the lists look, from the viewer's settings: read by every row, so no screen has to pass it down. */
export interface UiLook { rowH: number; logos: boolean; numbers: boolean; program: boolean }
export const UiContext = createContext<UiLook>({ rowH: 84, logos: true, numbers: true, program: true });
