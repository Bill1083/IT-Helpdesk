import { NextResponse, type NextRequest } from 'next/server';

import { jsonError } from '@/lib/http';
import { deleteCommand } from '@/lib/repo';
import { requireAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !deleteCommand(id, auth.account.id)) return jsonError('Command not found.', 404);
  return NextResponse.json({ ok: true });
}
