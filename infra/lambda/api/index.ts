import type { AppSyncResolverEvent } from 'aws-lambda';
import { UserError } from '../shared/db';
import type { Ctx, Role } from '../shared/types';
import * as users from './handlers/users';
import * as folders from './handlers/folders';
import * as lists from './handlers/lists';
import * as items from './handlers/items';
import * as recurring from './handlers/recurring';
import * as preview from './handlers/preview';
import * as senders from './handlers/senders';

type Handler = (ctx: Ctx, args: never) => Promise<unknown>;

// One Lambda behind every field: each operation needs a cross-table
// access check, so they share this code rather than being split up.
const handlers: Record<string, Handler> = {
  me: users.me,
  listUsers: users.listUsers,
  createUser: users.createUser,
  resetUserPassword: users.resetUserPassword,
  setUserEnabled: users.setUserEnabled,
  setUserRole: users.setUserRole,

  listFolders: folders.listFolders,
  createFolder: folders.createFolder,
  renameFolder: folders.renameFolder,
  deleteFolder: folders.deleteFolder,

  listLists: lists.listLists,
  listMembers: lists.listMembers,
  createList: lists.createList,
  renameList: lists.renameList,
  deleteList: lists.deleteList,
  moveList: lists.moveList,
  setListMailName: lists.setListMailName,
  shareList: lists.shareList,
  unshareList: lists.unshareList,

  listItems: items.listItems,
  listAgenda: items.listAgenda,
  listPriority: items.listPriority,
  createItem: items.createItem,
  updateItem: items.updateItem,
  setItemStatus: items.setItemStatus,
  moveItem: items.moveItem,
  deleteItem: items.deleteItem,
  addSubitem: items.addSubitem,
  setSubitemStatus: items.setSubitemStatus,
  deleteSubitem: items.deleteSubitem,

  linkPreview: preview.linkPreview,
  listSenderAddresses: senders.listSenderAddresses,
  addSenderAddress: senders.addSenderAddress,
  removeSenderAddress: senders.removeSenderAddress,
  mailDomain: async () => process.env.MAIL_DOMAIN ?? null,

  listRecurring: recurring.listRecurring,
  createRecurring: recurring.createRecurring,
  updateRecurring: recurring.updateRecurring,
  deleteRecurring: recurring.deleteRecurring,
};

function contextFrom(event: AppSyncResolverEvent<Record<string, unknown>>): Ctx {
  const identity = event.identity as { sub?: string; claims?: Record<string, unknown>; groups?: string[] | null } | null;
  const sub = identity?.sub;
  const email = identity?.claims?.email;
  if (!sub || typeof email !== 'string') throw new UserError('Not signed in.');
  const groups = identity?.groups ?? [];
  const role: Role = groups.includes('Admins') ? 'ADMIN' : groups.includes('Users') ? 'USER' : 'GUEST';
  return { userId: sub, email: email.toLowerCase(), role, isAdmin: role === 'ADMIN' };
}

export async function handler(event: AppSyncResolverEvent<Record<string, unknown>>): Promise<unknown> {
  const field = event.info.fieldName;
  const fn = handlers[field];
  if (!fn) throw new Error(`Unknown field ${field}`);
  const ctx = contextFrom(event);
  try {
    // Every request first makes sure the caller's user row and Inbox exist.
    if (field !== 'me') await users.ensureUser(ctx);
    return await (fn as (c: Ctx, a: unknown) => Promise<unknown>)(ctx, event.arguments);
  } catch (e) {
    if (!(e instanceof UserError)) console.error(field, e);
    // AppSync shows the message to the caller; hide internals.
    throw e instanceof UserError ? e : new Error('Something went wrong. Please try again.');
  }
}
