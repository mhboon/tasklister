import {
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
  AuthenticationDetails,
} from 'amazon-cognito-identity-js';
import { config } from './config';

const userPool = new CognitoUserPool({
  UserPoolId: config.userPoolId,
  ClientId: config.userPoolClientId,
});

export type LoginResult =
  | { type: 'success'; session: CognitoUserSession }
  // An admin-issued temporary password: Cognito only lets it be used to
  // choose a real one, which also signs the user in.
  | { type: 'newPasswordRequired'; completeNewPassword: (newPassword: string) => Promise<CognitoUserSession> };

/** Email + password (USER_SRP_AUTH), the only sign-in flow. */
export function login(email: string, password: string): Promise<LoginResult> {
  const username = email.trim().toLowerCase();
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: username, Pool: userPool });
    cognitoUser.authenticateUser(new AuthenticationDetails({ Username: username, Password: password }), {
      onSuccess: (session) => resolve({ type: 'success', session }),
      onFailure: reject,
      newPasswordRequired: (attributes) => {
        // Read-only attributes can't be echoed back to the challenge.
        delete attributes.email_verified;
        delete attributes.email;
        resolve({
          type: 'newPasswordRequired',
          completeNewPassword: (newPassword) =>
            new Promise((res, rej) => {
              cognitoUser.completeNewPasswordChallenge(newPassword, attributes, { onSuccess: res, onFailure: rej });
            }),
        });
      },
    });
  });
}

export function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) return reject(new Error('Not signed in.'));
    cognitoUser.getSession((err: Error | null) => {
      if (err) return reject(err);
      cognitoUser.changePassword(oldPassword, newPassword, (e) => (e ? reject(e) : resolve()));
    });
  });
}

export function logout(): void {
  userPool.getCurrentUser()?.signOut();
}

export function getCurrentSession(): Promise<CognitoUserSession | null> {
  return new Promise((resolve, reject) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) return resolve(null);
    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) =>
      err ? reject(err) : resolve(session)
    );
  });
}

/** Exchanges the refresh token now, even if the cached tokens look valid. */
export function forceRefreshSession(): Promise<CognitoUserSession | null> {
  return new Promise((resolve, reject) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) return resolve(null);
    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) return reject(err ?? new Error('Not signed in.'));
      cognitoUser.refreshSession(session.getRefreshToken(), (e: Error | null, s: CognitoUserSession | null) =>
        e ? reject(e) : resolve(s)
      );
    });
  });
}

export interface AuthenticatedUser {
  email: string;
  idToken: string;
  role: 'ADMIN' | 'USER' | 'GUEST';
  isAdmin: boolean;
  /** Admins and users have a workspace of their own; guests only see shared lists. */
  canWork: boolean;
}

export function toAuthenticatedUser(session: CognitoUserSession): AuthenticatedUser {
  const token = session.getIdToken();
  const groups = (token.payload['cognito:groups'] as string[] | undefined) ?? [];
  const role = groups.includes('Admins') ? 'ADMIN' : groups.includes('Users') ? 'USER' : 'GUEST';
  return {
    email: token.payload['email'] as string,
    idToken: token.getJwtToken(),
    role,
    isAdmin: role === 'ADMIN',
    canWork: role !== 'GUEST',
  };
}
