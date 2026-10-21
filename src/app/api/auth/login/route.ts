import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { SESSION_COOKIE, createSessionToken, passwordMatches, sessionCookieOptions } from '@/lib/auth';
import { env } from '@/lib/env';
import { jsonError, readBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

const schema = z.object({
  password: z.string().min(1).max(500),
  remember: z.boolean().default(false),
});

/** Simple in-memory brake on guessing: 10 failures per 15 minutes per IP. */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, { count: number; since: number }>();

function clientIp(request: NextRequest): string {
  return request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

export async function POST(request: NextRequest) {
  const expected = env.appPassword;
  if (!expected) return jsonError('APP_PASSWORD is not set in .env on the server.', 500);

  const ip = clientIp(request);
  const record = failures.get(ip);
  if (record && Date.now() - record.since < WINDOW_MS && record.count >= MAX_FAILURES) {
    return jsonError('Too many attempts. Wait 15 minutes and try again.', 429);
  }

  const body = await readBody(request, schema);
  if ('response' in body) return body.response;

  if (!(await passwordMatches(env.sessionSecret, body.data.password, expected))) {
    const fresh = !record || Date.now() - record.since >= WINDOW_MS;
    failures.set(ip, { count: fresh ? 1 : record.count + 1, since: fresh ? Date.now() : record.since });
    await new Promise((resolve) => setTimeout(resolve, 600));
    return jsonError('Wrong password.', 401);
  }
  failures.delete(ip);

  const { token, session } = await createSessionToken(env.sessionSecret, body.data.remember, env.rememberDays);
  const response = NextResponse.json({ ok: true });
  const https = request.headers.get('x-forwarded-proto') === 'https' || request.nextUrl.protocol === 'https:';
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(session, https));
  return response;
}
