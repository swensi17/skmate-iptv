import { describe, expect, it, vi } from "vitest";
import { PlayFailure, type PlayerEngine, type Source } from "./engine";
import { PlayerLadder } from "./ladder";

const video = {} as HTMLVideoElement;
const src: Source = { url: "http://h/1.m3u8" };

function fake(id: string, behaviour: "ok" | "fail" | "hang" | "unsupported"): PlayerEngine & { stops: number } {
  const e = {
    id, stops: 0,
    supports: () => behaviour !== "unsupported",
    start: () => behaviour === "ok" ? Promise.resolve()
      : behaviour === "fail" ? Promise.reject(new PlayFailure(id, "error"))
      : new Promise<void>(() => undefined),
    stop() { e.stops++; },
  };
  return e;
}

describe("PlayerLadder", () => {
  it("plays with the first engine that works", async () => {
    const a = fake("a", "ok");
    const ladder = new PlayerLadder([a, fake("b", "ok")]);
    expect((await ladder.play(video, src)).id).toBe("a");
    expect(ladder.current?.id).toBe("a");
  });

  it("moves to the next engine after a failure and stops the failed one", async () => {
    const a = fake("a", "fail");
    const b = fake("b", "ok");
    const fails: string[] = [];
    const ladder = new PlayerLadder([a, b], { onFail: (f) => fails.push(f.engineId) });
    expect((await ladder.play(video, src)).id).toBe("b");
    expect(fails).toEqual(["a"]);
    expect(a.stops).toBe(1);
  });

  it("skips engines that do not support the source", async () => {
    const tried: string[] = [];
    const ladder = new PlayerLadder([fake("a", "unsupported"), fake("b", "ok")], { onTry: (id) => tried.push(id) });
    await ladder.play(video, src);
    expect(tried).toEqual(["b"]);
  });

  it("gives up on an engine that hangs", async () => {
    vi.useFakeTimers();
    const ladder = new PlayerLadder([fake("a", "hang"), fake("b", "ok")], {}, { openTimeoutMs: 1000 });
    const result = ladder.play(video, src);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await result).id).toBe("b");
    vi.useRealTimers();
  });

  it("reports the last failure when nothing plays", async () => {
    const ladder = new PlayerLadder([fake("a", "fail"), fake("b", "fail")]);
    await expect(ladder.play(video, src)).rejects.toMatchObject({ engineId: "b", reason: "error" });
  });

  it("reports unsupported when no engine can try", async () => {
    await expect(new PlayerLadder([fake("a", "unsupported")]).play(video, src)).rejects.toMatchObject({ reason: "unsupported" });
  });

  it("a newer request replaces the one in progress", async () => {
    vi.useFakeTimers();
    const slow = fake("slow", "hang");
    const ladder = new PlayerLadder([slow], {}, { openTimeoutMs: 1000 });
    const first = ladder.play(video, src).catch((e: PlayFailure) => e);
    ladder.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await first).toBeInstanceOf(PlayFailure);
    vi.useRealTimers();
  });
});
