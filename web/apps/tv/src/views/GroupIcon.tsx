import { Icon, type IconName } from "@skmate/ui";

const OF: Record<string, IconName> = { "~all": "live_tv", "~fav": "favorite", "~recent": "history", "~archive": "clock" };

/** The mark of a category row: a TV for all channels, a heart, a clock, a folder for a provider's group. */
export function GroupIcon({ id }: { id: string }) {
  return <Icon name={OF[id] ?? "folder"} size={32} />;
}
