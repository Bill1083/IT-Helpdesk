import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { jsonError, readBody } from '@/lib/http';
import { MODE_KEYS } from '@/lib/modes';
import { deleteProblem, getOwnedEnvironment, getOwnedProblem, updateProblem } from '@/lib/repo';
import { requireAccount } from '@/lib/session';
import { problemView } from '@/lib/views';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  const view = problemView((await params).id, auth.account.id);
  return view ? NextResponse.json(view) : jsonError('Problem not found.', 404);
}

const patchSchema = z.object({
  title: z.string().trim().max(120).optional(),
  reporter: z.string().trim().max(120).optional(),
  status: z.literal('open').optional(),
  environmentId: z.string().max(40).nullable().optional(),
  mode: z.enum(MODE_KEYS).optional(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  if (!getOwnedProblem(id, auth.account.id)) return jsonError('Problem not found.', 404);
  const body = await readBody(request, patchSchema);
  if ('response' in body) return body.response;
  const { title, reporter, status, environmentId, mode } = body.data;
  if (environmentId && !getOwnedEnvironment(environmentId, auth.account.id)) return jsonError('That environment no longer exists.');
  const problem = updateProblem(id, {
    title: title === undefined ? undefined : title || null,
    reporter: reporter === undefined ? undefined : reporter || null,
    environmentId,
    // A mode the admin picks sticks; the classifier stops guessing.
    ...(mode ? { mode, modeLocked: true } : {}),
    ...(status === 'open' ? { status: 'open' as const, resolvedAt: null } : {}),
  });
  return NextResponse.json({ problem });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  if (!getOwnedProblem(id, auth.account.id)) return jsonError('Problem not found.', 404);
  deleteProblem(id);
  return NextResponse.json({ ok: true });
}
