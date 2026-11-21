import { randomInt } from 'node:crypto';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminSetUserPasswordCommand,
  AdminDisableUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminEnableUserCommand,
  AdminUserGlobalSignOutCommand,
  ListUsersCommand,
  ListUsersInGroupCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import { GetCommand, PutCommand, ScanCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables, nowIso, UserError, queryAll } from '../../shared/db';
import { inboxId, requireAdmin, requireUser } from '../../shared/access';
import { isAllowedRoleChange } from '../../shared/roles';
import { compareText } from '../../shared/text';
import { normEmail, cleanName } from '../../shared/validate';
import type { Ctx, Role, UserRow } from '../../shared/types';

const cognito = new CognitoIdentityProviderClient({});
const poolId = () => {
  const v = process.env.USER_POOL_ID;
  if (!v) throw new Error('Missing USER_POOL_ID');
  return v;
};

const ensured = new Set<string>();

/** Creates the Users row and Inbox on first contact (idempotent). */
export async function ensureUser(ctx: Ctx, displayName?: string): Promise<UserRow> {
  const existing = (await ddb.send(new GetCommand({ TableName: tables.users, Key: { userId: ctx.userId } }))).Item as
    | UserRow
    | undefined;
  if (existing && ensured.has(ctx.userId)) return existing;

  const row: UserRow = existing ?? {
    userId: ctx.userId,
    email: ctx.email,
    displayName: displayName ?? ctx.email.split('@')[0],
    createdAt: nowIso(),
  };
  if (!existing) {
    await ddb
      .send(new PutCommand({ TableName: tables.users, Item: row, ConditionExpression: 'attribute_not_exists(userId)' }))
      .catch((e) => {
        if (e.name !== 'ConditionalCheckFailedException') throw e; // raced with another request
      });
  }
  // Guests have no Inbox of their own: they only see lists shared with them.
  if (ctx.role !== 'GUEST') await ensureInbox(ctx.userId);
  ensured.add(ctx.userId);
  return row;
}

async function ensureInbox(userId: string): Promise<void> {
  const listId = inboxId(userId);
  await ddb
    .send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tables.lists,
              Item: { listId, ownerId: userId, name: 'Inbox', isInbox: true, createdAt: nowIso() },
              ConditionExpression: 'attribute_not_exists(listId)',
            },
          },
          {
            Put: {
              TableName: tables.members,
              Item: { userId, listId, role: 'OWNER' },
              ConditionExpression: 'attribute_not_exists(userId)',
            },
          },
        ],
      })
    )
    .catch((e) => {
      if (e.name !== 'TransactionCanceledException') throw e; // already exists
    });
}

function toUser(row: UserRow, role: Role, enabled = true) {
  return { userId: row.userId, email: row.email, displayName: row.displayName, role, isAdmin: role === 'ADMIN', enabled };
}

const GROUP_FOR: Record<Role, string | null> = { ADMIN: 'Admins', USER: 'Users', GUEST: null };
const subOf = (u: UserType) => u.Attributes?.find((a) => a.Name === 'sub')?.Value;

async function groupSubs(groupName: string): Promise<Set<string | undefined>> {
  const members = await allCognito<UserType>(async (t) => {
    const r = await cognito.send(new ListUsersInGroupCommand({ UserPoolId: poolId(), GroupName: groupName, NextToken: t }));
    return { items: r.Users ?? [], next: r.NextToken };
  });
  return new Set(members.map(subOf));
}

/** Everyone's role, read from the Cognito groups (the source of truth). */
async function rolesBySub(): Promise<(sub: string) => Role> {
  const [admins, users] = await Promise.all([groupSubs('Admins'), groupSubs('Users')]);
  return (sub) => (admins.has(sub) ? 'ADMIN' : users.has(sub) ? 'USER' : 'GUEST');
}

export async function me(ctx: Ctx) {
  const row = await ensureUser(ctx);
  return toUser(row, ctx.role);
}

async function allCognito<T>(fn: (token?: string) => Promise<{ items: T[]; next?: string }>): Promise<T[]> {
  const out: T[] = [];
  let token: string | undefined;
  do {
    const { items, next } = await fn(token);
    out.push(...items);
    token = next;
  } while (token);
  return out;
}

export async function listUsers(ctx: Ctx) {
  // Users need the list to pick who to share with; guests don't.
  requireUser(ctx);
  const users = await allCognito<UserType>(async (t) => {
    const r = await cognito.send(new ListUsersCommand({ UserPoolId: poolId(), PaginationToken: t }));
    return { items: r.Users ?? [], next: r.PaginationToken };
  });
  const roleOf = await rolesBySub();
  const rows = await queryAllUsers();
  const byId = new Map(rows.map((r) => [r.userId, r]));
  return users
    .map((u) => {
      const sub = subOf(u) ?? '';
      const email = u.Attributes?.find((a) => a.Name === 'email')?.Value ?? '';
      const row = byId.get(sub) ?? { userId: sub, email, displayName: email.split('@')[0], createdAt: '' };
      return toUser(row, roleOf(sub), u.Enabled !== false);
    })
    .sort((a, b) => compareText(a.email, b.email));
}

async function queryAllUsers(): Promise<UserRow[]> {
  // Tiny table (family-sized); a Scan is the simplest correct read.
  const out: UserRow[] = [];
  let key: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(new ScanCommand({ TableName: tables.users, ExclusiveStartKey: key }));
    out.push(...((r.Items ?? []) as UserRow[]));
    key = r.LastEvaluatedKey;
  } while (key);
  return out;
}

/** 16 chars with upper, lower, digit and symbol — satisfies the pool policy. */
function temporaryPassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!#$%*?'];
  const all = sets.join('');
  const chars = sets.map((s) => s[randomInt(s.length)]);
  while (chars.length < 16) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export async function createUser(ctx: Ctx, args: { email: string; displayName: string; role: Role }) {
  requireAdmin(ctx);
  const email = normEmail(args.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new UserError('Enter a valid email address.');
  const displayName = cleanName(args.displayName, 'Name');
  const password = temporaryPassword();

  let created;
  try {
    created = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: poolId(),
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
        ],
        TemporaryPassword: password,
        MessageAction: 'SUPPRESS', // nothing is emailed; the admin hands over the password
      })
    );
  } catch (e) {
    if ((e as Error).name === 'UsernameExistsException') throw new UserError('That email is already registered.');
    throw e;
  }
  const sub = created.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
  if (!sub) throw new Error('Cognito did not return a user id.');
  const role = cleanRole(args.role);
  const group = GROUP_FOR[role];
  if (group) {
    await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: poolId(), Username: email, GroupName: group }));
  }
  const row: UserRow = { userId: sub, email, displayName, createdAt: nowIso() };
  await ddb.send(new PutCommand({ TableName: tables.users, Item: row }));
  if (role !== 'GUEST') await ensureInbox(sub);
  return { user: toUser(row, role), temporaryPassword: password };
}

function cleanRole(value: unknown): Role {
  if (value !== 'ADMIN' && value !== 'USER' && value !== 'GUEST') throw new UserError('Invalid role.');
  return value;
}

async function userById(userId: string): Promise<UserRow> {
  const row = (await ddb.send(new GetCommand({ TableName: tables.users, Key: { userId } }))).Item as UserRow | undefined;
  if (!row) throw new UserError('User not found.');
  return row;
}

/** Admins are peers: one admin can't lock out or take over another. */
async function requireNotOtherAdmin(ctx: Ctx, target: UserRow, what: string): Promise<void> {
  if (target.userId === ctx.userId) return;
  if ((await groupSubs('Admins')).has(target.userId)) throw new UserError(`You can't ${what} another admin.`);
}

export async function resetUserPassword(ctx: Ctx, args: { userId: string }) {
  requireAdmin(ctx);
  const row = await userById(args.userId);
  await requireNotOtherAdmin(ctx, row, "reset the password of");
  const password = temporaryPassword();
  // Permanent:false → the user must pick their own password at next sign-in.
  await cognito.send(
    new AdminSetUserPasswordCommand({ UserPoolId: poolId(), Username: row.email, Password: password, Permanent: false })
  );
  return { user: toUser(row, (await rolesBySub())(row.userId)), temporaryPassword: password };
}

export async function setUserEnabled(ctx: Ctx, args: { userId: string; enabled: boolean }) {
  requireAdmin(ctx);
  if (args.userId === ctx.userId && !args.enabled) throw new UserError("You can't disable your own account.");
  const row = await userById(args.userId);
  await requireNotOtherAdmin(ctx, row, 'disable or re-enable');
  if (args.enabled) {
    await cognito.send(new AdminEnableUserCommand({ UserPoolId: poolId(), Username: row.email }));
  } else {
    await cognito.send(new AdminDisableUserCommand({ UserPoolId: poolId(), Username: row.email }));
    await cognito.send(new AdminUserGlobalSignOutCommand({ UserPoolId: poolId(), Username: row.email }));
  }
  return toUser(row, (await rolesBySub())(row.userId), args.enabled);
}

/**
 * Admin only, one step at a time (guest ⇄ user ⇄ admin). The person is signed
 * out so the new role (read from the sign-in token) applies at once.
 */
export async function setUserRole(ctx: Ctx, args: { userId: string; role: Role }) {
  requireAdmin(ctx);
  const target = cleanRole(args.role);
  if (args.userId === ctx.userId) throw new UserError("You can't change your own role.");
  const row = await userById(args.userId);
  const current = (await rolesBySub())(row.userId);
  if (current === target) return toUser(row, current);
  if (!isAllowedRoleChange(current, target)) {
    throw new UserError('Change a role one step at a time: guest ⇄ user ⇄ admin.');
  }
  const Username = row.email;
  const newGroup = GROUP_FOR[target];
  const oldGroup = GROUP_FOR[current];
  if (newGroup) await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: poolId(), Username, GroupName: newGroup }));
  if (oldGroup) await cognito.send(new AdminRemoveUserFromGroupCommand({ UserPoolId: poolId(), Username, GroupName: oldGroup }));
  if (target !== 'GUEST') await ensureInbox(row.userId);
  await cognito.send(new AdminUserGlobalSignOutCommand({ UserPoolId: poolId(), Username }));
  return toUser(row, target);
}

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const [row] = await queryAll<UserRow>({
    TableName: tables.users,
    IndexName: 'byEmail',
    KeyConditionExpression: 'email = :e',
    ExpressionAttributeValues: { ':e': normEmail(email) },
    Limit: 1,
  });
  return row;
}
