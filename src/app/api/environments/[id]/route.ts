import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { jsonError, readBody } from '@/lib/http';
import { deleteEnvironment, getOwnedEnvironment, updateEnvironment } from '@/lib/repo';
import { requireAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  name: z.string().trim().min(1, 'give it a name').max(80).optional(),
  profile: z.string().max(8000).optional(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  if (!getOwnedEnvironment(id, auth.account.id)) return jsonError('Environment not found.', 404);
  const body = await readBody(request, schema);
  if ('response' in body) return body.response;
  const environment = updateEnvironment(id, { name: body.data.name, profile: body.data.profile?.trim() });
  return NextResponse.json({ environment });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  if (!getOwnedEnvironment(id, auth.account.id)) return jsonError('Environment not found.', 404);
  deleteEnvironment(id);
  return NextResponse.json({ ok: true });
}
