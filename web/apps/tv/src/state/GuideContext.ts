import { createContext } from "preact";
import { GuideData } from "@skmate/epg";

/** The guide and the current minute: rows read what is on now from here, without every screen passing it down. */
export const GuideContext = createContext<{ data: GuideData; now: number }>({ data: new GuideData(), now: 0 });
