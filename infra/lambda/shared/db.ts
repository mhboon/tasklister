import { randomBytes } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchGetCommand,
  BatchWriteCommand,
  type QueryCommandInput,
  type BatchGetCommandOutput,
  type BatchWriteCommandOutput,
} from '@aws-sdk/lib-dynamodb';

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const tables = {
  get users() { return env('USERS_TABLE'); },
  get folders() { return env('FOLDERS_TABLE'); },
  get lists() { return env('LISTS_TABLE'); },
  get members() { return env('MEMBERS_TABLE'); },
  get items() { return env('ITEMS_TABLE'); },
  get recurring() { return env('RECURRING_TABLE'); },
};

export const TIME_ZONE = process.env.TZ_NAME ?? 'Europe/Amsterdam';

/** Time-sortable, URL-safe id (creation order == lexical order). */
export function newId(): string {
  return `${Date.now().toString(36).padStart(9, '0')}${randomBytes(5).toString('hex')}`;
}

export const nowIso = () => new Date().toISOString();

export async function queryAll<T>(input: QueryCommandInput): Promise<T[]> {
  const out: T[] = [];
  let key: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({ ...input, ExclusiveStartKey: key }));
    out.push(...((res.Items ?? []) as T[]));
    key = res.LastEvaluatedKey;
  } while (key);
  return out;
}

export async function batchGet<T>(table: string, keys: Record<string, unknown>[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    let pending: Record<string, unknown>[] = keys.slice(i, i + 100);
    while (pending.length) {
      const res: BatchGetCommandOutput = await ddb.send(
        new BatchGetCommand({ RequestItems: { [table]: { Keys: pending } } })
      );
      out.push(...((res.Responses?.[table] ?? []) as T[]));
      pending = res.UnprocessedKeys?.[table]?.Keys ?? [];
    }
  }
  return out;
}

export async function batchDelete(table: string, keys: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 25) {
    let pending: Record<string, unknown>[] = keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } }));
    while (pending.length) {
      const res: BatchWriteCommandOutput = await ddb.send(
        new BatchWriteCommand({ RequestItems: { [table]: pending as never } })
      );
      pending = (res.UnprocessedItems?.[table] ?? []) as Record<string, unknown>[];
    }
  }
}

/** A user-facing error: its message is shown to the caller as-is. */
export class UserError extends Error {}
