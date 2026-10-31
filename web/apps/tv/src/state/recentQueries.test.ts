import { describe, expect, it } from "vitest";
import { MAX_QUERIES, pushQuery } from "./recentQueries";

describe("recent queries", () => {
  it("puts the latest first and does not repeat, whatever the case", () => {
    expect(pushQuery(["футбол", "кино"], "Кино")).toEqual(["Кино", "футбол"]);
  });
  it("ignores a query that is too short and is capped", () => {
    expect(pushQuery(["а1"], "я")).toEqual(["а1"]);
    const full = Array.from({ length: MAX_QUERIES }, (_, i) => `запрос ${i}`);
    expect(pushQuery(full, "новый")).toHaveLength(MAX_QUERIES);
  });
});
