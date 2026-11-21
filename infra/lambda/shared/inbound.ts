import type { SESReceipt } from 'aws-lambda';
import { TITLE_MAX, isUrlOnly } from './share-format';
import { NOTES_MAX } from './validate';

/** `Jane <Jane@Example.com>` or `jane@example.com` → `jane@example.com`; null if there is no address. */
export function parseAddress(value: string | undefined): string | null {
  if (!value) return null;
  const angle = /<([^<>\s]+)>/.exec(value);
  const addr = (angle ? angle[1] : value).trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr) ? addr : null;
}

/** The part before the @ of an address at our mail domain; null for any other domain. */
export function localPartAt(address: string, domain: string): string | null {
  const addr = parseAddress(address);
  if (!addr) return null;
  const at = addr.lastIndexOf('@');
  return addr.slice(at + 1) === domain.toLowerCase() ? addr.slice(0, at) : null;
}

/**
 * The mail is genuine: the sender's domain passes DMARC (which ties the visible
 * From address to a passing SPF or DKIM check) and spam and virus scans did not
 * fail. Passing SPF/DKIM alone is not enough: it can be for the attacker's own domain.
 */
export function isAuthentic(r: Pick<SESReceipt, 'dmarcVerdict' | 'spamVerdict' | 'virusVerdict'>): boolean {
  return r.dmarcVerdict?.status === 'PASS' && r.spamVerdict?.status !== 'FAIL' && r.virusVerdict?.status !== 'FAIL';
}

const PREFIX = /^\s*(?:(?:fwd?|re)\s*:\s*)+/i;

export function cleanSubject(subject: string | undefined): string {
  return (subject ?? '').replace(PREFIX, '').replace(/\s+/g, ' ').trim();
}

function cut(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Title and notes for an email: the subject (without Fwd:/Re:) is the title and
 * the plain-text body, without a trailing signature, is the notes. With no
 * subject the first line of the body is the title.
 */
export function buildItemText(subject: string | undefined, body: string | undefined): { title: string; notes: string } {
  let text = (body ?? '').replace(/\r\n?/g, '\n');
  const sig = /^-- ?$/m.exec(text);
  if (sig) text = text.slice(0, sig.index);
  text = text.trim();

  let title = cleanSubject(subject);
  if (!title) {
    const [first, ...rest] = text.split('\n');
    title = first.trim();
    text = rest.join('\n').trim();
  }
  return { title: cut(title, TITLE_MAX), notes: cut(text, NOTES_MAX) };
}

/** A link on its own, with nothing else to say about it: worth looking up. */
export const needsLookup = (title: string, notes: string): boolean => !notes.trim() && isUrlOnly(title);
