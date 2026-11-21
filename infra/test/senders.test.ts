import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aliasKey, claimIsLive, claimKey, extractClaimCode, newClaimCode } from '../lambda/shared/senders';
import { truncateAtWord } from '../lambda/shared/words';

test('claim codes have the expected shape and are found in a subject', () => {
  for (let i = 0; i < 50; i++) assert.match(newClaimCode(), /^TL-[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(extractClaimCode('Verify tl-abc234 please'), 'TL-ABC234');
  assert.equal(extractClaimCode('Fwd: TL-ABC234'), 'TL-ABC234');
  for (const no of ['hello', 'TL-ABC', 'TL-ABC2345', 'TL-ABCOIL', '', undefined]) assert.equal(extractClaimCode(no), null, String(no));
});

test('claims expire', () => {
  const now = 1_000_000_000_000;
  assert.equal(claimIsLive({ expiresAt: now / 1000 + 60 }, now), true);
  assert.equal(claimIsLive({ expiresAt: now / 1000 - 1 }, now), false);
  assert.equal(claimIsLive({}, now), false);
});

test('keys cannot clash with list address names', () => {
  assert.equal(aliasKey(' Me@Work.COM '), 'alias#me@work.com');
  assert.equal(claimKey('TL-ABC234'), 'claim#TL-ABC234');
});

test('spoken text is cut at whole words', () => {
  assert.equal(truncateAtWord('Buy milk'), 'Buy milk');
  const long = 'remember to call the plumber about the leaking tap in the upstairs bathroom before friday afternoon';
  const cut = truncateAtWord(long);
  assert.ok(cut.length <= 80 && cut.endsWith('…'));
  assert.ok(long.startsWith(cut.slice(0, -1)), 'a prefix of the text');
  assert.equal(long.charAt(cut.length - 1), ' ', 'ends on a word boundary');
  assert.equal(truncateAtWord('x'.repeat(200)).length, 80);
});
