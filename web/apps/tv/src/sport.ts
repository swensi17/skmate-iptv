import type { Channel } from "@skmate/core";
import type { Key } from "./i18n";

export type SportKind = "football" | "hockey" | "fight" | "tennis" | "basket" | "motor" | "other";

/** Name fragments of channels (and of sports on them) by kind of sport; lower case, matched as substrings. */
const KINDS: Array<[Exclude<SportKind, "other">, string[]]> = [
  ["football", ["футбол", "football", "soccer", "матч премьер", "premier", "la liga", "laliga", "bundesliga", "serie a", "uefa", "champions", "eleven sports", "arena sport"]],
  ["hockey", ["хоккей", "hockey", "кхл", "khl", "nhl"]],
  ["fight", ["ufc", "бокс", "boxing", "mma", "единоборств", "fight", "wwe", "борьб"]],
  ["tennis", ["теннис", "tennis"]],
  ["basket", ["баскетбол", "basket", "nba"]],
  ["motor", ["формула", "formula", "f1", "motor", "авто", "racing", "moto"]],
];

export const SPORT_LABEL: Record<SportKind, Key> = {
  football: "sportFootball", hockey: "sportHockey", fight: "sportFight", tennis: "sportTennis",
  basket: "sportBasket", motor: "sportMotor", other: "sportOther",
};

const SPORT_GROUP = /спорт|sport/i;
const GENERIC_SPORT = ["sport", "спорт", "матч", "eurosport", "setanta", "viasat sport", "match"];

/** True for a channel that is about sport: its group says so, or its name does. */
export function isSport(c: Channel): boolean {
  const name = c.name.toLowerCase();
  return SPORT_GROUP.test(c.group) || KINDS.some(([, words]) => words.some((w) => name.includes(w))) || GENERIC_SPORT.some((w) => name.includes(w));
}

export function kindOf(c: Channel): SportKind {
  const name = c.name.toLowerCase();
  return KINDS.find(([, words]) => words.some((w) => name.includes(w)))?.[0] ?? "other";
}

/** The sports channels and how many fall under each kind of sport (kinds with none are left out). */
export function sportSummary(channels: readonly Channel[]): { list: Channel[]; kinds: Array<[SportKind, number]> } {
  const list = channels.filter(isSport);
  const counts = new Map<SportKind, number>();
  for (const c of list) counts.set(kindOf(c), (counts.get(kindOf(c)) ?? 0) + 1);
  const order: SportKind[] = ["football", "hockey", "fight", "tennis", "basket", "motor", "other"];
  return { list, kinds: order.filter((k) => counts.has(k)).map((k) => [k, counts.get(k) as number]) };
}
