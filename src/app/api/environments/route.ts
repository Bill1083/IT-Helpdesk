import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { readBody } from '@/lib/http';
import { createEnvironment, listEnvironments } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ environments: listEnvironments() });
}

const schema = z.object({
  name: z.string().trim().min(1, 'give it a name').max(80),
  profile: z.string().max(8000).default(''),
});

export async function POST(request: NextRequest) {
  const body = await readBody(request, schema);
  if ('response' in body) return body.response;
  const environment = createEnvironment(body.data.name, body.data.profile.trim());
  return NextResponse.json({ environment }, { status: 201 });
}
