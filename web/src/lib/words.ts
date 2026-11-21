/** How much of a spoken sentence becomes the title (the same limit the link formatting uses). */
export const VOICE_TITLE_MAX = 80;

/** Cuts at a whole word (never mid-word) and marks the cut with an ellipsis. */
export function truncateAtWord(text: string, max = VOICE_TITLE_MAX): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const head = clean.slice(0, max - 1);
  const space = head.lastIndexOf(' ');
  // A single enormous word has no space to cut at: cut it.
  return `${(space > 0 ? head.slice(0, space) : head).trimEnd()}…`;
}
