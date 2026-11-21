import { UserError } from './db';

/** Names no list may use: `me` is the personal address, the rest are conventional mailbox names. */
export const RESERVED_MAIL_NAMES = new Set([
  'me', 'postmaster', 'abuse', 'admin', 'administrator', 'root', 'hostmaster', 'webmaster', 'mailer-daemon',
  'noreply', 'no-reply', 'support', 'info', 'inbox', 'list', 'lists', 'tasklister', 'security', 'www',
]);

const NAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,30})[a-z0-9]$/;

/** The lowercase form of a valid list address name, or null. */
export function normalizeMailName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().toLowerCase();
  if (!NAME_RE.test(name) || name.includes('..') || RESERVED_MAIL_NAMES.has(name)) return null;
  return name;
}

/** For the API: explains what is wrong instead of returning null. */
export function cleanMailName(value: unknown): string {
  const name = normalizeMailName(value);
  if (name) return name;
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (RESERVED_MAIL_NAMES.has(raw)) throw new UserError('That name is reserved. Pick another.');
  throw new UserError('Use 3–32 characters: lowercase letters, digits, dot, dash or underscore, starting and ending with a letter or digit.');
}
