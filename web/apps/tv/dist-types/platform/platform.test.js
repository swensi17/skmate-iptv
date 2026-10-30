import { describe, expect, it } from "vitest";
import { detectPlatform } from "./index";
describe("detectPlatform", () => {
    it("recognises webOS and Tizen", () => {
        expect(detectPlatform("Mozilla/5.0 (Web0S; Linux/SmartTV) Chrome/79")).toBe("webos");
        expect(detectPlatform("Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) Chrome/85")).toBe("tizen");
        expect(detectPlatform("Mozilla/5.0 (Macintosh) Chrome/120")).toBe("browser");
    });
});
