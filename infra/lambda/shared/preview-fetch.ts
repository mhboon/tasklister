import * as dns from 'node:dns/promises';
import * as http from 'node:http';
import * as https from 'node:https';
import { isIP } from 'node:net';
import { isPublicAddress, parseFetchableUrl, parsePreview, type LinkPreview } from './preview';

const MAX_HOPS = 3;
const MAX_BYTES = 256 * 1024;
const TOTAL_TIMEOUT_MS = 6000;

const empty = (url: string): LinkPreview => ({ url, title: null, description: null, siteName: null });

/** Resolves the host and returns an address only if every answer is public. */
async function safeAddress(hostname: string): Promise<{ address: string; family: 4 | 6 } | null> {
  const literal = hostname.replace(/^\[|\]$/g, '');
  const answers = isIP(literal) ? [{ address: literal, family: isIP(literal) }] : await dns.lookup(hostname, { all: true });
  if (answers.length === 0 || !answers.every((a) => isPublicAddress(a.address))) return null;
  return { address: answers[0].address, family: answers[0].family as 4 | 6 };
}

/** One request to an address we already checked. Resolves with the status, location and the start of the body. */
function getOnce(u: URL, addr: { address: string; family: 4 | 6 }, signal: AbortSignal): Promise<{ status: number; location?: string; type: string; body: string }> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname.replace(/^\[|\]$/g, ''), // used for Host and TLS SNI
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        headers: { 'User-Agent': 'Tasklister-LinkPreview/1.0', Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' },
        // Connect to the address that was checked, whatever DNS says now.
        lookup: (_h, opts, cb) => {
          if ((opts as { all?: boolean }).all) (cb as unknown as (e: null, a: unknown) => void)(null, [addr]);
          else cb(null, addr.address, addr.family);
        },
        signal,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const type = String(res.headers['content-type'] ?? '');
        if (status !== 200) {
          res.resume();
          resolve({ status, location: res.headers.location, type, body: '' });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          chunks.push(c);
          size += c.length;
          if (size >= MAX_BYTES) {
            res.destroy();
            resolve({ status, type, body: Buffer.concat(chunks).subarray(0, MAX_BYTES).toString('utf8') });
          }
        });
        res.on('end', () => resolve({ status, type, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', () => resolve({ status, type, body: Buffer.concat(chunks).toString('utf8') }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * Looks a shared link up. Never throws: anything unexpected (blocked address,
 * timeout, non-HTML, an error page) gives an empty preview.
 */
export async function fetchPreview(rawUrl: string): Promise<LinkPreview> {
  const signal = AbortSignal.timeout(TOTAL_TIMEOUT_MS);
  try {
    let current = parseFetchableUrl(rawUrl);
    for (let hop = 0; current && hop <= MAX_HOPS; hop++) {
      const addr = await safeAddress(current.hostname);
      if (!addr) return empty(rawUrl);
      const res = await getOnce(current, addr, signal);
      if (res.status >= 300 && res.status < 400 && res.location) {
        // Every hop goes through the same checks again.
        current = parseFetchableUrl(new URL(res.location, current).toString());
        continue;
      }
      if (res.status !== 200 || !/html/i.test(res.type)) return empty(rawUrl);
      return parsePreview(res.body, current.toString());
    }
  } catch {
    // fall through
  }
  return empty(rawUrl);
}
