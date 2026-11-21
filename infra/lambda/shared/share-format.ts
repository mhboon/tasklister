/** What a looked-up link yields (the same shape as the `linkPreview` query). */
export interface PreviewText {
  title: string | null;
  description: string | null;
  siteName: string | null;
}

export const TITLE_MAX = 200;
/** How much of the page's own title is kept next to the link. */
export const EXTRACTED_TITLE_MAX = 80;

const URL_ONLY = /^https?:\/\/\S+$/i;

export const isUrlOnly = (text: string): boolean => URL_ONLY.test(text.trim());

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * The item a shared link becomes: the title keeps the link (so it stays
 * clickable) followed by the page's title cut to a sensible length. The notes
 * repeat the page's full title, then its description.
 */
export function composeSharedItem(url: string, p: PreviewText): { title: string; notes: string } | null {
  const full = p.title?.trim();
  if (!full) return null;
  const room = TITLE_MAX - url.length - 1;
  const notes = [full, [p.siteName, p.description].filter(Boolean).join(' – ')].filter(Boolean).join('\n\n');
  if (room < 10) {
    // A very long link leaves no room: the page title is the title, the link goes to the notes.
    return { title: truncate(full, TITLE_MAX), notes: `${url}\n\n${notes}` };
  }
  return { title: `${url} ${truncate(full, Math.min(EXTRACTED_TITLE_MAX, room))}`, notes };
}
