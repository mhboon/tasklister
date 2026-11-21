import { BlockList, isIP } from 'node:net';

/** What a shared link turned out to be about. Every field may be empty. */
export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
}

// Anything that is not a normal public internet address.
// Two lists: Node matches an IPv4 address against IPv6 rules as if it were
// IPv4-mapped, so a single list with ::ffff:0:0/96 would block every IPv4.
const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked4.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [
  ['::', 128], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['100::', 64],
  ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) blocked6.addSubnet(net, bits, 'ipv6');

/** True only for an address that is safe for the server to connect to. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return family === 4 ? !blocked4.check(address, 'ipv4') : !blocked6.check(address, 'ipv6');
}

/**
 * A link we are willing to fetch: http(s), default port, no credentials, a
 * real hostname. Returns null otherwise. Addresses are checked separately,
 * after DNS, by isPublicAddress.
 */
export function parseFetchableUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== (u.protocol === 'https:' ? '443' : '80')) return null;
  if (!u.hostname || u.hostname === 'localhost' || u.hostname.endsWith('.localhost')) return null;
  return u;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s: string | undefined, max: number): string | null => {
  const t = s ? decodeEntities(s).replace(/\s+/g, ' ').trim() : '';
  return t ? t.slice(0, max) : null;
};

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

/** Reads the title, description and site name out of the start of an HTML page. */
export function parsePreview(html: string, url: string): LinkPreview {
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, 'property') ?? attr(tag, 'name'))?.toLowerCase();
    const content = attr(tag, 'content');
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
  }
  const docTitle = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return {
    url,
    title: clean(meta.get('og:title') ?? meta.get('twitter:title') ?? docTitle, 200),
    description: clean(meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description'), 1000),
    siteName: clean(meta.get('og:site_name'), 100),
  };
}
