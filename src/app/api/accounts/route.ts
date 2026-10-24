import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { readBody } from '@/lib/http';
import { generatePassword, hashPassword } from '@/lib/passwords';
import { createAccount, listAccounts } from '@/lib/repo';
import { requireOwner } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireOwner();
  if ('response' in auth) return auth.response;
  return NextResponse.json({ accounts: listAccounts() });
}

const schema = z.object({ name: z.string().trim().min(1, 'give it a name').max(60) });

/** Creates an account with a generated password, returned this once only. */
export async function POST(request: NextRequest) {
  const auth = await requireOwner();
  if ('response' in auth) return auth.response;
  const body = await readBody(request, schema);
  if ('response' in body) return body.response;
  const password = generatePassword();
  const account = createAccount(body.data.name, await hashPassword(password));
  return NextResponse.json({ account, password }, { status: 201 });
}
