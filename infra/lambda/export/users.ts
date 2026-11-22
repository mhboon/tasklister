import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersInGroupCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { buildUserExport } from '../shared/user-export';

const cognito = new CognitoIdentityProviderClient({});
const s3 = new S3Client({});

async function all(fetch: (token?: string) => Promise<{ items: UserType[]; next?: string }>): Promise<UserType[]> {
  const out: UserType[] = [];
  let token: string | undefined;
  do {
    const r = await fetch(token);
    out.push(...r.items);
    token = r.next;
  } while (token);
  return out;
}

const subs = (users: UserType[]) =>
  new Set(users.map((u) => u.Attributes?.find((a) => a.Name === 'sub')?.Value).filter((s): s is string => !!s));

/** Daily: writes everyone who may sign in (with their role) to the export bucket. */
export async function handler(): Promise<{ users: number; key: string }> {
  const UserPoolId = process.env.USER_POOL_ID;
  const Bucket = process.env.EXPORT_BUCKET;
  if (!UserPoolId || !Bucket) throw new Error('Missing USER_POOL_ID or EXPORT_BUCKET');

  const users = await all(async (t) => {
    const r = await cognito.send(new ListUsersCommand({ UserPoolId, PaginationToken: t }));
    return { items: r.Users ?? [], next: r.PaginationToken };
  });
  const group = (GroupName: string) =>
    all(async (t) => {
      const r = await cognito.send(new ListUsersInGroupCommand({ UserPoolId, GroupName, NextToken: t }));
      return { items: r.Users ?? [], next: r.NextToken };
    });
  const [admins, regular] = await Promise.all([group('Admins'), group('Users')]);

  const rows = buildUserExport(users, subs(admins), subs(regular));
  const day = new Date().toISOString().slice(0, 10);
  const key = `cognito-users/${day}.json`;
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key: key,
      ContentType: 'application/json',
      Body: JSON.stringify({ exportedAt: new Date().toISOString(), users: rows }, null, 2),
    })
  );
  return { users: rows.length, key };
}
