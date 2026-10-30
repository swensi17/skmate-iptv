import { describe, expect, it } from "vitest";
import {
  QueryVariants, MAX_VARIANTS, Rank, damerauLevenshtein, hasCyrillic, normalize, score, searchBy, swapped, toCyrillic, toLatin,
} from "./index";

// The cases mirror SmartSearchTest.kt of the Android app: both must agree.
describe("normalize", () => {
  it("folds case, ё, accents and apostrophes", () => {
    expect(normalize("  ПЕРВЫЙ   Канал ")).toBe("первый канал");
    expect(normalize("Ёлка")).toBe("елка");
    expect(normalize("Café")).toBe("cafe");
    expect(normalize("O‘zbekiston")).toBe("ozbekiston");
    expect(normalize("TV-1000")).toBe("tv 1000");
    expect(normalize("Йошкар-Ола")).toBe("йошкар ола");
    expect(normalize("Ўзбекистон")).toBe("ўзбекистон");
    expect(normalize("--- ")).toBe("");
  });
});

describe("layouts", () => {
  it("recognises a wrong layout", () => {
    expect(swapped("ntktrfyfk")).toBe("телеканал");
    expect(swapped("rjvtlbz")).toBe("комедия");
    expect(swapped("вшысщмукн")).toBe("discovery");
    expect(swapped("1234")).toBeNull();
  });
  it("transliterates both ways", () => {
    expect(toLatin("кино")).toBe("kino");
    expect(toLatin("харкив")).toBe("kharkiv");
    expect(toLatin("хоразм", true)).toBe("xorazm");
    expect(toCyrillic("kino")).toBe("кино");
    expect(toCyrillic("shou")).toBe("шоу");
    expect(toCyrillic("toshkent", true)).toBe("тошкент");
    expect(toCyrillic("hayot", true)).toBe("ҳаёт");
    expect(hasCyrillic("ўзбек")).toBe(true);
  });
});

describe("QueryVariants", () => {
  it("starts with the typed text and stays bounded", () => {
    const v = QueryVariants.of("Ntktrfyfk");
    expect(v.typed).toBe("ntktrfyfk");
    expect(v.all).toContain("телеканал");
    expect(v.all.length).toBeLessThanOrEqual(MAX_VARIANTS);
    expect(new Set(v.all).size).toBe(v.all.length);
    expect(QueryVariants.of("   ").all).toEqual([]);
  });
  it("covers transliteration", () => {
    expect(QueryVariants.of("kino").all).toContain("кино");
    expect(QueryVariants.of("КИНО").all).toContain("kino");
  });
});

describe("rank", () => {
  const s = (name: string, q: string) => score(normalize(name), QueryVariants.of(q).all);
  it("orders exact, prefix, word prefix, substring", () => {
    expect(s("Disc", "disc")).toBe(Rank.EXACT);
    expect(s("Discovery Channel", "disc")).toBe(Rank.PREFIX);
    expect(s("Animal Discovery", "disc")).toBe(Rank.WORD_PREFIX);
    expect(s("Nordisc", "disc")).toBe(Rank.SUBSTRING);
    expect(s("Sports", "disc")).toBeNull();
  });
  it("matches across layout and case", () => {
    expect(s("ПЕРВЫЙ КАНАЛ HD", "gthdsq")).toBe(Rank.PREFIX);
    expect(s("Кино ТВ", "KINO")).toBe(Rank.PREFIX);
    expect(s("Ёлки", "елки")).toBe(Rank.EXACT);
  });
  it("allows one typo from four letters, two from eight", () => {
    expect(s("Discovery", "dsicovery")).toBe(Rank.FUZZY);
    expect(s("Discovery Channel", "discovry")).toBe(Rank.FUZZY);
    expect(s("National Geographic", "natinoal geografic")).toBe(Rank.FUZZY);
    expect(s("Sport", "spot")).toBe(Rank.FUZZY);
    expect(s("Sport", "spxt")).toBeNull();
    expect(s("Discovery", "dxxcovery")).toBe(Rank.FUZZY);
    expect(s("Discovery", "dxxxovery")).toBeNull();
  });
  it("ranks multi-word prefixes", () => {
    expect(s("Discovery Channel HD", "disc ch")).toBe(Rank.WORD_PREFIX);
    expect(s("Discovery Channel HD", "ch disc")).toBe(Rank.WORD_PREFIX);
  });
  it("computes Damerau-Levenshtein distance", () => {
    expect(damerauLevenshtein("abc", "abc")).toBe(0);
    expect(damerauLevenshtein("abc", "acb")).toBe(1);
    expect(damerauLevenshtein("abc", "abcd")).toBe(1);
    expect(damerauLevenshtein("kitten", "sittin")).toBe(2);
    expect(damerauLevenshtein("abcdef", "xbcdyf", 1)).toBe(2);
  });
});

describe("searchBy", () => {
  const items = ["Nordisc", "Discovery", "Animal Discovery", "Sports"].map((name) => ({ name }));
  it("puts better matches first and keeps ties in order", () => {
    expect(searchBy(items, "disc", (i) => i.name).map((r) => r.item.name)).toEqual(["Discovery", "Animal Discovery", "Nordisc"]);
  });
});
