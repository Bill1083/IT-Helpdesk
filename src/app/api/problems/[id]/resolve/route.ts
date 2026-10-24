import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { resolveProblem } from '@/lib/ai/engine';
import { jsonError, readBody } from '@/lib/http';
import { getOwnedProblem } from '@/lib/repo';
import { requireAccount } from '@/lib/session';
import { problemView } from '@/lib/views';

export const dynamic = 'force-dynamic';

const schema = z.object({
  note: z.string().max(5000).default(''),
  outcome: z.enum(['fixed', 'fixed_unknown', 'workaround', 'unresolved', 'done']).default('fixed'),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  if (!getOwnedProblem(id, auth.account.id)) return jsonError('Problem not found.', 404);
  const body = await readBody(request, schema);
  if ('response' in body) return body.response;
  const problem = await resolveProblem(id, body.data.note, body.data.outcome);
  if (!problem) return jsonError('Problem not found.', 404);
  return NextResponse.json(problemView(id, auth.account.id));
}
