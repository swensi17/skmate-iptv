/** Provider groups often come in lower case ("новости"); the screen shows them as titles. */
export function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}
