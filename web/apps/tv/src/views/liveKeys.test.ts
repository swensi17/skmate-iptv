import { describe, expect, it } from "vitest";
import { liveJobRepeats, liveKeyFree, liveKeyIsCustom, liveKeyJob } from "./liveKeys";

describe("live keys (Settings > Remote buttons)", () => {
  it("a key left alone does its usual job (Android: OK info, up next, down previous, left list, right history)", () => {
    expect(liveKeyJob({}, "ok")).toBe("info");
    expect(liveKeyJob({}, "up")).toBe("next");
    expect(liveKeyJob({}, "down")).toBe("previous");
    expect(liveKeyJob({}, "left")).toBe("list");
    expect(liveKeyJob(undefined, "right")).toBe("history");
    expect(liveKeyIsCustom({}, "ok")).toBe(false);
  });
  it("reads the stored action and ignores what it does not know", () => {
    const map = { ok: "sa_settings_live_key_action_pause", up: "sa_settings_live_key_action_next", left: "nonsense" };
    expect(liveKeyJob(map, "ok")).toBe("pause");
    expect(liveKeyIsCustom(map, "ok")).toBe(true);
    expect(liveKeyIsCustom(map, "up")).toBe(false); // the usual job chosen again is not custom
    expect(liveKeyJob(map, "left")).toBe("list");
  });
  it("applies with the controls hidden, and on the info for OK and the sideways arrows only", () => {
    expect(liveKeyFree(false, "info", "up")).toBe(true);
    expect(liveKeyFree(true, "info", "ok")).toBe(true);
    expect(liveKeyFree(true, "info", "left")).toBe(true);
    expect(liveKeyFree(true, "info", "up")).toBe(false);
    expect(liveKeyFree(true, "tiles", "ok")).toBe(false);
    expect(liveKeyFree(true, "seek", "left")).toBe(false);
  });
  it("a held key repeats only for zapping and rewinding", () => {
    expect(liveJobRepeats("next")).toBe(true);
    expect(liveJobRepeats("rewind")).toBe(true);
    expect(liveJobRepeats("info")).toBe(false);
    expect(liveJobRepeats("pause")).toBe(false);
  });
});
