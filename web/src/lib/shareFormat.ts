import type { LinkPreview } from './api';

const TITLE_MAX = 200;
const EXTRACTED_TITLE_MAX = 80;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * The item a shared link becomes: the title keeps the link (so it stays
 * clickable) followed by the page's title cut to a sensible length; the notes
 * repeat the page's full title, then its description. (The same rule is applied
 * for items added by email: keep the two in step.)
 */
export function composeSharedItem(url: string, p: Pick<LinkPreview, 'title' | 'description' | 'siteName'>): { title: string; notes: string } | null {
  const full = p.title?.trim();
  if (!full) return null;
  const room = TITLE_MAX - url.length - 1;
  const notes = [full, [p.siteName, p.description].filter(Boolean).join(' – ')].filter(Boolean).join('\n\n');
  if (room < 10) return { title: truncate(full, TITLE_MAX), notes: `${url}\n\n${notes}` };
  return { title: `${url} ${truncate(full, Math.min(EXTRACTED_TITLE_MAX, room))}`, notes };
}
