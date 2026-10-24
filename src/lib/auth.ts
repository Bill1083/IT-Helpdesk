/**
 * Password sessions.
 *
 * The cookie is `<base64url payload>.<hex hmac>`. Web Crypto only, so the same
 * code runs in the Edge middleware and in Node route handlers.
 */

export const SESSION_COOKIE = 'ithd_session';

/** Without "Remember me" the cookie dies with the browser, and the token after this. */
export const SHORT_SESSION_MS = 12 * 60 * 60 * 1000;

/** Remembered sessions are re-issued at most this often (sliding expiry). */
export const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

export interface Session {
  issuedAt: number;
  expiresAt: number;
  remember: boolean;
  accountId: string;
  /** Must match the account's current version (a reset bumps it). */
  version: number;
}

const encoder = new TextEncoder();

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toBase64Url(text: string): string {
  let binary = '';
  for (const byte of encoder.encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string | null {
  try {
    const normalised = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalised + '='.repeat((4 - (normalised.length % 4)) % 4));
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** Constant-time comparison for equal-length strings. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Compare a submitted password without leaking its length through timing. */
export async function passwordMatches(secret: string, submitted: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([hmac(secret, `pw:${submitted}`), hmac(secret, `pw:${expected}`)]);
  return safeEqual(a, b);
}

export async function createSessionToken(
  secret: string,
  remember: boolean,
  rememberDays: number,
  account: { id: string; version: number },
  now = Date.now(),
): Promise<{ token: string; session: Session }> {
  const lifetime = remember ? rememberDays * 24 * 60 * 60 * 1000 : SHORT_SESSION_MS;
  const session: Session = { issuedAt: now, expiresAt: now + lifetime, remember, accountId: account.id, version: account.version };
  const payload = toBase64Url(
    JSON.stringify({ i: session.issuedAt, e: session.expiresAt, r: remember ? 1 : 0, a: account.id, v: account.version }),
  );
  return { token: `${payload}.${await hmac(secret, payload)}`, session };
}

export async function verifySessionToken(
  secret: string,
  token: string | undefined,
  now = Date.now(),
): Promise<Session | null> {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, await hmac(secret, payload))) return null;
  const json = fromBase64Url(payload);
  if (!json) return null;
  try {
    const data = JSON.parse(json) as { i?: unknown; e?: unknown; r?: unknown; a?: unknown; v?: unknown };
    if (typeof data.i !== 'number' || typeof data.e !== 'number') return null;
    if (data.e <= now) return null;
    return {
      issuedAt: data.i,
      expiresAt: data.e,
      remember: data.r === 1,
      // Cookies from before accounts existed belong to the owner.
      accountId: typeof data.a === 'string' ? data.a : 'owner',
      version: typeof data.v === 'number' ? data.v : 1,
    };
  } catch {
    return null;
  }
}

/** Cookie options shared by login and the middleware's sliding renewal. */
export function sessionCookieOptions(session: Session, secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    // A session cookie (no maxAge) unless the user ticked "Remember me".
    ...(session.remember ? { maxAge: Math.floor((session.expiresAt - Date.now()) / 1000) } : {}),
  };
}
