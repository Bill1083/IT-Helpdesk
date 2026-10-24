import { NextResponse, type NextRequest } from 'next/server';

import {
  RENEW_AFTER_MS,
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from '@/lib/auth';
import { env } from '@/lib/env';

// The install files are fetched without cookies, so they must be public too.
const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/health', '/icon.svg', '/manifest.webmanifest', '/sw.js']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isHttps(request: NextRequest): boolean {
  return request.headers.get('x-forwarded-proto') === 'https' || request.nextUrl.protocol === 'https:';
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Every state change comes from this app's own pages via fetch().
  if (!SAFE_METHODS.has(request.method) && request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'Cross-site requests are not accepted.' }, { status: 403 });
  }

  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith('/icons/')) return NextResponse.next();

  const session = await verifySessionToken(env.sessionSecret, request.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    const response = NextResponse.next();
    // Sliding expiry: a remembered session is pushed out again on use.
    if (session.remember && Date.now() - session.issuedAt > RENEW_AFTER_MS) {
      const renewed = await createSessionToken(env.sessionSecret, true, env.rememberDays, {
        id: session.accountId,
        version: session.version,
      });
      response.cookies.set(SESSION_COOKIE, renewed.token, sessionCookieOptions(renewed.session, isHttps(request)));
    }
    return response;
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  if (pathname !== '/') url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
