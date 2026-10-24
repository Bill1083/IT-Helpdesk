/**
 * Who is signed in. The middleware only checks the cookie's signature (it runs
 * without database access); this also checks the account still exists and
 * hasn't been reset since, so a deleted or reset account is signed out at once.
 * Node only: route handlers and server components.
 */

import { cookies } from 'next/headers';

import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';
import { env } from '@/lib/env';
import { jsonError } from '@/lib/http';
import { getAccount } from '@/lib/repo';
import type { Account } from '@/lib/types';

export async function currentAccount(): Promise<Account | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(env.sessionSecret, token);
  if (!session) return null;
  const account = getAccount(session.accountId);
  return account && account.sessionVersion === session.version ? account : null;
}

/**
 * For API routes: the account, or a ready-made error response. Someone still
 * on a temporary password can do nothing until they choose their own.
 */
export async function requireAccount(): Promise<{ account: Account } | { response: Response }> {
  const account = await currentAccount();
  if (!account) return { response: jsonError('Not signed in.', 401) };
  if (account.mustChangePassword) return { response: jsonError('Create your own password first.', 403) };
  return { account };
}

/** For owner-only API routes (accounts, backups). */
export async function requireOwner(): Promise<{ account: Account } | { response: Response }> {
  const result = await requireAccount();
  if ('response' in result) return result;
  return result.account.isOwner ? result : { response: jsonError('Only the owner can do that.', 403) };
}
