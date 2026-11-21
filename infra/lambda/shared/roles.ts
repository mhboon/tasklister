import type { Role } from './types';

const RANK: Record<Role, number> = { GUEST: 0, USER: 1, ADMIN: 2 };

/** Roles change one step at a time: guest ⇄ user ⇄ admin. */
export function isAllowedRoleChange(from: Role, to: Role): boolean {
  return Math.abs(RANK[from] - RANK[to]) === 1;
}
