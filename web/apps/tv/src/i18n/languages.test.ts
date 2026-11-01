import { describe, expect, it } from "vitest";
import { en } from "./en";

// Every language file next to en.ts: the same keys as English, the same {placeholders} in each string, none empty.
// A translation that drops "{n}" would show "channels" without the number; one that adds "{x}" would show nothing.
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
const modules = import.meta.glob<Record<string, Record<string, string>>>("./*.ts", { eager: true });
const tables = Object.entries(modules)
  .filter(([path]) => /\/[a-z]{2}(-[A-Z]{2})?\.ts$/.test(path) && !path.endsWith("/en.ts"))
  .map(([path, mod]) => [path.slice(2), Object.values(mod)[0] as Record<string, string>] as const);

describe.each(tables)("%s", (_file, table) => {
  it("is complete and keeps every placeholder", () => {
    expect(Object.keys(table).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(en)) {
      expect(typeof table[key], key).toBe("string");
      expect((table[key] as string).trim().length, key).toBeGreaterThan(0);
      expect(placeholders(table[key] as string), key).toEqual(placeholders(value));
    }
  });
});
