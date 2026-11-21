import { config } from './config';
import { forceRefreshSession, getCurrentSession } from './auth';

export class GraphQLError extends Error {
  constructor(message: string, public readonly errors: unknown[]) {
    super(message);
  }
}

// The token is looked up per request (not read from React state): it
// expires hourly and timers are paused in background tabs / sleeping phones.
async function currentIdToken(): Promise<string> {
  const session = await getCurrentSession();
  if (!session) throw new GraphQLError('You are signed out.', []);
  return session.getIdToken().getJwtToken();
}

function send(idToken: string, query: string, variables?: Record<string, unknown>) {
  return fetch(config.appsyncUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: idToken },
    body: JSON.stringify({ query, variables }),
  });
}

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  let response = await send(await currentIdToken(), query, variables);
  // 401 = AppSync rejected the token itself; refresh and retry once (safe:
  // nothing ran).
  if (response.status === 401) {
    const refreshed = await forceRefreshSession().catch(() => null);
    if (refreshed) response = await send(refreshed.getIdToken().getJwtToken(), query, variables);
  }
  const body = await response.json();
  if (body.errors?.length) throw new GraphQLError(body.errors[0].message ?? 'Request failed', body.errors);
  return body.data as T;
}
