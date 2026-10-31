import type { Channel } from "@skmate/core";

const MOVIE_GROUP = /кино|фильм|сериал|movie|film|cinema|series/i;
const MOVIE_NAME = /кино|фильм|movie|film|cinema|cine|сериал|series|\bhbo\b|\bamc\b|premiere/i;
/** How films and series are written in a programme guide: "Х/ф Название", "Т/с …", "Фильм: …". */
const MOVIE_TITLE = /^\s*(х\/ф|т\/с|д\/ф|м\/ф|фильм|кино|сериал|movie|film)(?=$|[\s:«"'.,—-])/i;

/** A channel that is about films and series: its group says so, or its name does. */
export function isMovieChannel(c: Channel): boolean {
  return MOVIE_GROUP.test(c.group) || MOVIE_NAME.test(c.name);
}

/** A programme title written as a film or a series. */
export function isMovieTitle(title: string): boolean {
  return MOVIE_TITLE.test(title);
}
