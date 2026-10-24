import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { jsonError, readBody } from '@/lib/http';
import { deleteAccount, getAccount, renameAccount } from '@/lib/repo';
import { requireOwner } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const schema = z.object({ name: z.string().trim().min(1, 'give it a name').max(60) });

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireOwner();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  if (!getAccount(id)) return jsonError('Account not found.', 404);
  const body = await readBody(request, schema);
  if ('response' in body) return body.response;
  return NextResponse.json({ account: renameAccount(id, body.data.name) });
}

/** Deletes the account and all of its chats, environments and commands. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireOwner();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const account = getAccount(id);
  if (!account) return jsonError('Account not found.', 404);
  if (account.isOwner) return jsonError("The owner account can't be deleted.");
  deleteAccount(id);
  return NextResponse.json({ ok: true });
}
