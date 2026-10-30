import { describe, expect, it } from "vitest";
import { resolveTheme } from "./settings";
describe("resolveTheme", () => {
    it("follows the system by default", () => {
        expect(resolveTheme("system", true)).toBe("dark");
        expect(resolveTheme("system", false)).toBe("light");
    });
    it("an explicit choice wins", () => {
        expect(resolveTheme("light", true)).toBe("light");
        expect(resolveTheme("dark", false)).toBe("dark");
    });
});
