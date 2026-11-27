import { describe, expect, it } from "vitest";
import { avatarSrc, AVATAR_COUNT } from "./avatars";

describe("avatars (OwnTVAvatars)", () => {
  it("has the seven of the Android app, an id wraps into the set, -1 / none is no avatar", () => {
    expect(AVATAR_COUNT).toBe(7);
    expect(avatarSrc(-1)).toBeNull();
    expect(avatarSrc(undefined)).toBeNull();
    expect(avatarSrc(7)).toBe(avatarSrc(0));
    expect(avatarSrc(3)).not.toBeNull();
  });
});
