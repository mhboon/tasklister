import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress, parseFetchableUrl, parsePreview, decodeEntities } from '../lambda/shared/preview';

test('public addresses are allowed, internal ones are not', () => {
  for (const ok of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111']) assert.equal(isPublicAddress(ok), true, ok);
  for (const bad of [
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'not-an-ip',
  ]) assert.equal(isPublicAddress(bad), false, bad);
});

test('only plain http(s) links on the default port are fetchable', () => {
  assert.ok(parseFetchableUrl('https://example.com/a?b=1'));
  assert.ok(parseFetchableUrl('http://example.com:80/'));
  for (const bad of ['ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'https://user:pw@example.com/',
    'https://example.com:8443/', 'http://localhost/', 'http://app.localhost/', 'nonsense', '']) {
    assert.equal(parseFetchableUrl(bad), null, bad);
  }
});

test('Open Graph tags win over the page title', () => {
  const html = `<html><head><title>Fallback</title>
    <meta property="og:title" content="A &amp; B &#39;post&#39;">
    <meta content="Nice &quot;thing&quot;" property='og:description'>
    <meta property="og:site_name" content="Example"></head></html>`;
  assert.deepEqual(parsePreview(html, 'https://e.com'), {
    url: 'https://e.com', title: "A & B 'post'", description: 'Nice "thing"', siteName: 'Example',
  });
});

test('falls back to the title tag and meta description', () => {
  const html = '<title>\n  Plain page \n</title><meta name="description" content="About it">';
  const p = parsePreview(html, 'https://e.com');
  assert.equal(p.title, 'Plain page');
  assert.equal(p.description, 'About it');
  assert.equal(p.siteName, null);
});

test('a page with nothing useful gives empty fields', () => {
  assert.deepEqual(parsePreview('<html></html>', 'https://e.com'), { url: 'https://e.com', title: null, description: null, siteName: null });
});

test('entities decode, unknown ones are left alone', () => {
  assert.equal(decodeEntities('a&amp;b &lt;c&gt; &#x41;&#66; &bogus; &#99999999;'), 'a&b <c> AB &bogus; &#99999999;');
});
