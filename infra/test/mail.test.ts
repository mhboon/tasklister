import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMailName } from '../lambda/shared/mailnames';
import { composeSharedItem, isUrlOnly } from '../lambda/shared/share-format';
import { buildItemText, cleanSubject, isAuthentic, localPartAt, needsLookup, parseAddress } from '../lambda/shared/inbound';

test('list names: valid ones are lowercased, bad and reserved ones refused', () => {
  assert.equal(normalizeMailName(' Groceries '), 'groceries');
  assert.equal(normalizeMailName('home.todo-1'), 'home.todo-1');
  for (const bad of ['ab', 'a'.repeat(33), '-start', 'end-', 'has space', 'a..b', 'ünï', 'me', 'Postmaster', 'a@b', '', null, 5]) {
    assert.equal(normalizeMailName(bad), null, String(bad));
  }
});

test('addresses are parsed from header values', () => {
  assert.equal(parseAddress('Jane Doe <Jane@Example.COM>'), 'jane@example.com');
  assert.equal(parseAddress('jane@example.com'), 'jane@example.com');
  assert.equal(parseAddress('not an address'), null);
  assert.equal(parseAddress(undefined), null);
});

test('only addresses at our mail domain have a local part', () => {
  assert.equal(localPartAt('Me@Lists.Example.com', 'lists.example.com'), 'me');
  assert.equal(localPartAt('groceries@lists.example.com', 'lists.example.com'), 'groceries');
  assert.equal(localPartAt('me@evil.com', 'lists.example.com'), null);
  assert.equal(localPartAt('me@sub.lists.example.com', 'lists.example.com'), null);
});

const v = (status: string) => ({ status }) as never;
test('authenticity needs DMARC pass and clean scans', () => {
  assert.equal(isAuthentic({ dmarcVerdict: v('PASS'), spamVerdict: v('PASS'), virusVerdict: v('PASS') }), true);
  assert.equal(isAuthentic({ dmarcVerdict: v('PASS'), spamVerdict: v('GRAY'), virusVerdict: v('PASS') }), true);
  assert.equal(isAuthentic({ dmarcVerdict: v('FAIL'), spamVerdict: v('PASS'), virusVerdict: v('PASS') }), false);
  assert.equal(isAuthentic({ dmarcVerdict: v('GRAY'), spamVerdict: v('PASS'), virusVerdict: v('PASS') }), false);
  assert.equal(isAuthentic({ dmarcVerdict: v('PASS'), spamVerdict: v('FAIL'), virusVerdict: v('PASS') }), false);
  assert.equal(isAuthentic({ dmarcVerdict: v('PASS'), spamVerdict: v('PASS'), virusVerdict: v('FAIL') }), false);
});

test('subjects lose Fwd:/Re: prefixes', () => {
  assert.equal(cleanSubject('Fwd: RE: Fw:  Buy  milk '), 'Buy milk');
  assert.equal(cleanSubject('Refund policy'), 'Refund policy');
});

test('subject is the title and the body (minus signature) the notes', () => {
  assert.deepEqual(buildItemText('Fwd: Call plumber', 'Tomorrow morning\r\n\r\n-- \nSent from my phone'), {
    title: 'Call plumber', notes: 'Tomorrow morning',
  });
});

test('without a subject the first line of the body is the title', () => {
  assert.deepEqual(buildItemText('', 'Buy bread\nand butter'), { title: 'Buy bread', notes: 'and butter' });
});

test('a link alone is looked up; a link with notes or a plain title is not', () => {
  const a = buildItemText('', 'https://example.com/a');
  assert.deepEqual(a, { title: 'https://example.com/a', notes: '' });
  assert.equal(needsLookup(a.title, a.notes), true);
  const b = buildItemText('Read this', 'https://example.com/a');
  assert.deepEqual(b, { title: 'Read this', notes: 'https://example.com/a' });
  assert.equal(needsLookup(b.title, b.notes), false);
  assert.equal(needsLookup('https://example.com', 'some note'), false);
  assert.equal(needsLookup('Buy milk', ''), false);
  assert.equal(isUrlOnly('https://example.com/a b'), false);
});

test('a shared link keeps the link, a cut page title, and the full title in the notes', () => {
  const long = 'A very long page title '.repeat(10).trim();
  const r = composeSharedItem('https://example.com/x', { title: long, description: 'About it', siteName: 'Example' })!;
  assert.ok(r.title.startsWith('https://example.com/x A very long'));
  assert.ok(r.title.length <= 200);
  assert.ok(r.title.endsWith('…'));
  assert.equal(r.notes, `${long}\n\nExample – About it`);
});

test('a short page title is not cut, and no title means no item', () => {
  assert.equal(composeSharedItem('https://e.com', { title: 'Hi', description: null, siteName: null })!.title, 'https://e.com Hi');
  assert.equal(composeSharedItem('https://e.com', { title: null, description: 'x', siteName: null }), null);
});

test('a very long link leaves no room: the page title becomes the title', () => {
  const url = `https://example.com/${'a'.repeat(200)}`;
  const r = composeSharedItem(url, { title: 'Page', description: null, siteName: null })!;
  assert.equal(r.title, 'Page');
  assert.ok(r.notes.startsWith(url));
});

import { buildUserExport } from '../lambda/shared/user-export';

test('the user export carries role, status and enabled state, sorted by email', () => {
  const u = (sub: string, email: string, extra = {}) =>
    ({ Username: email, Attributes: [{ Name: 'sub', Value: sub }, { Name: 'email', Value: email }], UserStatus: 'CONFIRMED', Enabled: true, ...extra }) as never;
  const rows = buildUserExport(
    [u('3', 'zed@x.com'), u('1', 'amy@x.com'), u('2', 'bob@x.com', { Enabled: false, UserStatus: 'FORCE_CHANGE_PASSWORD' })],
    new Set(['1']),
    new Set(['2'])
  );
  assert.deepEqual(rows.map((r) => [r.email, r.role, r.enabled, r.status]), [
    ['amy@x.com', 'ADMIN', true, 'CONFIRMED'],
    ['bob@x.com', 'USER', false, 'FORCE_CHANGE_PASSWORD'],
    ['zed@x.com', 'GUEST', true, 'CONFIRMED'],
  ]);
});
