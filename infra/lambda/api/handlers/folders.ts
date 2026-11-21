import { GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables, newId, queryAll, UserError } from '../../shared/db';
import { requireUser } from '../../shared/access';
import { compareText } from '../../shared/text';
import { cleanName } from '../../shared/validate';
import type { Ctx, FolderRow, MemberRow } from '../../shared/types';

const dto = (f: FolderRow) => ({ folderId: f.folderId, name: f.name });

export async function requireFolder(ctx: Ctx, folderId: string): Promise<FolderRow> {
  const f = (await ddb.send(new GetCommand({ TableName: tables.folders, Key: { ownerId: ctx.userId, folderId } })))
    .Item as FolderRow | undefined;
  if (!f) throw new UserError('Folder not found.');
  return f;
}

export async function listFolders(ctx: Ctx) {
  const rows = await queryAll<FolderRow>({
    TableName: tables.folders,
    KeyConditionExpression: 'ownerId = :o',
    ExpressionAttributeValues: { ':o': ctx.userId },
  });
  return rows.sort((a, b) => compareText(a.name, b.name)).map(dto);
}

export async function createFolder(ctx: Ctx, args: { name: string }) {
  requireUser(ctx);
  const row: FolderRow = { ownerId: ctx.userId, folderId: newId(), name: cleanName(args.name, 'Folder name') };
  await ddb.send(new PutCommand({ TableName: tables.folders, Item: row }));
  return dto(row);
}

export async function renameFolder(ctx: Ctx, args: { folderId: string; name: string }) {
  requireUser(ctx);
  const f = await requireFolder(ctx, args.folderId);
  const name = cleanName(args.name, 'Folder name');
  await ddb.send(
    new UpdateCommand({
      TableName: tables.folders,
      Key: { ownerId: ctx.userId, folderId: f.folderId },
      UpdateExpression: 'SET #n = :n',
      ExpressionAttributeNames: { '#n': 'name' },
      ExpressionAttributeValues: { ':n': name },
    })
  );
  return dto({ ...f, name });
}

/** Lists inside the folder fall back to the root; nothing else is deleted. */
export async function deleteFolder(ctx: Ctx, args: { folderId: string }) {
  requireUser(ctx);
  await requireFolder(ctx, args.folderId);
  const memberships = await queryAll<MemberRow>({
    TableName: tables.members,
    KeyConditionExpression: 'userId = :u',
    FilterExpression: 'folderId = :f',
    ExpressionAttributeValues: { ':u': ctx.userId, ':f': args.folderId },
  });
  await Promise.all(
    memberships.map((m) =>
      ddb.send(
        new UpdateCommand({
          TableName: tables.members,
          Key: { userId: m.userId, listId: m.listId },
          UpdateExpression: 'REMOVE folderId',
        })
      )
    )
  );
  await ddb.send(new DeleteCommand({ TableName: tables.folders, Key: { ownerId: ctx.userId, folderId: args.folderId } }));
  return true;
}
