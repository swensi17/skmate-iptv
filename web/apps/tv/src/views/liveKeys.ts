/**
 * Settings > Remote buttons, as the Android player reads them (engine/core LiveKeys.kt, player/PlayerHud.kt:660-770): the
 * job the viewer gave OK and the arrows on a channel. The page stores the label key of the chosen action per key
 * (`ok`, `up`, `down`, `left`, `right`); a key left alone does what it always did.
 */
export type LiveKeyName = "ok" | "up" | "down" | "left" | "right";
export type LiveJob = "info" | "list" | "history" | "next" | "previous" | "last" | "rewind" | "forward" | "pause" | "nothing";

/** LiveKeyMap.defaultFor: OK info, ▲ next channel, ▼ previous channel, ◀ the list, ▶ the history. */
export const LIVE_KEY_DEFAULT: Record<LiveKeyName, LiveJob> = { ok: "info", up: "next", down: "previous", left: "list", right: "history" };

const BY_LABEL: Record<string, LiveJob> = {
  sa_settings_live_key_action_info: "info",
  sa_settings_live_key_action_list: "list",
  sa_settings_live_key_action_history: "history",
  sa_settings_live_key_action_next: "next",
  sa_settings_live_key_action_previous: "previous",
  sa_settings_live_key_action_last: "last",
  sa_settings_live_key_action_rewind: "rewind",
  sa_settings_live_key_action_forward: "forward",
  sa_settings_live_key_action_pause: "pause",
  sa_settings_live_key_action_nothing: "nothing",
};

/** What the viewer chose for [key] (the key's usual job when nothing, or something unknown, is stored). */
export function liveKeyJob(map: Record<string, string> | undefined, key: LiveKeyName): LiveJob {
  return BY_LABEL[map?.[key] ?? ""] ?? LIVE_KEY_DEFAULT[key];
}

/** LiveKeyMap.isCustom: something other than the key's usual job. */
export function liveKeyIsCustom(map: Record<string, string> | undefined, key: LiveKeyName): boolean {
  return liveKeyJob(map, key) !== LIVE_KEY_DEFAULT[key];
}

/**
 * Whether the viewer's job applies now (PlayerHud.kt:`free`): with the controls hidden always; on the info line for OK and
 * the sideways arrows (▲ ▼ move through the controls there). The timeline and the tiles keep their keys.
 */
export function liveKeyFree(shown: boolean, step: "info" | "seek" | "tiles", key: LiveKeyName): boolean {
  return !shown || (step === "info" && key !== "up" && key !== "down");
}

/** LIVE_KEY_REPEATS: a held key goes on zapping and rewinding; the other jobs happen once. */
export function liveJobRepeats(job: LiveJob): boolean {
  return job === "next" || job === "previous" || job === "rewind" || job === "forward";
}
