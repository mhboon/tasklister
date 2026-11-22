import type { UserType } from '@aws-sdk/client-cognito-identity-provider';

export interface ExportedUser {
  userId: string;
  email: string;
  role: 'ADMIN' | 'USER' | 'GUEST';
  enabled: boolean;
  /** Cognito's own status, e.g. CONFIRMED or FORCE_CHANGE_PASSWORD. */
  status: string;
  created: string | null;
}

const attr = (u: UserType, name: string) => u.Attributes?.find((a) => a.Name === name)?.Value;

/**
 * The people who may sign in, for the day's export. Passwords are not part of
 * it (Cognito never reveals them): after a loss, people are created again and
 * pick new passwords.
 */
export function buildUserExport(users: UserType[], adminIds: Set<string>, userIds: Set<string>): ExportedUser[] {
  return users
    .map((u) => {
      const userId = attr(u, 'sub') ?? '';
      return {
        userId,
        email: attr(u, 'email') ?? u.Username ?? '',
        role: adminIds.has(userId) ? 'ADMIN' : userIds.has(userId) ? 'USER' : 'GUEST',
        enabled: u.Enabled !== false,
        status: u.UserStatus ?? 'UNKNOWN',
        created: u.UserCreateDate ? u.UserCreateDate.toISOString() : null,
      } as ExportedUser;
    })
    .sort((a, b) => a.email.localeCompare(b.email));
}
