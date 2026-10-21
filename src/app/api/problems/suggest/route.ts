import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { similarFromMatches } from '@/lib/ai/engine';
import { readBody } from '@/lib/http';
import { keywordMatches } from '@/lib/repo';

export const dynamic = 'force-dynamic';

const schema = z.object({ text: z.string().max(20_000) });

/** Live "possibly related" while typing: keyword search only, so it's free and instant. */
export async function POST(request: NextRequest) {
  const body = await readBody(request, schema);
  if ('response' in body) return body.response;
  const matches = keywordMatches(body.data.text, 3).map((m) => ({ id: m.id, score: 0 }));
  return NextResponse.json({ items: similarFromMatches(matches, { requireReason: false }) });
}
