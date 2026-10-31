/** Provider groups often come in lower case ("новости"); the screen shows them as titles. */
export function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

const isLetter = (c: string) => c.toLowerCase() !== c.toUpperCase();

const QUALITY = /^(hd|uhd|fhd|sd|4k|8k|tv|тв|\+\d+)$/i;

/**
 * Up to two capital letters of a channel name: "Первый канал HD" → "ПК", "BBC Scotland" → "BS";
 * a one-word name gives its first two letters ("Россия 1 UHD" → "РО"), quality tags (HD, UHD) never count.
 */
export function monogram(name: string): string {
  const words = name.split(/[\s\-_.,:;()[\]/+]+/).filter((w) => Array.from(w).some(isLetter) && !QUALITY.test(w));
  const first = words[0] ?? name;
  const letters = (w: string) => Array.from(w).filter(isLetter);
  if (words.length >= 2) return (letters(first)[0] ?? "").toUpperCase() + (letters(words[1] as string)[0] ?? "").toUpperCase();
  return letters(first).slice(0, 2).join("").toUpperCase() || name.charAt(0).toUpperCase();
}

/** A hue from the name, so one channel always gets the same colour. */
export function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}
