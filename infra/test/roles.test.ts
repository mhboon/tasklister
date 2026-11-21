import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedRoleChange } from '../lambda/shared/roles';

test('admin can demote admin to user, promote guest to user and user to admin', () => {
  assert.equal(isAllowedRoleChange('ADMIN', 'USER'), true);
  assert.equal(isAllowedRoleChange('GUEST', 'USER'), true);
  assert.equal(isAllowedRoleChange('USER', 'ADMIN'), true);
});

test('user can be demoted to guest', () => {
  assert.equal(isAllowedRoleChange('USER', 'GUEST'), true);
});

test('roles cannot skip a step', () => {
  assert.equal(isAllowedRoleChange('GUEST', 'ADMIN'), false);
  assert.equal(isAllowedRoleChange('ADMIN', 'GUEST'), false);
});
