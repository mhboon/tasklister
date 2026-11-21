import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareText } from '../lambda/shared/text';

test('compareText ignores case', () => {
  assert.deepEqual(['banana', 'Apple', 'cherry', 'apple2'].sort(compareText), ['Apple', 'apple2', 'banana', 'cherry']);
});

test('compareText treats different casing as equal', () => {
  assert.equal(compareText('Inbox', 'inbox'), 0);
});
