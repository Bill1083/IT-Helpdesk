import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { describeError, employeeMessage } from '@/lib/ai/engine';
import { jsonError, readBody } from '@/lib/http';
import { getOwnedProblem } from '@/lib/repo';
import { requireAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

const schema = z.object({ messageId: z.number().int().positive() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAccount();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  if (!getOwnedProblem(id, auth.account.id)) return jsonError('Problem not found.', 404);
  const body = await readBody(request, schema);
  if ('response' in body) return body.response;
  try {
    const text = await employeeMessage(id, body.data.messageId);
    return text ? NextResponse.json({ text }) : jsonError('Step not found.', 404);
  } catch (error) {
    return jsonError(describeError(error), 502);
  }
}
