/** What a viewer can say they like in the first-run questions, and the words that find those categories in a playlist. */
export const INTERESTS: Array<{ id: string; label: "intNews" | "intMovies" | "intSport" | "intMusic" | "intKids" | "intScience" | "intFun"; match: RegExp }> = [
  { id: "news", label: "intNews", match: /новост|news/i },
  { id: "movies", label: "intMovies", match: /кино|фильм|сериал|movie|film|cinema|series/i },
  { id: "sport", label: "intSport", match: /спорт|sport/i },
  { id: "music", label: "intMusic", match: /музык|music/i },
  { id: "kids", label: "intKids", match: /детск|мульт|kids|cartoon/i },
  { id: "science", label: "intScience", match: /познават|наук|science|docu|discovery/i },
  { id: "fun", label: "intFun", match: /развлек|юмор|entertain|comedy/i },
];

/** 0 for a category the viewer likes, 1 for the rest: sorting by this (stably) lifts the liked ones to the top. */
export function interestRank(group: string, liked: readonly string[]): number {
  return INTERESTS.some((i) => liked.includes(i.id) && i.match.test(group)) ? 0 : 1;
}

/** The buffer (seconds) that suits what the viewer says about the connection. */
export function bufferFor(net: "weak" | "normal" | "fast"): 10 | 30 | 60 {
  return net === "weak" ? 60 : net === "fast" ? 10 : 30;
}
