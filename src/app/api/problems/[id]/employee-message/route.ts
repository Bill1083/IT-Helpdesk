import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { describeError, employeeMessage } from '@/lib/ai/engine';
import { jsonError, readBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

const schema = z.object({ messageId: z.number().int().positive() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readBody(request, schema);
  if ('response' in body) return body.response;
  try {
    const text = await employeeMessage(id, body.data.messageId);
    return text ? NextResponse.json({ text }) : jsonError('Step not found.', 404);
  } catch (error) {
    return jsonError(describeError(error), 502);
  }
}
