import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { SESSION_COOKIE, createSessionToken, passwordMatches, sessionCookieOptions, verifySessionToken } from '@/lib/auth';
import { env } from '@/lib/env';
import { jsonError, readBody } from '@/lib/http';
import { hashPassword, verifyPassword } from '@/lib/passwords';
import { getPasswordHash, passwordAccounts, setAccountPassword } from '@/lib/repo';
import { currentAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

const schema = z.object({
  /** Not needed right after signing in with a temporary password. */
  current: z.string().max(500).optional(),
  password: z.string().min(10, 'use at least 10 characters').max(200),
});

/**
 * The uniqueness check below could otherwise be used to test guesses at
 * other people's passwords, so attempts are limited per account.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; since: number }>();

function tooMany(accountId: string): boolean {
  const record = attempts.get(accountId);
  const now = Date.now();
  if (!record || now - record.since >= WINDOW_MS) {
    attempts.set(accountId, { count: 1, since: now });
    return false;
  }
  record.count += 1;
  return record.count > MAX_ATTEMPTS;
}

/** Someone choosing their own password (after a temporary one, or any time later). */
export async function POST(request: NextRequest) {
  const account = await currentAccount();
  if (!account) return jsonError('Not signed in.', 401);
  if (account.isOwner) return jsonError("Your password is APP_PASSWORD in the server's .env.");
  if (tooMany(account.id)) return jsonError('Too many attempts. Wait 15 minutes and try again.', 429);

  const body = await readBody(request, schema);
  if ('response' in body) return body.response;
  const { current, password } = body.data;
  const ownHash = getPasswordHash(account.id);
  if (!ownHash) return jsonError('Account not found.', 404);

  // Changing it later needs the current one; right after a temporary one it doesn't.
  if (!account.mustChangePassword && !(current && (await verifyPassword(current, ownHash)))) {
    return jsonError('Your current password is wrong.', 400);
  }
  if (await verifyPassword(password, ownHash)) {
    return jsonError(account.mustChangePassword ? 'Choose a new password, not the one you were given.' : "That's your current password.");
  }
  // A password is what identifies an account, so no two can share one.
  const taken =
    (env.appPassword && (await passwordMatches(env.sessionSecret, password, env.appPassword))) ||
    (await Promise.all(passwordAccounts().filter((p) => p.account.id !== account.id).map((p) => verifyPassword(password, p.hash)))).some(Boolean);
  if (taken) return jsonError("That password can't be used. Choose a different one.");

  const updated = setAccountPassword(account.id, await hashPassword(password), { temporary: false });
  if (!updated) return jsonError('Account not found.', 404);
  attempts.delete(account.id);

  // The version bump signs out every other device; keep this one signed in.
  const previous = await verifySessionToken(env.sessionSecret, (await cookies()).get(SESSION_COOKIE)?.value);
  const { token, session } = await createSessionToken(env.sessionSecret, previous?.remember ?? false, env.rememberDays, {
    id: updated.id,
    version: updated.sessionVersion,
  });
  const response = NextResponse.json({ ok: true });
  const https = request.headers.get('x-forwarded-proto') === 'https' || request.nextUrl.protocol === 'https:';
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(session, https));
  return response;
}
