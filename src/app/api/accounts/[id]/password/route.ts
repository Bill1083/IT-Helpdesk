import { NextResponse, type NextRequest } from 'next/server';

import { jsonError } from '@/lib/http';
import { generatePassword, hashPassword } from '@/lib/passwords';
import { getAccount, setAccountPassword } from '@/lib/repo';
import { requireOwner } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * A new temporary password, returned this once only. The old one stops
 * working, the account is signed out everywhere, and on the next sign-in
 * they are asked to choose their own.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOwner();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const account = getAccount(id);
  if (!account) return jsonError('Account not found.', 404);
  if (account.isOwner) return jsonError("The owner's password is APP_PASSWORD in the server's .env.");
  const password = generatePassword();
  setAccountPassword(id, await hashPassword(password), { temporary: true });
  return NextResponse.json({ password });
}
