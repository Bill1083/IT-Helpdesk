import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { SESSION_COOKIE, createSessionToken, passwordMatches, sessionCookieOptions } from '@/lib/auth';
import { env } from '@/lib/env';
import { jsonError, readBody } from '@/lib/http';
import { verifyPassword } from '@/lib/passwords';
import { OWNER_ID, getAccount, passwordAccounts, recordLogin } from '@/lib/repo';
import type { Account } from '@/lib/types';

export const dynamic = 'force-dynamic';

const schema = z.object({
  password: z.string().min(1).max(500),
  remember: z.boolean().default(false),
});

/**
 * Simple in-memory brake on guessing: 10 failures per 15 minutes per IP.
 * A public login endpoint gets found by scanners within days of going live
 * (certificate-transparency logs advertise new subdomains immediately), so
 * this is swept periodically rather than growing by one entry per IP forever.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; since: number }>();
let lastSweep = Date.now();

function pruneStaleFailures(now: number): void {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [ip, record] of failures) {
    if (now - record.since >= WINDOW_MS) failures.delete(ip);
  }
}

function clientIp(request: NextRequest): string {
  return request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

/** The password decides the account: the owner's lives in .env, the rest are hashed in the database. */
async function accountFor(password: string): Promise<Account | null> {
  const ownerPassword = env.appPassword;
  if (ownerPassword && (await passwordMatches(env.sessionSecret, password, ownerPassword))) return getAccount(OWNER_ID);
  for (const { account, hash } of passwordAccounts()) {
    if (await verifyPassword(password, hash)) return account;
  }
  return null;
}

export async function POST(request: NextRequest) {
  if (!env.appPassword) return jsonError('APP_PASSWORD is not set in .env on the server.', 500);

  const ip = clientIp(request);
  pruneStaleFailures(Date.now());
  const record = failures.get(ip);
  if (record && Date.now() - record.since < WINDOW_MS && record.count >= MAX_FAILURES) {
    return jsonError('Too many attempts. Wait 15 minutes and try again.', 429);
  }

  const body = await readBody(request, schema);
  if ('response' in body) return body.response;

  const account = await accountFor(body.data.password);
  if (!account) {
    const fresh = !record || Date.now() - record.since >= WINDOW_MS;
    failures.set(ip, { count: fresh ? 1 : record.count + 1, since: fresh ? Date.now() : record.since });
    await new Promise((resolve) => setTimeout(resolve, 600));
    return jsonError('Wrong password.', 401);
  }
  failures.delete(ip);
  recordLogin(account.id);

  const { token, session } = await createSessionToken(env.sessionSecret, body.data.remember, env.rememberDays, {
    id: account.id,
    version: account.sessionVersion,
  });
  const response = NextResponse.json({ ok: true });
  const https = request.headers.get('x-forwarded-proto') === 'https' || request.nextUrl.protocol === 'https:';
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(session, https));
  return response;
}
